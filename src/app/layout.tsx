import type { Metadata } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const getBricolageFont = () => {
  return Bricolage_Grotesque({
    variable: "--font-bricolage",
    subsets: ["latin"],
  });
};

const bricolage = getBricolageFont();

export const metadata: Metadata = {
  title: "Binary — every question has two sides",
  description:
    "The mobile prediction market for the Mento Dollar. Back your view with USDm — powered by Polymarket liquidity, built on Celo.\