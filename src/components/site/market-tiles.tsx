import Image from "next/image";
import type { Market } from "@/lib/polymarket/types";

/**
 * The five scattered squircles framing the headline.
 *
 * Each is a real market built like a card: the market's own artwork on top, a solid
 * caption below it carrying the price. The first version laid white type straight over
 * the artwork, which works until the artwork is a pale league crest and the figure
 * disappears into it — a scrim strong enough to fix that would have buried the picture.
 * The caption block is what makes the price legible against art nobody chose.
 *
 * What a tile shows is set by how much room it has, not by device: the two smallest carry
 * a price alone, because a question truncated to four characters is worse than none.
 */
const TILES = [
  { slot: 1, ground: "bg-tile-ink", ink: "text-white", sub: "text-white/55", detail: false },
  { slot: 2, ground: "bg-tile-indigo", ink: "text-white", sub: "text-white/65", detail: false },
  { slot: 3, ground: "bg-tile-vermillion", ink: "text-white", sub: "text-white/65", detail: true },
  { slot: 4, ground: "bg-tile-cyan", ink: "text-[#0a0a0a]", sub: "text-black/45", detail: false },
  { slot: 5, ground: "bg-tile-chartreuse", ink: "text-[#0a0a0a]", sub: "text-black/50", detail: true },
] as const;

const cents = (price: number) => `${Math.round(price * 100)}¢`;

/**
 * Five markets that do not look like each other.
 *
 * Gamma reuses one crest across every fixture in a league, so the top of the feed can be
 * five rows deep in the same Premier League badge. Picking by distinct image first means
 * the scatter reads as five markets rather than as one market repeated.
 */
function distinct(markets: Market[], count: number): Market[] {
  const seen = new Set<string>();
  const picked: Market[] = [];

  for (const market of markets) {
    const key = market.image ?? market.slug;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(market);
    if (picked.length === count) return picked;
  }

  // Not enough distinct art to fill the scatter — fall back to the order given rather
  // than showing fewer tiles than the layout is built around.
  for (const market of markets) {
    if (picked.includes(market)) continue;
    picked.push(market);
    if (picked.length === count) break;
  }
  return picked;
}

export function MarketTiles({ markets }: { markets: Market[] }) {
  // Nothing to say and no invented figures to say it with. The hero reads fine without
  // the tiles; it does not read fine with five prices that are not prices.
  if (markets.length < TILES.length) return null;
  const picked = distinct(markets, TILES.length);

  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      {TILES.map((tile, i) => {
        const market = picked[i];
        const yes = cents(market.outcomes[0].price);

        return (
          <div
            key={tile.slot}
            className={`hero-tile hero-tile-${tile.slot} ${tile.ground} overflow-hidden`}
          >
            <a
              href="/app"
              aria-label={`${market.question} — Yes at ${yes}`}
              className="flex h-full w-full flex-col"
            >
              <div className="relative min-h-0 flex-1 bg-white/5">
                {market.image && (
                  <Image
                    src={market.image}
                    alt=""
                    fill
                    sizes="280px"
                    className="object-cover"
                    // Above the fold on every visit; the two largest carry the most pixels.
                    priority={tile.detail}
                  />
                )}
              </div>

              <div className={`${tile.ground} px-2.5 py-2 lg:px-3.5 lg:py-3`}>
                {tile.detail && (
                  <p className={`hidden line-clamp-2 text-[11px] font-medium leading-snug lg:block ${tile.ink}`}>
                    {market.question}
                  </p>
                )}
                <div className={`flex items-baseline gap-1.5 ${tile.detail ? "lg:mt-1.5" : ""}`}>
                  <span className={`text-base font-semibold tabular-nums leading-none lg:text-2xl ${tile.ink}`}>
                    {yes}
                  </span>
                  <span className={`font-mono text-[9px] uppercase tracking-[0.18em] ${tile.sub}`}>
                    Yes
                  </span>
                </div>
              </div>
            </a>
          </div>
        );
      })}
    </div>
  );
}
