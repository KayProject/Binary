import Link from "next/link";
import DeltaHero from "@/components/delta/DeltaHero";
import StatBar from "@/components/delta/StatBar";
import FavouriteTrap from "@/components/delta/FavouriteTrap";
import Bento from "@/components/delta/Bento";
import Handshake from "@/components/delta/Handshake";
import DeadEnds from "@/components/delta/DeadEnds";
import { DeltaMark, Panel, Reveal, SectionLabel } from "@/components/delta/ui";

// Spacing is deliberately uneven. The thesis and the trap get the most air
// because they carry the argument; the proof band is tight and dense so it
// reads as instrumentation rather than as another content section.

export default function DeltaPage() {
  return (
    <main className="mx-auto w-full max-w-md px-6 sm:max-w-2xl lg:max-w-6xl lg:px-10">
      <header className="relative z-20 flex items-center justify-between py-6">
        <DeltaMark />
        <Link
          href="/"
          className="rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-fog transition-colors hover:bg-white/[0.05] hover:text-ice"
        >
          Binary ↗
        </Link>
      </header>

      <DeltaHero />

      {/* Proof — tight band, no card chrome */}
      <section className="border-y border-white/[0.06]">
        <StatBar />
      </section>

      {/* Thesis — the most air on the page */}
      <section id="thesis" className="pt-32 lg:pt-52">
        <Reveal>
          <SectionLabel index="01">The trap most agents fall into</SectionLabel>
        </Reveal>
        <Reveal delay={0.06}>
          <h2 className="mt-7 max-w-3xl text-4xl font-extrabold leading-[1.03] tracking-[-0.035em] lg:text-[4.2rem]">
            Being right is not
            <br />
            the same as
            <span className="text-fog"> making money.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mt-7 max-w-lg text-lg text-ice/65">
            Every prediction agent pitches accuracy. Accuracy is free — you can
            buy as much of it as you like, at a price. Drag the dial and watch
            what it pays.
          </p>
        </Reveal>
        <Reveal delay={0.16} className="mt-14">
          <FavouriteTrap />
        </Reveal>
      </section>

      {/* Answer — bento, tighter above than the thesis */}
      <section className="pt-28 lg:pt-40">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Reveal>
              <SectionLabel index="02">What Delta optimises instead</SectionLabel>
            </Reveal>
            <Reveal delay={0.06}>
              <h2 className="mt-7 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-[-0.035em] lg:text-6xl">
                Edge is knowing something the price doesn&apos;t.
              </h2>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <p className="max-w-xs text-sm leading-relaxed text-ice/60">
              So Delta trades rarely, holds to resolution, and sells its
              measurements — never its position.
            </p>
          </Reveal>
        </div>
        <Reveal delay={0.14} className="mt-12">
          <Bento />
        </Reveal>
      </section>

      {/* x402 — sequence */}
      <section className="pt-28 lg:pt-40">
        <Reveal>
          <SectionLabel index="03">Why this is DeFAI and not a chatbot</SectionLabel>
        </Reveal>
        <Reveal delay={0.06}>
          <h2 className="mt-7 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-[-0.035em] lg:text-6xl">
            Delta is a paying customer
            <span className="text-fog"> of a financial API.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.12} className="mt-12">
          <Handshake />
        </Reveal>
      </section>

      {/* Graveyard */}
      <section className="pt-28 lg:pt-40">
        <Reveal>
          <SectionLabel index="04">Four strategies that did not survive</SectionLabel>
        </Reveal>
        <Reveal delay={0.06}>
          <h2 className="mt-7 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-[-0.035em] lg:text-6xl">
            The graveyard is the credential.
          </h2>
        </Reveal>
        <Reveal delay={0.12} className="mt-12">
          <DeadEnds />
        </Reveal>
      </section>

      {/* Close */}
      <section className="pt-28 lg:pt-40">
        <Reveal>
          <Panel glow className="px-8 py-16 text-center lg:px-16 lg:py-24">
            <h2 className="mx-auto max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-[-0.035em] lg:text-6xl">
              You don&apos;t have to
              <br />
              believe this page.
            </h2>
            <p className="mx-auto mt-6 max-w-md text-ice/65">
              Delta appends{" "}
              <span className="font-mono text-act-soft">celo_22480bd47654</span>{" "}
              to everything it signs. The whole economic history is
              reconstructible from Celo, without trusting a word of this.
            </p>
            <Link
              href="/app"
              className="mt-10 inline-block rounded-full bg-act px-9 py-4 font-semibold text-white transition-transform duration-300 hover:scale-[1.03] active:scale-95"
            >
              Open Binary →
            </Link>
          </Panel>
        </Reveal>
      </section>

      {/* Terms */}
      <section className="mt-28 border-t border-white/[0.06] pt-12">
        <SectionLabel index="05">Terms &amp; conditions</SectionLabel>
        <div className="mt-8 grid gap-x-12 gap-y-6 text-sm leading-relaxed text-ice/60 lg:grid-cols-2">
          <p>
            Delta is experimental software operating with its own capital on
            Celo mainnet. Nothing on this page is financial advice, an offer, or
            a solicitation to buy or sell anything. Prediction markets carry
            risk of total loss.
          </p>
          <p>
            Figures shown are read live from public on-chain attribution data
            and may lag or briefly disagree with the chain. Past volume is a
            record of activity, not a projection of returns, and no outcome is
            promised or guaranteed.
          </p>
          <p>
            Availability is not guaranteed. Markets, fees and routing may change
            without notice, and access may be restricted where prediction
            markets are not permitted. You are responsible for compliance in
            your own jurisdiction.
          </p>
          <p>
            Transactions on Celo are irreversible. You remain responsible for
            your own wallet and keys — neither Binary nor Delta can recover
            funds sent in error or access lost credentials on your behalf.
          </p>
        </div>
      </section>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] py-10 font-mono text-[10px] uppercase tracking-[0.16em] text-fog">
        <span>Delta · 0xC2A4…74E9 · Celo mainnet</span>
        <span>Binary © {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}
