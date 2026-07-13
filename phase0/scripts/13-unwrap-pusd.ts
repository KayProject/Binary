// Step 13 — withdrawal leg 1: unwrap the deposit wallet's pUSD back to USDC.e.
// CollateralOfframp (source: Polymarket/ctf-exchange-v2) burns the caller's
// pUSD and sends the asset to _to — we point _to at the EOA so the bridge leg
// can run from there. Gasless via a deposit-wallet relayer batch.
//
//   npm run 13            unwraps the full pUSD balance to the EOA
//   npm run 13 -- 1.25    unwraps a specific amount
import { ethers } from "ethers";
import {
  DepositWalletCall,
  RelayerTransactionState,
} from "@polymarket/builder-relayer-client";
import { loadState, recordTiming, polygonProvider, spikeSigner } from "../lib/env";
import { makeRelayClient, liveContractConfig } from "../lib/clients";

const COLLATERAL_OFFRAMP = "0x2957922Eb93258b93368531d39fAcCA3B4dC5854";
const USDCE = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const erc20 = new ethers.utils.Interface([
  "function approve(address spender, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
]);
const offramp = new ethers.utils.Interface([
  "function unwrap(address _asset, address _to, uint256 _amount)",
]);

async function main() {
  const state = loadState();
  if (!state.depositWallet) throw new Error("Run `npm run 12` first");
  const eoa = spikeSigner().address;
  const cfg = liveContractConfig();

  const pusd = new ethers.Contract(cfg.collateral, erc20, polygonProvider);
  const balance: ethers.BigNumber = await pusd.balanceOf(state.depositWallet);
  const amount = process.argv[2] ? ethers.utils.parseUnits(process.argv[2], 6) : balance;
  console.log(
    `Deposit wallet pUSD: $${ethers.utils.formatUnits(balance, 6)} — unwrapping $${ethers.utils.formatUnits(amount, 6)} → USDC.e to EOA ${eoa}`
  );
  if (balance.isZero() || balance.lt(amount)) throw new Error("Not enough pUSD");

  const calls: DepositWalletCall[] = [
    {
      target: cfg.collateral,
      value: "0",
      data: erc20.encodeFunctionData("approve", [COLLATERAL_OFFRAMP, amount]),
    },
    {
      target: COLLATERAL_OFFRAMP,
      value: "0",
      data: offramp.encodeFunctionData("unwrap", [USDCE, eoa, amount]),
    },
  ];

  const relay = makeRelayClient();
  const deadline = Math.floor(Date.now() / 1000 + 3600).toString();
  const t0 = Date.now();
  const resp = await relay.executeDepositWalletBatch(calls, state.depositWallet, deadline);
  const ok = await relay.pollUntilState(
    resp.transactionID,
    [RelayerTransactionState.STATE_MINED, RelayerTransactionState.STATE_CONFIRMED],
    RelayerTransactionState.STATE_FAILED,
    60,
    3000
  );
  if (!ok) throw new Error("Unwrap batch failed or timed out");
  recordTiming("unwrap_pusd", Date.now() - t0);

  const usdce = new ethers.Contract(USDCE, erc20, polygonProvider);
  const out: ethers.BigNumber = await usdce.balanceOf(eoa);
  console.log(`✓ EOA USDC.e: $${ethers.utils.formatUnits(out, 6)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
