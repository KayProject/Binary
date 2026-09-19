import type { Market } from "@/lib/polymarket/types";
import { PickIcon } from "@/components/icons";

/**
 * The feed's three tiers.
 *
 * Every market used to render at the same size, in the same card, at the same weight —
 * a market with $2.5M traded today looked exactly like one with $80K. A feed whose job is
 * to tell you what is worth deciding on cannot be a grid of identical objects, so the top
 * market of the moment takes a full card with its artwork large, the next two step down,
 * and the tail runs as rows.
 *
 * The price is one object in all three: a proportional bar you press either end of. It was
 * two numbers before — `74%` in the corner and `Yes 74¢` on a button — which is the same
 * fact twice, in two units.
 */
export type Tier = "hero" | "medium" | "compact";

const cents = (p: number) => `${(p * 100).toFixed(p < 0.1 || p > 0.9 ? 1 : 0)}¢`;

function volume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

export type MarketCardProps = {
  market: Market;
  tier: Tier;
  picked?: string;
  onPick: (market: Market, outcome: 0 | 1) => void;
};

/**
 * The price, as one thing.
 *
 * Both sides are live buttons and the split between them is the price — the bar is not a
 * chart next to the controls, it IS the controls. Labels sit inside their own half and
 * drop out below the width where they would collide, which is why the YES label carries
 * the figure and the NO side carries its own.
 */
function PriceBar({
  market,
  onPick,
  size,
}: {
  market: Market;
  onPick: (outcome: 0 | 1) => void;
  size: "lg" | "sm";
}) {
  const yes = market.outcomes[0];
  const no = market.outcomes[1];
  const share = Math.min(88, Math.max(12, yes.price * 100));
  const pad = size === "lg" ? "py-3.5 text-[15px]" : "py-2.5 text-sm";

  return (
    <div className="flex w-full gap-1.5">
      <button
        onClick={() => onPick(0)}
        style={{ flexBasis: `${share}%` }}
        className={`min-w-0 grow-0 rounded-full bg-(--s-win-tint) px-3 font-semibold tabular-nums text-(--s-win) transition active:scale-[0.98] ${pad}`}
      >
        <span className="block truncate">
          {yes.label} {cents(yes.price)}
        </span>
      </button>
      <button
        onClick={() => onPick(1)}
        style={{ flexBasis: `${100 - share}%` }}
        className={`min-w-0 grow-0 rounded-full bg-(--s-lose-tint) px-3 font-semibold tabular-nums text-(--s-lose) transition active:scale-[0.98] ${pad}`}
      >
        <span className="block truncate">
          {no.label} {cents(no.price)}
        </span>
      </button>
    </div>
  );
}

function Meta({ market, picked }: { market: Market; picked?: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-(--s-sub)">
      <span className="tabular-nums text-(--s-act)">{volume(market.volume24h)}</span>
      <span>traded today</span>
      {picked && (
        <span className="inline-flex items-center gap-1 font-semibold text-(--s-gold)">
          <PickIcon className="h-3.5 w-3.5" />
          {picked}
        </span>
      )}
    </p>
  );
}

export function MarketCard({ market, tier, picked, onPick }: MarketCardProps) {
  const pick = (outcome: 0 | 1) => onPick(market, outcome);

  if (tier === "hero") {
    return (
      <article className="overflow-hidden rounded-[26px] border border-(--s-line) bg-(--s-card)">
        {market.image && (
          /* Market art is almost always a square crest, not a photograph, so cropping it
             to a 16:9 band beheads it. The mark is contained at its own proportions and
             the same image, blurred and scaled, supplies the ground behind it. */
          <div className="relative flex h-40 items-center justify-center overflow-hidden bg-(--s-bg) sm:h-44">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={market.image}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-150 object-cover opacity-20 blur-3xl saturate-150"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={market.image}
              alt=""
              className="relative h-24 w-24 rounded-2xl object-contain sm:h-28 sm:w-28"
            />
          </div>
        )}
        <div className="p-5 sm:p-6">
          <Meta market={market} picked={picked} />
          <h3 className="mt-3 text-[22px] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[26px]">
            {market.question}
          </h3>
          <div className="mt-5">
            <PriceBar market={market} onPick={pick} size="lg" />
          </div>
        </div>
      </article>
    );
  }

  if (tier === "medium") {
    return (
      <article className="rounded-[22px] border border-(--s-line) bg-(--s-card) p-5">
        <div className="flex items-start gap-4">
          {market.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={market.image} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-snug">{market.question}</h3>
            <div className="mt-2">
              <Meta market={market} picked={picked} />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <PriceBar market={market} onPick={pick} size="sm" />
        </div>
      </article>
    );
  }

  return (
    <article className="flex items-center gap-3.5 rounded-[18px] px-2 py-3 transition-colors hover:bg-(--s-card)">
      {market.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={market.image} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold">{market.question}</h3>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-(--s-sub)">
          <span className="tabular-nums text-(--s-act)">{volume(market.volume24h)}</span> today
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          onClick={() => pick(0)}
          className="rounded-full bg-(--s-win-tint) px-3 py-1.5 text-xs font-semibold tabular-nums text-(--s-win) transition active:scale-95"
        >
          {cents(market.outcomes[0].price)}
        </button>
        <button
          onClick={() => pick(1)}
          className="rounded-full bg-(--s-lose-tint) px-3 py-1.5 text-xs font-semibold tabular-nums text-(--s-lose) transition active:scale-95"
        >
          {cents(market.outcomes[1].price)}
        </button>
      </div>
    </article>
  );
}
