import type { Market } from "@/lib/polymarket/types";

/**
 * The five scattered squircles framing the headline.
 *
 * They carry real markets rather than art, because the product is the market. The
 * grounds are the art palette and never mean anything — a tile's colour says nothing
 * about which way it is priced.
 *
 * What a tile shows is set by how much room it has, not by device: the two smallest
 * carry a price and nothing else, because a question truncated to four characters is
 * worse than no question.
 */
const TILES = [
  { slot: 1, ground: "bg-tile-ink", ink: "text-white", sub: "text-white/55", detail: false },
  { slot: 2, ground: "bg-tile-indigo", ink: "text-white", sub: "text-white/65", detail: false },
  { slot: 3, ground: "bg-tile-bone", ink: "text-[#0a0a0a]", sub: "text-black/50", detail: true },
  { slot: 4, ground: "bg-tile-cyan", ink: "text-[#0a0a0a]", sub: "text-black/50", detail: false },
  { slot: 5, ground: "bg-tile-chartreuse", ink: "text-[#0a0a0a]", sub: "text-black/55", detail: true },
] as const;

const cents = (price: number) => `${Math.round(price * 100)}¢`;

export function MarketTiles({ markets }: { markets: Market[] }) {
  // Nothing to say and no invented figures to say it with. The hero reads fine without
  // the tiles; it does not read fine with five prices that are not prices.
  if (markets.length < TILES.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      {TILES.map((tile, i) => {
        const market = markets[i];
        const yes = market.outcomes[0].price;

        return (
          <div
            key={tile.slot}
            className={`hero-tile hero-tile-${tile.slot} ${tile.ground} overflow-hidden`}
          >
            <a
              href="/app"
              aria-label={`${market.question} — Yes at ${cents(yes)}`}
              className="flex h-full w-full flex-col justify-between p-[7%]"
            >
              {tile.detail ? (
                <p className={`line-clamp-3 text-[11px] font-medium leading-tight ${tile.ink} lg:text-[13px]`}>
                  {market.question}
                </p>
              ) : (
                <p className={`font-mono text-[9px] uppercase tracking-[0.18em] ${tile.sub}`}>Yes</p>
              )}

              <div>
                <p className={`font-mono text-xl font-medium tabular-nums leading-none ${tile.ink} lg:text-3xl`}>
                  {cents(yes)}
                </p>
                {tile.detail && (
                  <p className={`mt-1 font-mono text-[9px] uppercase tracking-[0.18em] ${tile.sub}`}>
                    Yes · live
                  </p>
                )}
              </div>
            </a>
          </div>
        );
      })}
    </div>
  );
}
