// pUSD on/offramp legs (both rails end here; withdrawals start here).
//   wrap:   operator EOA's USDC.e → pUSD minted straight into the deposit
//           wallet (onramp pulls from caller; EOA pays POL gas).
//   unwrap: deposit wallet's pUSD → USDC.e at the operator EOA, gasless via a
//           relayer deposit-wallet batch. Ported from phase0/scripts/11+13.
import { ethers } from "ethers";
import {
  DepositWalletCall,
  RelayerTransactionState,
} from "@polymarket/builder-relayer-client";
import { AssetType } from "@polymarket/clob-client-v2";
import { ADDR, polygonProvider, operator, depositWallet } from "../lib/env";
import { liveContractConfig, makeRelayClient, makeClobClient } from "../lib/clients";

const erc20 = new ethers.utils.Interface([
  "function approve(address spender, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
]);
const onramp = new ethers.utils.Interface([
  "function wrap(address _asset, address _to, uint256 _amount)",
]);
const offramp = new ethers.utils.Interface([
  "function unwrap(address _asset, address _to, uint256 _amount)",
]);

/** Wrap `amount` USDC.e (6 dec) from the operator EOA into the deposit wallet as pUSD. */
export async function wrapToDepositWallet(amount: bigint): Promise<{ txHash: string }> {
  const signer = operator(polygonProvider);
  const wallet = depositWallet();
  const amt = ethers.BigNumber.from(amount);

  const usdce = new ethers.Contract(ADDR.usdcePolygon, erc20, signer);
  const bal: ethers.BigNumber = await usdce.balanceOf(signer.address);
  if (bal.lt(amt)) throw new Error(`EOA USDC.e ${bal} < ${amt}`);

  const allowance = await new ethers.Contract(
    ADDR.usdcePolygon,
    ["function allowance(address, address) view returns (uint256)"],
    polygonProvider
  ).allowance(signer.address, ADDR.collateralOnramp);
  if (allowance.lt(amt)) {
    await (await usdce.approve(ADDR.collateralOnramp, ethers.constants.MaxUint256)).wait();
  }

  const ramp = new ethers.Contract(ADDR.collateralOnramp, onramp, signer);
  const tx = await ramp.wrap(ADDR.usdcePolygon, wallet, amt);
  await tx.wait();

  // Let the CLOB see the new balance so orders don't bounce.
  await makeClobClient().updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  return { txHash: tx.hash };
}

/** Unwrap `amount` pUSD (6 dec) from the deposit wallet to USDC.e at the operator EOA. */
export async function unwrapToOperator(amount: bigint): Promise<{ txHash: string }> {
  const wallet = depositWallet();
  const eoa = operator().address;
  const collateral = liveContractConfig().collateral;
  const amt = ethers.BigNumber.from(amount);

  const pusd = new ethers.Contract(collateral, erc20, polygonProvider);
  const bal: ethers.BigNumber = await pusd.balanceOf(wallet);
  if (bal.lt(amt)) throw new Error(`deposit wallet pUSD ${bal} < ${amt}`);

  const calls: DepositWalletCall[] = [
    {
      target: collateral,
      value: "0",
      data: erc20.encodeFunctionData("approve", [ADDR.collateralOfframp, amt]),
    },
    {
      target: ADDR.collateralOfframp,
      value: "0",
      data: offramp.encodeFunctionData("unwrap", [ADDR.usdcePolygon, eoa, amt]),
    },
  ];

  const relay = makeRelayClient();
  const deadline = Math.floor(Date.now() / 1000 + 3600).toString();
  const resp = await relay.executeDepositWalletBatch(calls, wallet, deadline);
  const ok = await relay.pollUntilState(
    resp.transactionID,
    [RelayerTransactionState.STATE_MINED, RelayerTransactionState.STATE_CONFIRMED],
    RelayerTransactionState.STATE_FAILED,
    60,
    3000
  );
  if (!ok) throw new Error("Unwrap batch failed or timed out");
  return { txHash: resp.transactionID };
}
