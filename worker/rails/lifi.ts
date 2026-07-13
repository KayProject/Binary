// LI.FI advanced-route execution — carries three legs:
//   fast-rail deposit:  Celo USDm → Polygon USDC.e (Squid, one call, ~66–90 s)
//   cheap-rail convert: Polygon USDT → USDC.e (same-chain swap, 0.14%)
//   withdrawal bridge:  Polygon USDC.e → Celo USDm (Squid, 66 s, 0.23%)
// Ported from phase0/scripts/08. Squid legs carry ~0.54 POL native fee — the
// operator EOA must hold POL.
import { ethers } from "ethers";
import { providers, operator } from "../lib/env";

const LIFI = "https://li.quest/v1";

async function lifi(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${LIFI}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`LI.FI ${path}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function ensureAllowance(
  signer: ethers.Wallet,
  token: string,
  spender: string,
  amount: ethers.BigNumber
) {
  const erc20 = new ethers.Contract(
    token,
    [
      "function allowance(address, address) view returns (uint256)",
      "function approve(address, uint256) returns (bool)",
    ],
    signer
  );
  const current: ethers.BigNumber = await erc20.allowance(signer.address, spender);
  if (current.gte(amount)) return;
  await (await erc20.approve(spender, amount)).wait();
}

async function executeStep(step: any): Promise<string> {
  const chainId: number = step.action.fromChainId;
  const signer = operator(providers[chainId]);

  const withTx = await lifi("/advanced/stepTransaction", {
    method: "POST",
    body: JSON.stringify(step),
  });
  const req = withTx.transactionRequest;
  if (!req) throw new Error(`No transactionRequest on step ${step.tool}`);

  if (step.action.fromToken.address !== ethers.constants.AddressZero) {
    await ensureAllowance(
      signer,
      step.action.fromToken.address,
      step.estimate.approvalAddress,
      ethers.BigNumber.from(step.action.fromAmount)
    );
  }

  const tx = await signer.sendTransaction({
    to: req.to,
    data: req.data,
    value: req.value ? ethers.BigNumber.from(req.value) : undefined,
    gasLimit: req.gasLimit ? ethers.BigNumber.from(req.gasLimit) : undefined,
  });
  await tx.wait();

  // Cross-chain steps: poll bridge status until the destination side lands.
  if (step.action.fromChainId !== step.action.toChainId) {
    const t0 = Date.now();
    for (;;) {
      await new Promise((r) => setTimeout(r, 10_000));
      const status = await lifi(
        `/status?bridge=${step.tool}&fromChain=${step.action.fromChainId}` +
          `&toChain=${step.action.toChainId}&txHash=${tx.hash}`
      ).catch(() => ({ status: "PENDING" }));
      if (status.status === "DONE") break;
      if (status.status === "FAILED") throw new Error(`Bridge ${step.tool} reported FAILED (${tx.hash})`);
      if (Date.now() - t0 > 30 * 60_000) throw new Error(`Bridge timed out after 30 min (${tx.hash})`);
    }
  }
  return tx.hash;
}

export interface LifiLeg {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  amount: bigint; // in fromToken decimals
}

/** Execute the best LI.FI route for a leg; returns the destination-balance delta. */
export async function executeLifiLeg(
  leg: LifiLeg
): Promise<{ txHash: string; amountOut: bigint }> {
  const eoa = operator().address;
  const { routes } = await lifi("/advanced/routes", {
    method: "POST",
    body: JSON.stringify({
      fromChainId: leg.fromChainId,
      toChainId: leg.toChainId,
      fromTokenAddress: leg.fromToken,
      toTokenAddress: leg.toToken,
      fromAmount: leg.amount.toString(),
      fromAddress: eoa,
      toAddress: eoa,
      options: { allowSwitchChain: true, slippage: 0.01 },
    }),
  });
  const route = routes?.[0];
  if (!route) throw new Error("No LI.FI route available");

  const destToken = new ethers.Contract(
    leg.toToken,
    ["function balanceOf(address) view returns (uint256)"],
    providers[leg.toChainId]
  );
  const before: ethers.BigNumber = await destToken.balanceOf(eoa);

  let txHash = "";
  for (const step of route.steps) txHash = await executeStep(step);

  const after: ethers.BigNumber = await destToken.balanceOf(eoa);
  return { txHash, amountOut: after.sub(before).toBigInt() };
}
