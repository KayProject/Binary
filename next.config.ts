import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only broker deps (ethers v5 stack) — keep them out of the bundler.
  serverExternalPackages: ["@polymarket/clob-client-v2", "ethers"],
};

export default nextConfig;
