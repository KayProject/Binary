// Cheap-rail bridge: USDT0 (Tether/LayerZero) hub-and-spoke via Arbitrum.
// hop1 Celo → Arbitrum (0.03%, ~23 s) · hop2 Arbitrum → Polygon (0%, ~19 min —
// which is why this rail is bulk-only). Ported from phase0/scripts/09.
import { ethers } from "ethers";
import {
  ADDR,
  celoProvider,
  arbitrumProvider,
  polygonProvider,
  operator,
} from "../lib/env";

const OFT_ABI = [
  "function token() view returns (address)",
  "function quoteSend((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, bool payInLzToken) view returns ((uint256 nativeFee, uint256 lzTokenFee))",
  "function quoteOFT((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam) view returns ((uint256 minAmountLD, uint256 maxAmountLD), (int256 feeAmountLD, string description)[], (uint256 amountSentLD, uint256 amountReceivedLD))",
  "function send((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, (uint256 nativeFee, uint256 lzTokenFee) fee, address refundAddress) payable returns ((bytes32 guid, uint64 nonce, (uint256 nativeFee, uint256 lzTokenFee) fee), (uint256 amountSentLD, uint256 amountReceivedLD))",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
];

const HOPS = {
  hop1: {
    oft: "0xf10E161027410128E63E75D0200Fb6d34b2db243", // Celo Legacy Mesh OFT
    dstEid: 30110,
    srcProvider: () => celoProvider,
    dstProvider: () => arbitrumProvider,
    dstToken: ADDR.usdtArbitrum,
    txOverrides: {},
  },
  hop2: {
    oft: "0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92", // Arbitrum hub OFT
    dstEid: 30109,
    srcProvider: () => arbitrumProvider,
    dstProvider: () => polygonProvider,
    dstToken: ADDR.usdtPolygon,
    // ethers v5 defaults to a 1.5 gwei priority fee; on Arbitrum that inflates
    // the affordability check ~100x and makes estimateGas "revert" on a lightly
    // funded EOA. Pin honest Arbitrum gas instead.
    txOverrides: {
      gasLimit: 600_000,
      maxFeePerGas: ethers.utils.parseUnits("0.1", "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits("0.01", "gwei"),
    },
  },
} as const;

/** Send `amount` USDT (6 dec) across one mesh hop and wait for the destination mint. */
export async function usdt0Hop(
  hopName: keyof typeof HOPS,
  amount: bigint
): Promise<{ txHash: string; amountOut: bigint }> {
  const hop = HOPS[hopName];
  const signer = operator(hop.srcProvider());
  const oft = new ethers.Contract(hop.oft, OFT_ABI, signer);
  const srcToken = new ethers.Contract(await oft.token(), ERC20_ABI, signer);
  const dstToken = new ethers.Contract(hop.dstToken, ERC20_ABI, hop.dstProvider());
  const amountLD = ethers.BigNumber.from(amount);

  const srcBal: ethers.BigNumber = await srcToken.balanceOf(signer.address);
  if (srcBal.lt(amountLD)) throw new Error(`${hopName}: source USDT ${srcBal} < ${amountLD}`);

  const sendParam = {
    dstEid: hop.dstEid,
    to: ethers.utils.hexZeroPad(signer.address, 32),
    amountLD,
    minAmountLD: ethers.BigNumber.from(0),
    extraOptions: "0x",
    composeMsg: "0x",
    oftCmd: "0x",
  };
  const [, , receipt] = await oft.quoteOFT(sendParam);
  sendParam.minAmountLD = receipt.amountReceivedLD;
  const fee = await oft.quoteSend(sendParam, false);

  // Don't trust approvalRequired() — the Arbitrum hub returns false yet still
  // pulls via transferFrom (verified 2026-07-13).
  const allowance: ethers.BigNumber = await srcToken.allowance(signer.address, hop.oft);
  if (allowance.lt(amountLD)) {
    await (await srcToken.approve(hop.oft, ethers.constants.MaxUint256)).wait();
  }

  const dstBefore: ethers.BigNumber = await dstToken.balanceOf(signer.address);
  const t0 = Date.now();
  const tx = await oft.send(
    sendParam,
    { nativeFee: fee.nativeFee, lzTokenFee: 0 },
    signer.address,
    { value: fee.nativeFee, ...hop.txOverrides }
  );
  await tx.wait();

  for (;;) {
    await new Promise((r) => setTimeout(r, 10_000));
    const now: ethers.BigNumber = await dstToken
      .balanceOf(signer.address)
      .catch(() => dstBefore);
    if (now.gt(dstBefore)) return { txHash: tx.hash, amountOut: now.sub(dstBefore).toBigInt() };
    if (Date.now() - t0 > 30 * 60_000)
      throw new Error(`${hopName} timed out after 30 min — check LayerZero scan (${tx.hash})`);
  }
}
