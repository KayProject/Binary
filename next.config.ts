import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only broker deps (ethers v5 stack) — keep them out of the bundler.
  serverExternalPackages: ["@polymarket/clob-client-v2", "ethers"],

  // Market artwork comes from Gamma, which serves it from one S3 bucket.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "polymarket-upload.s3.us-east-2.amazonaws.com",
      },
    ],
  },
};

export default nextConfig;
