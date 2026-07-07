# Binary

Mobile-first prediction market for the Mento Dollar (USDm). Users back a side of a
binary question in USDm on Celo; markets, liquidity, and settlement come from
Polymarket on Polygon.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full technical design,
build phases, and open verifications.

## Development

```bash
npm install
npm run dev     # dev server
npm run build   # production build
npm run lint
```

Next.js (App Router) + TypeScript + Tailwind. Landing page lives at `src/app/page.tsx`.

## Status

Landing page + architecture. Next: Phase 0 walking skeleton
(deposit → swap → bridge → CLOB order → withdraw, scripts only).
