// Step 12 — migrate to the V2 deposit-wallet flow. The CLOB now rejects new
// type-2 Safe makers ("maker address not allowed"); orders must come from an
// EIP-1271 deposit wallet (signatureType 3) owned by the EOA. This script:
//   1. deploys the deposit wallet (gasless, WALLET-CREATE)
//   2. moves the Safe's pUSD into it (gasless Safe batch)
//   3. sets pUSD + CTF approvals from the deposit wallet (gasless wallet batch)
//
//   npm run 12
import { ethers } from "ethers";
import {
  DepositWalletCall,
  OperationType,
  RelayerTransactionState,
  SafeTransaction,
} from "@polymarket/builder-relayer-client";
import { loadState, saveState, recordTiming, polygonProvider } from "../lib/env";
import { makeRelayClient, liveContractConfig } from "../lib/clients";

const erc20 = new ethers.utils.Interface([
  "function approve(address spender, uint256 amount)",
  "function transfer(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
]);
const erc1155 = new ethers.utils.Interface([
  "function setApprovalForAll(address operator, bool approved)",
]);

async function main() {
  const state = loadState();
  if (!state.safe) throw new Error("Run `npm run 01` first");
  const cfg = liveContractConfig() as ReturnType<typeof liveContractConfig> & {
    exchangeV2?: string;
    negRiskExchangeV2?: string;
    exchangeV3?: string;
  };
  const relay = makeRelayClient();

  // 1. Deploy (idempotent — derive first, deploy only if empty).
  const depositWallet = await relay.deriveDepositWalletAddress();
  console.log("Deposit wallet:", depositWallet);
  const code = await polygonProvider.getCode(depositWallet);
  if (code === "0x") {
    const t0 = Date.now();
    const resp = await relay.deployDepositWallet();
    const ok = await relay.pollUntilState(
      resp.transactionID,
      [RelayerTransactionState.STATE_MINED, RelayerTransactionState.STATE_CONFIRMED],
      RelayerTransactionState.STATE_FAILED,
      60,
      3000
    );
    if (!ok) throw new Error("Deposit wallet deploy failed");
    recordTiming("deposit_wallet_deploy", Date.now() - t0);
  } else {
    console.log("Already deployed.");
  }
  saveState({ depositWallet });

  // 2. Move the Safe's pUSD into the deposit wallet.
  const pusd = new ethers.Contract(cfg.collateral, erc20, polygonProvider);
  const safeBal: ethers.BigNumber = await pusd.balanceOf(state.safe);
  if (safeBal.gt(0)) {
    console.log(`Moving $${ethers.utils.formatUnits(safeBal, 6)} pUSD Safe → deposit wallet...`);
    const txns: SafeTransaction[] = [
      {
        to: cfg.collateral,
        operation: OperationType.Call,
        data: erc20.encodeFunctionData("transfer", [depositWallet, safeBal]),
        value: "0",
      },
    ];
    const resp = await relay.execute(txns, "binary-phase0-fund-deposit-wallet");
    const ok = await relay.pollUntilState(
      resp.transactionID,
      [RelayerTransactionState.STATE_MINED, RelayerTransactionState.STATE_CONFIRMED],
      RelayerTransactionState.STATE_FAILED,
      60,
      3000
    );
    if (!ok) throw new Error("pUSD move failed");
  }

  // 3. Approvals from the deposit wallet — V2+ contracts only; the relayer
  // allowlist blocks the retired V1 exchanges for deposit wallets.
  const spenders = [
    cfg.conditionalTokens,
    cfg.negRiskAdapter,
    cfg.exchangeV2,
    cfg.negRiskExchangeV2,
    cfg.exchangeV3,
  ].filter((a): a is string => !!a);
  const operators = [
    cfg.negRiskAdapter,
    cfg.exchangeV2,
    cfg.negRiskExchangeV2,
    // exchangeV3 is allowed as a pUSD spender but blocked as a CTF operator
  ].filter((a): a is string => !!a);

  const calls: DepositWalletCall[] = [
    ...spenders.map((s) => ({
      target: cfg.collateral,
      value: "0",
      data: erc20.encodeFunctionData("approve", [s, ethers.constants.MaxUint256]),
    })),
    ...operators.map((o) => ({
      target: cfg.conditionalTokens,
      value: "0",
      data: erc1155.encodeFunctionData("setApprovalForAll", [o, true]),
    })),
  ];
  const deadline = Math.floor(Date.now() / 1000 + 3600).toString();
  const t1 = Date.now();
  const resp = await relay.executeDepositWalletBatch(calls, depositWallet, deadline);
  const ok = await relay.pollUntilState(
    resp.transactionID,
    [RelayerTransactionState.STATE_MINED, RelayerTransactionState.STATE_CONFIRMED],
    RelayerTransactionState.STATE_FAILED,
    60,
    3000
  );
  if (!ok) throw new Error("Deposit wallet approvals failed");
  recordTiming("deposit_wallet_approvals", Date.now() - t1);

  const bal: ethers.BigNumber = await pusd.balanceOf(depositWallet);
  console.log(`✓ Deposit wallet ready — pUSD: $${ethers.utils.formatUnits(bal, 6)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
