import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, drive, isTerminal } from "./machine";
import { net } from "./netting";
import type { DepositJob, WithdrawalJob } from "./types";

const now = Date.now();
const dep = (over: Partial<DepositJob> = {}): DepositJob => ({
  kind: "deposit",
  id: "42220:0xabc:0",
  user: "0xAlice",
  amountUsdm: 20n * 10n ** 18n,
  state: "RECEIVED",
  attempts: 0,
  createdAt: now,
  updatedAt: now,
  legs: {},
  ...over,
});
const wd = (over: Partial<WithdrawalJob> = {}): WithdrawalJob => ({
  kind: "withdrawal",
  id: "137:0xdef:0",
  user: "0xBob",
  amountUsdc: 20n * 10n ** 6n,
  state: "REQUESTED",
  attempts: 0,
  createdAt: now,
  updatedAt: now,
  legs: {},
  ...over,
});

test("deposit walks the full bridge path", async () => {
  const order: string[] = [];
  const executors = {
    RECEIVED: async () => ({ next: "SWAPPED" }),
    SWAPPED: async () => ({ next: "BRIDGED_HOP1", leg: { txHash: "0x1" } }),
    BRIDGED_HOP1: async () => ({ next: "BRIDGED_HOP2" }),
    BRIDGED_HOP2: async () => ({ next: "CONVERTED" }),
    CONVERTED: async () => ({ next: "CREDITED" }),
  };
  const final = await drive(dep(), executors as never, async (j) => {
    order.push(j.state);,
  });
  assert.equal(final.state, "CREDITED");
  assert.deepEqual(order, ["SWAPPED", "BRIDGED_HOP1", "BRIDGED_HOP2", "CONVERTED", "CREDITED"]);
  assert.equal(final.legs.BRIDGED_HOP1?.txHash, "0x1");
  assert.ok(isTerminal(final));
});

test("deposit walks the fast rail", async () => {
  const executors = {
    RECEIVED: async () => ({ next: "BRIDGED_FAST", leg: { txHash: "0x2" } }),
    BRIDGED_FAST: async () => ({ next: "CREDITED" }),
  };
  const final = await drive(dep(), executors as never, async () => {});
  assert.equal(final.state, "CREDITED");
  assert.equal(final.legs.BRIDGED_FAST?.txHash, "0x2");
});

test("withdrawal walks unwrap → bridge → paid", async () => {
  const executors = {
    REQUESTED: async () => ({ next: "UNWRAPPED" }),
    UNWRAPPED: async () => ({ next: "BRIDGED", leg: { txHash: "0x3" } }),
    BRIDGED: async () => ({ next: "PAID" }),
  };
  const final = await drive(wd(), executors as never, async () => {});
  assert.equal(final.state, "PAID");
  assert.equal(final.legs.BRIDGED?.txHash, "0x3");
});

test("illegal transition throws", async () => {
  const bad = { RECEIVED: async () => ({ next: "CREDITED" }) };
  await assert.rejects(
    () => advance(dep(), bad as never),
    /no executor|illegal transition/
  );
});

test("failing executor retries then parks in FAILED", async () => {
  const boom = { RECEIVED: async () => { throw new Error("rpc down"); } };
  let job = dep();
  for (let i = 0; i < 4; i++) {
    job = await advance(job, boom as never);
    assert.equal(job.state, "RECEIVED");
    assert.equal(job.attempts, i + 1);
  }
  job = await advance(job, boom as never);
  assert.equal(job.state, "FAILED");
  assert.match(job.error!, /rpc down/);
});

test("terminal jobs are never re-executed", async () => {
  const spy = { CREDITED: async () => { throw new Error("must not run"); } };
  const job = await advance(dep({ state: "CREDITED" }), spy as never);
  assert.equal(job.state, "CREDITED");
});

test("netting matches opposing flows within tolerance", () => {
  const d = dep();
  const w = wd({ amountUsdc: 20_020_000n }); // +0.1% — inside 0.2% tolerance
  const r = net([d], [w]);
  assert.equal(r.matches.length, 1);
  assert.equal(r.residualDeposits.length, 0);
  assert.equal(r.residualWithdrawals.length, 0);
});

test("netting rejects self-matches and out-of-tolerance amounts", () => {
  const selfW = wd({ user: "0xAlice" });
  const bigW = wd({ id: "137:0xbig:0", amountUsdc: 25n * 10n ** 6n });
  const r = net([dep()], [selfW, bigW]);
  assert.equal(r.matches.length, 0);
  assert.equal(r.residualDeposits.length, 1);
  assert.equal(r.residualWithdrawals.length, 2);
});

test("netting is FIFO and leaves in-flight jobs alone", () => {
  const oldDep = dep({ id: "42220:0xold:0", createdAt: now - 1000 });
  const newDep = dep({ id: "42220:0xnew:0", user: "0xCarol" });
  const inFlight = dep({ id: "42220:0xmid:0", state: "SWAPPED" });
  const w = wd();
  const r = net([newDep, inFlight, oldDep], [w]);
  assert.equal(r.matches[0].depositId, "42220:0xold:0"); // oldest wins
  assert.equal(r.matches.length, 1);
  assert.ok(r.residualDeposits.some((j) => j.id === "42220:0xmid:0"));
});
