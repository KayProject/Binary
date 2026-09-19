import type { Metadata } from "next";
import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two families.
 *
 * General Sans carries the display type: a wide geometric grotesque with a double-storey
 * `a`, which holds its shape at the sizes the headline runs at. Self-hosted rather than
 * pulled at runtime, so the page owes nothing to a third party to render its own
 * headline. See `src/fonts/LICENSE.md`.
 *
 * JetBrains Mono is here for one job: prices and payouts, where a column of figures that
 * does not align is a bug. The previous build pointed --font-mono at the sans face, so
 * every "mono" figure on the site was proportional.
 */
const generalSans = localFont({
  variable: "--font-general-sans",
  display: "swap",
  src: [
    { path: "../fonts/GeneralSans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/GeneralSans-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/GeneralSans-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/GeneralSans-700.woff2", weight: "700", style: "normal" },
  ],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Binary — every question has two sides",
  description:
    "The mobile prediction market for the Mento Dollar. Back your view with USDm — powered by Polymarket liquidity, built on Celo.",
  icons: {
    icon: "/Binary.png",
    apple: "/Binary.png",
  },
  other: {
    "talentapp:project_verification":
      "1abf44901d62338803bb518dc03af92b416190deac1656db85166c0d6dd4f25af17e389a791742adf1ce02c134c802fe38a43f0c1c27788624ab2624576aa275",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${generalSans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-plane text-ink">{children}</body>
    </html>
  );
}
