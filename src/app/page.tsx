import Image from "next/image";
import WorldMap from "@/components/WorldMap";
import { LandingNav } from "@/components/site/nav";
import { MarketTiles } from "@/components/site/market-tiles";
import { SiteFooter } from "@/components/site/footer";
import { fetchFeed } from "@/lib/polymarket/gamma";
import type { Market } from "@/lib/polymarket/types";

/**
 * The landing page, in two bands.
 *
 * It opens light, with a centred headline framed by scattered market tiles, then cuts to
 * the dark ground the rest of the product runs on and stays there. Every price on this
 * page is fetched at request time — the previous build shipped three invented markets
 * with invented odds, which is the one thing a prediction market cannot put on its front
 * page.
 */
export const revalidate = 60;

export default async function Home() {
  const markets = await topMarkets();

  return (
    <>
      <LandingNav />

      <div className="act-light dotgrid dotgrid-light">
        <Hero markets={markets} />
      </div>

      <div className="dotgrid dotgrid-dark bg-plane">
        <Markets markets={markets} />
        <Liquidity />
        <HowItWorks />
        <Close />
        <SiteFooter />
      </div>
    </>
  );
}

/**
 * The feed, or nothing.
 *
 * A failed fetch renders a page without prices rather than a page with placeholder
 * prices. Every section below is written to hold its shape when the list is empty.
 */
async function topMarkets(): Promise<Market[]> {
  try {
    return await fetchFeed(8);
  } catch {
    return [];
  }
}

/* ── Light band ───────────────────────────────────────────────────────────────────── */

