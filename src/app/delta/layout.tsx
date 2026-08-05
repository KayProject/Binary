import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delta — the agent Binary is built around",
  description:
    "Delta trades on Binary's rails and pays for its own market data over x402. #1 of 54 by tagged volume on Celo's agentic attribution leaderboard.",
};

// Delta gets the Midnight Settlement palette rather than the consumer blue:
// the agent should not look like the app it trades on. Δ stays a mark — the
// logo lockup and the Δ=0 identity — never the name in running text.
export default function DeltaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh flex-1 bg-mid text-ice [&_*::selection]:bg-act [&_*::selection]:text-ice">
      {children}
    </div>
  );
}
