// Step 9 — REAL MONEY. The USDT0 (Tether/LayerZero) deposit rail, found after
// ruling out CCTP (Celo isn't a domain) and aggregators (LI.FI doesn't
// integrate USDT0; its best route was Allbridge at 0.35–0.62% and ~22 min).
//
// Verified on-chain 2026-07-10:
//   Celo Legacy Mesh OFT  0xf10E1610…b243 (eid 30125) — 0.03% fee, ~$0.07 LZ msg
//   Arbitrum hub OFT      0x14E4A1B1…8D92 (eid 30110) — hop 2 is 0%, ~$0.08 LZ msg
//   Polygon USDT0 OFT     0x6BA10300…9e13 (eid 30109)
// Hub-and-spoke: Celo→Polygon has no direct peer; route via Arbitrum.
//
//   npm run 09 -- hop1 <usd>   Celo USDT → Arbitrum USDT   (needs CELO for the msg fee)
//   npm run 09 -- hop2 <usd>   Arbitrum USDT → Polygon USDT (needs a little ETH on Arb)
//
// Each hop is timed; this is the number the funded-balance UX depends on.
import { ethers } from "ethers";
import { spikeSigner, celoProvider, polygonProvider, recordTiming } from "../lib/env";

const OFT_ABI = [
  "function token() view returns (address)",
  "function approvalRequired() view returns (bool)",
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
    label: "Celo → Arbitrum (Legacy Mesh, 0.03%)",
    oft: "0xf10E161027410128E63E75D0200Fb6d34b2db243",
    dstEid: 30110,
    srcProvider: () => celoProvider(),
    dstProvider: () => new ethers.providers.JsonRpcProvider("https://arb1.arbitrum.io/rpc"),
    dstToken: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // Arbitrum USDT
  },
  hop2: {
    label: "Arbitrum → Polygon (USDT0, 0%)",
    oft: "0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92",
    dstEid: 30109,
    srcProvider: () => new ethers.providers.JsonRpcProvider("https://arb1.arbitrum.io/rpc"),
    dstProvider: () => polygonProvider,
    dstToken: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // Polygon USDT
  },
} as const;

async function main() {
  const [hopName, usdArg] = process.argv.slice(2);
  const hop = HOPS[hopName as keyof typeof HOPS];
  if (!hop) throw new Error("Usage: npm run 09 -- hop1|hop2 <usd>");
  const amountLD = ethers.utils.parseUnits(usdArg || "5", 6);

  const signer = spikeSigner(hop.srcProvider());
  const oft = new ethers.Contract(hop.oft, OFT_ABI, signer);
  const srcToken = new ethers.Contract(await oft.token(), ERC20_ABI, signer);
  const dstToken = new ethers.Contract(hop.dstToken, ERC20_ABI, hop.dstProvider());

  const srcBal: ethers.BigNumber = await srcToken.balanceOf(signer.address);
  console.log(`${hop.label}\nUSDT balance on source: $${ethers.utils.formatUnits(srcBal, 6)}`);
  if (srcBal.lt(amountLD)) throw new Error("Insufficient USDT on source chain");

  const sendParam = {
    dstEid: hop.dstEid,
    to: ethers.utils.hexZeroPad(signer.address, 32),
    amountLD,
    minAmountLD: 0,
    extraOptions: "0x",
    composeMsg: "0x",
    oftCmd: "0x",
  };
  const [, , receipt] = await oft.quoteOFT(sendParam);
  sendParam.minAmountLD = receipt.amountReceivedLD;
  const fee = await oft.quoteSend(sendParam, false);
  console.log(
    `Will send $${ethers.utils.formatUnits(receipt.amountSentLD, 6)} → ` +
      `receive $${ethers.utils.formatUnits(receipt.amountReceivedLD, 6)} | ` +
      `LZ msg fee ${ethers.utils.formatEther(fee.nativeFee)} native`
  );

  if (await oft.approvalRequired().catch(() => true)) {
    const allowance: ethers.BigNumber = await srcToken.allowance(signer.address, hop.oft);
    if (allowance.lt(amountLD)) {
      console.log("Approving OFT adapter...");
      await (await srcToken.approve(hop.oft, ethers.constants.MaxUint256)).wait();
    }
  }

  const dstBefore: ethers.BigNumber = await dstToken.balanceOf(signer.address);
  const t0 = Date.now();
  const tx = await oft.send(sendParam, { nativeFee: fee.nativeFee, lzTokenFee: 0 }, signer.address, {
    value: fee.nativeFee,
  });
  console.log(`Sent: ${tx.hash}`);
  await tx.wait();
  console.log("Source tx mined; waiting for destination mint", "");

  for (;;) {
    await new Promise((r) => setTimeout(r, 10_000));
    const now: ethers.BigNumber = await dstToken.balanceOf(signer.address).catch(() => dstBefore);
    process.stdout.write(".");
    if (now.gt(dstBefore)) {
      const ms = Date.now() - t0;
      console.log(
        `\n✓ Arrived: +$${ethers.utils.formatUnits(now.sub(dstBefore), 6)} in ${(ms / 1000).toFixed(0)}s`
      );
      recordTiming(`usdt0_${hopName}`, ms);
      return;
    }
    if (Date.now() - t0 > 30 * 60_000) throw new Error("Timed out after 30 min — check LayerZero scan");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