function Hero({ markets }: { markets: Market[] }) {
  return (
    <section
      // A minimum height at every width. The tiles are absolutely positioned and take no
      // space of their own, so without this the hero collapses to the height of its text
      // on a phone and the lower tiles land on whatever follows. `overflow-hidden` below
      // lg because two tiles bleed past the edge on purpose, and a bleed that extends the
      // document scrolls the whole page sideways on a phone.
      className="relative mx-auto min-h-[42rem] w-full max-w-7xl overflow-hidden px-6 pb-32 pt-28 sm:min-h-[40rem] sm:px-10 sm:pb-36 sm:pt-6 lg:min-h-[44rem] lg:overflow-visible lg:pb-44"
    >
      <MarketTiles markets={markets} />

      <div className="relative z-10 mx-auto max-w-[17rem] text-center sm:max-w-md lg:max-w-2xl">
        <h1 className="mx-auto text-[clamp(2rem,6.4vw,4.75rem)] font-bold leading-[1.02] tracking-[-0.035em] text-ink lg:leading-[0.98]">
          Every question
          <br />
          has two sides
        </h1>

        <p className="mx-auto mt-7 max-w-[26rem] text-[13px] leading-[1.65] text-ink-2">
          The prediction market built for the Mento Dollar. Back a view with USDm, priced
          against Polymarket liquidity and settled on Celo. Binary routes the order and
          never takes the other side of it.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/app"
            className="rounded-full bg-ink px-7 py-3.5 text-sm font-medium text-plane transition-opacity hover:opacity-85"
          >
            Open the app
          </a>
          <a
            href="#markets"
            className="rounded-full border border-edge px-7 py-3.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            See live markets
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── Dark band ────────────────────────────────────────────────────────────────────── */

function Band({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-7xl px-6 sm:px-10">{children}</div>
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">{children}</p>
  );
}

function Heading({ children, centered = false }: { children: React.ReactNode; centered?: boolean }) {
  return (
    <h2
      className={`mt-5 max-w-3xl text-[clamp(1.9rem,3.6vw,3rem)] font-bold leading-[1.03] tracking-[-0.03em] ${
        centered ? "mx-auto text-center" : ""
      }`}
    >
      {children}
    </h2>
  );
}

const CARD_GROUNDS = ["bg-tile-vermillion", "bg-tile-indigo", "bg-tile-chartreuse"] as const;

function Markets({ markets }: { markets: Market[] }) {
  const cards = markets.slice(0, 3);

  return (
    <Band id="markets">
      <Eyebrow>Live right now</Eyebrow>
      <Heading>Three of the markets open this minute.</Heading>

      {cards.length === 0 ? (
        <p className="mt-10 max-w-prose text-base leading-relaxed text-ink-2">
          Live prices are unavailable right now. They are quoted rather than stored, so
          rather than show you a number from earlier this section leaves them out.
        </p>
      ) : (
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {cards.map((market, i) => (
            <MarketCard key={market.conditionId} market={market} ground={CARD_GROUNDS[i]} />
          ))}
        </div>
      )}
    </Band>
  );
}

/**
 * A card, and the panel is the market.
 *
 * The panel was a flat colour with a bar on it, which is a card with nothing in it. It
 * carries the market's own artwork now, under a tint in the card's colour so the three
 * still read as one set rather than as three unrelated pictures.
 *
 * The bar across the bottom is the market's YES share. The figure sits in the body rather
 * than over the bar, because a number laid on a boundary that moves with the price is
 * legible at some prices and not at others.
 */
function MarketCard({ market, ground }: { market: Market; ground: string }) {
  const yes = Math.round(market.outcomes[0].price * 100);

  return (
    <a
      href="/app"
      className="group flex flex-col overflow-hidden rounded-[22px] border border-rule bg-surface transition-colors hover:border-edge"
    >
      <div className={`relative aspect-[16/10] ${ground}`}>
        {market.image && (
          <Image
            src={market.image}
            alt=""
            fill
            sizes="(min-width: 1024px) 420px, 100vw"
            className="object-cover opacity-90 mix-blend-luminosity transition-opacity group-hover:opacity-100"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        <div className="absolute inset-x-6 bottom-6 h-2.5 rounded-full bg-black/25">
          <div className="h-full rounded-full bg-white/90" style={{ width: `${yes}%` }} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-4xl font-medium tabular-nums leading-none text-ink">
            {yes}¢
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">Yes</span>
        </div>

        <p className="mt-4 line-clamp-3 text-base font-medium leading-snug text-ink-2">
          {market.question}
        </p>

        <p className="mt-auto pt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-3">
          <span className="tabular-nums text-accent">{compactUsd(market.volume24h)}</span>{" "}
          traded in 24h
        </p>
      </div>
    </a>
  );
}

function compactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

function Liquidity() {
  return (
    <Band id="liquidity">
      <div className="text-center">
        <Eyebrow>Where the price comes from</Eyebrow>
        <Heading centered>One world. Two sides. One price.</Heading>
        <p className="mx-auto mt-6 max-w-prose text-base leading-relaxed text-ink-2">
          A pick routes into the deepest prediction markets on earth. You are quoted
          against that book rather than against a house line, which is the difference
          between a market and a bookmaker.
        </p>
      </div>

      <WorldMap className="mt-14" />
    </Band>
  );
}

const STEPS = [
  {
    title: "Fund in USDm",
    body: "Deposit Mento Dollars straight from a Celo wallet or MiniPay. No gas to hold, no seed phrase to write down.",
  },
  {
    title: "Take a side",
    body: "Every market is one question with two answers. The price you are shown is the probability the book is currently putting on it.",
  },
  {
    title: "Leave or hold",
    body: "Sell back at the live price any time, or hold to resolution. A winning share pays a full dollar.",
  },
  {
    title: "Settled to your wallet",
    body: "Resolution pays out in USDm on Celo. The payout is written against your position, with the fee shown before you commit.",
  },
];

function HowItWorks() {
  return (
    <Band id="how">
      <Eyebrow>How it works</Eyebrow>
      <Heading>One question, two answers, and a price for each.</Heading>

      <ol className="mt-12 grid gap-10 sm:grid-cols-2">
        {STEPS.map((step, i) => (
          <li key={step.title} className="border-t border-edge pt-6">
            <p className="font-mono text-[11px] tabular-nums tracking-[0.2em] text-accent">
              {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-3 max-w-prose text-base leading-relaxed text-ink-2">{step.body}</p>
          </li>
        ))}
      </ol>
    </Band>
  );
}

function Close() {
  return (
    <Band>
      <div className="rounded-[28px] border border-rule bg-surface p-10 text-center sm:p-16">
        <Heading centered>Pick your first market.</Heading>
        <p className="mx-auto mt-5 max-w-prose text-base leading-relaxed text-ink-2">
          Free picks are live on Celo mainnet. Build a streak on those, then back a view
          with real USDm.
        </p>
        <a
          href="/app"
          className="mt-8 inline-block rounded-full bg-ink px-8 py-3.5 text-sm font-medium text-plane transition-opacity hover:opacity-85"
        >
          Open the app
        </a>
      </div>
    </Band>
  );
}
