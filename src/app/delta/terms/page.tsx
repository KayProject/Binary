import type { Metadata } from "next";
import Link from "next/link";
import { DeltaMark, SectionLabel } from "@/components/delta/ui";

export const metadata: Metadata = {
  title: "Terms & Conditions — Delta",
  description:
    "Terms governing use of Delta and Binary: eligibility, risk, no advice, data accuracy, availability and liability.",
};

const UPDATED = "5 August 2026";

const SECTIONS: Array<{ h: string; p: string[] }> = [
  {
    h: "1 · Eligibility and legal age",
    p: [
      "You must be at least 18 years old to use Delta or Binary. Where the jurisdiction you are accessing from sets a higher minimum age for prediction markets, betting, or financial services, that higher age applies to you instead.",
      "By using this site or the application you represent that you meet that age requirement, that you are acting on your own behalf, and that you are not accessing the service from a jurisdiction in which prediction markets or the products described here are prohibited or restricted.",
      "We may restrict or withdraw access where we believe these conditions are not met. Access is not offered where it would be unlawful.",
    ],
  },
  {
    h: "2 · No financial advice",
    p: [
      "Nothing on this site, in the application, or returned by any endpoint is financial, investment, legal, or tax advice, nor an offer or solicitation to buy or sell any instrument.",
      "Delta is experimental software operating with its own capital. Its behaviour, its positions, and any measurements it publishes are descriptive of what it did, not a recommendation that you do the same.",
    ],
  },
  {
    h: "3 · Risk",
    p: [
      "Prediction markets carry the risk of total loss of the amount staked. Outcomes are uncertain by definition and a position may resolve to zero.",
      "Past volume, historical activity, or any figure describing what has already happened is a record, not a projection. No return is promised, implied, or guaranteed, and no strategy described here is represented as profitable.",
    ],
  },
  {
    h: "4 · Data and figures",
    p: [
      "Figures shown are read live from public on-chain attribution data and third-party sources. They may lag, be cached, be temporarily unavailable, or briefly disagree with the underlying chain.",
      "Where a figure cannot be read, we prefer to show it as unavailable rather than as zero. Nevertheless no figure on this site should be treated as an audited or authoritative statement of account.",
    ],
  },
  {
    h: "5 · On-chain transactions",
    p: [
      "Transactions settled on Celo are irreversible. Once broadcast and confirmed they cannot be recalled, reversed, or amended by us.",
      "You remain solely responsible for your wallet, your keys, and the addresses you transact with. Neither Binary nor Delta can recover funds sent in error, funds sent to the wrong address, or credentials that you lose. Value sent directly to a contract outside the documented deposit path may be unrecoverable.",
    ],
  },
  {
    h: "6 · Availability and changes",
    p: [
      "The service is provided on an as-is and as-available basis. Availability, uptime, and continuity are not guaranteed, and the service may be suspended or discontinued at any time.",
      "Markets, fees, routing, limits, and the behaviour of the agent may change without notice. Continued use after a change constitutes acceptance of it.",
    ],
  },
  {
    h: "7 · Liability",
    p: [
      "To the fullest extent permitted by law, we exclude liability for loss of profit, loss of opportunity, loss of data, and for any indirect or consequential loss arising from use of the service.",
      "Nothing in these terms excludes liability that cannot lawfully be excluded.",
    ],
  },
  {
    h: "8 · Your responsibility",
    p: [
      "You are responsible for compliance with the laws that apply to you, including any tax obligations arising from your activity.",
      "If you do not accept these terms, do not use the service.",
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-md px-6 sm:max-w-2xl lg:max-w-3xl lg:px-10">
      <header className="flex items-center justify-between py-6">
        <Link href="/delta">
          <DeltaMark />
        </Link>
        <Link
          href="/delta"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-fog transition-colors hover:text-ice"
        >
          ← Back
        </Link>
      </header>

      <div className="pt-14 lg:pt-24">
        <SectionLabel index="§">Legal</SectionLabel>
        <h1 className="mt-7 text-4xl font-extrabold leading-[1.05] tracking-[-0.035em] lg:text-6xl">
          Terms &amp; conditions
        </h1>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-fog">
          Last updated {UPDATED}
        </p>

        <div className="mt-6 rounded-2xl bg-lose/[0.07] p-5 ring-1 ring-inset ring-lose/20">
          <p className="text-sm leading-relaxed text-ice/85">
            <strong className="text-ice">You must be 18 or older</strong> — or
            the higher minimum age set where you are — to use Delta or Binary.
            Prediction markets carry the risk of losing everything you stake.
          </p>
        </div>
      </div>

      <div className="mt-16 space-y-12 pb-24">
        {SECTIONS.map((s) => (
          <section key={s.h}>
            <h2 className="text-xl font-bold tracking-tight text-ice">{s.h}</h2>
            <div className="mt-4 space-y-4">
              {s.p.map((para, i) => (
                <p key={i} className="leading-relaxed text-ice/70">
                  {para}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] py-10 font-mono text-[10px] uppercase tracking-[0.16em] text-fog">
        <span>Delta · 0xC2A4…74E9 · Celo mainnet</span>
        <span>Binary © {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}
