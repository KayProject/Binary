import type { Metadata } from "next";
import { Bricolage_Grotesque, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

// Brand face: Bricolage Grotesque carries the whole UI (its optical-size axis
// holds up from body text to display). Spline Sans Mono shares its warm,
// rounded character — it takes every number: odds, prices, payouts.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const splineMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Binary — every question has two sides",
  description:
    "The mobile prediction market for the Mento Dollar. Back your view with USDm — powered by Polymarket liquidity, built on Celo.",
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
      className={`${bricolage.variable} ${splineMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
