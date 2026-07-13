// Step 11 — wrap the Safe's USDC.e into pUSD via Polymarket's CollateralOnramp.
// Post-V2 (April 28, 2026) the CLOB settles in pUSD (0xC011a7E1…2DFB), backed
// 1:1 by USDC; the onramp pulls the asset from the caller, so the Safe batches
// [approve USDC.e → onramp, wrap(USDC.e, safe, amount)] gasless via the relayer.
//
//   npm run 11            wraps the Safe's full USDC.e balance
//   npm run 11 -- 1.25    wraps a specific amount
import { ethers } from "ethers";
import {
  OperationType,
  RelayerTransactionState,
  SafeTransaction,
} from "@polymarket/builder-relayer-client";
import { loadState, recordTiming, polygonProvider } from "../lib/env";
import { makeRelayClient, liveContractConfig } from "../lib/clients";

const COLLATERAL_ONRAMP = "0x93070a847efEf7F70739046A929D47a521F5B8ee";
const USDCE = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const erc20 = new ethers.utils.Interface([
  "function approve(address spender, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
]);
const onramp = new ethers.utils.Interface([
  "function wrap(address _asset, address _to, uint256 _amount)",
]);

async function main() {
  const state = loadState();
  if (!state.safe) throw new Error("Run `npm run 01` first");
  const usdArg = process.argv[2];

  const usdce = new ethers.Contract(USDCE, erc20, polygonProvider);
  const balance: ethers.BigNumber = await usdce.balanceOf(state.safe);
  const amount = usdArg ? ethers.utils.parseUnits(usdArg, 6) : balance;
  console.log(
    `Safe USDC.e: $${ethers.utils.formatUnits(balance, 6)} — wrapping $${ethers.utils.formatUnits(amount, 6)}`
  );
  if (balance.isZero() || balance.lt(amount)) throw new Error("Not enough USDC.e in the Safe");

  const txns: SafeTransaction[] = [
    {
      to: USDCE,
      operation: OperationType.Call,
      data: erc20.encodeFunctionData("approve", [COLLATERAL_ONRAMP, amount]),
      value: "0",
    },
    {
      to: COLLATERAL_ONRAMP,
      operation: OperationType.Call,
      data: onramp.encodeFunctionData("wrap", [USDCE, state.safe, amount]),
      value: "0",
    },
  ];

  const relay = makeRelayClient();
  const t0 = Date.now();
  const response = await relay.execute(txns, "binary-phase0-wrap-pusd");
  const result = await relay.pollUntilState(
    response.transactionID,
    [RelayerTransactionState.STATE_MINED, RelayerTransactionState.STATE_CONFIRMED],
    RelayerTransactionState.STATE_FAILED,
    60,
    3000
  );
  if (!result) throw new Error("Wrap batch failed or timed out");
  recordTiming("wrap_pusd", Date.now() - t0);

  const pusd = new ethers.Contract(liveContractConfig().collateral, erc20, polygonProvider);
  const pusdBal: ethers.BigNumber = await pusd.balanceOf(state.safe);
  console.log(`✓ Safe pUSD balance: $${ethers.utils.formatUnits(pusdBal, 6)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
