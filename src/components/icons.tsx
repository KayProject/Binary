// Duotone icon set — a low-opacity "ghost" shape behind a solid foreground so
// the icons read with depth rather than as flat line art. Inline SVG on purpose:
// eight icons don't justify an icon package, and the npm tree is peer-fragile.
// Everything paints in currentColor, so callers set colour with text-* classes
// and both themes follow for free.

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className ?? "h-5 w-5"}
    >
      {children}
    </svg>
  );
}

/* ── Category tabs ─────────────────────────────────────────── */

export function AllIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="8" height="8" rx="2.5" opacity=".3" />
      <rect x="13" y="13" width="8" height="8" rx="2.5" opacity=".3" />
      <rect x="13" y="3" width="8" height="8" rx="2.5" />
      <rect x="3" y="13" width="8" height="8" rx="2.5" />
    </Svg>
  );
}

export function SportsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      {/* a trophy, not a ball — ball panelling turns to mush at 18px */}
      <path d="M6.8 3.6h10.4v5.6a5.2 5.2 0 0 1-10.4 0V3.6Z" opacity=".3" />
      <rect x="5.8" y="2.4" width="12.4" height="2.2" rx="1.1" />
      <path
        d="M6.8 5.8H4.9A1.9 1.9 0 0 0 3 7.7a4 4 0 0 0 4 4M17.2 5.8h1.9A1.9 1.9 0 0 1 21 7.7a4 4 0 0 1-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <rect x="11" y="13.8" width="2" height="3.6" />
      <path d="M9.4 17.2h5.2l.7 2.2H8.7l.7-2.2Z" />
      <rect x="7" y="19.4" width="10" height="2.2" rx="1.1" />
    </Svg>
  );
}

export function CryptoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9.5" opacity=".3" />
      <path d="M10 6.5h3.4a3.3 3.3 0 0 1 2.2 5.75A3.4 3.4 0 0 1 13.9 17.5H10V6.5Zm2.4 2v2.6h1a1.3 1.3 0 0 0 0-2.6h-1Zm0 4.6v2.4h1.3a1.2 1.2 0 0 0 0-2.4h-1.3Z" />
      <rect x="10.6" y="3.6" width="1.9" height="3" rx=".95" />
      <rect x="10.6" y="17.4" width="1.9" height="3" rx=".95" />
    </Svg>
  );
}

export function PoliticsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.2 22 7.4v1.9H2V7.4L12 2.2Z" opacity=".3" />
      <circle cx="12" cy="7" r="1.9" />
      <rect x="4.6" y="11" width="2.4" height="7" rx="1.2" />
      <rect x="10.8" y="11" width="2.4" height="7" rx="1.2" />
      <rect x="17" y="11" width="2.4" height="7" rx="1.2" />
      <rect x="2.2" y="19.4" width="19.6" height="2.4" rx="1.2" />
    </Svg>
  );
}

export function CultureIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M11 4.6l2.28 4.93 5.39.62-3.99 3.67 1.09 5.33L11 16.48 5.23 19.15l1.09-5.33L2.33 10.15l5.39-.62L11 4.6Z"
        opacity=".3"
      />
      <path d="M18.6 2.4l.78 1.72 1.72.78-1.72.78-.78 1.72-.78-1.72L16.1 4.9l1.72-.78.78-1.72Z" />
      <path d="M11 8.1l1.3 2.82 3.08.35-2.28 2.1.62 3.05L11 14.9l-2.72 1.52.62-3.05-2.28-2.1 3.08-.35L11 8.1Z" />
    </Svg>
  );
}

/* ── Bottom nav ────────────────────────────────────────────── */

export function MarketsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" opacity=".3" />
      <rect x="5.8" y="12.6" width="2.6" height="5.6" rx="1.3" />
      <rect x="10.7" y="9.4" width="2.6" height="8.8" rx="1.3" />
      <rect x="15.6" y="6.2" width="2.6" height="12" rx="1.3" />
    </Svg>
  );
}

export function PortfolioIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 8.5h20v8a4.5 4.5 0 0 1-4.5 4.5h-11A4.5 4.5 0 0 1 2 16.5v-8Z" opacity=".3" />
      <path d="M6.5 4h11A4.5 4.5 0 0 1 22 8.5H2A4.5 4.5 0 0 1 6.5 4Z" />
      <path d="M15.4 10.8H21a1 1 0 0 1 1 1v3.4a1 1 0 0 1-1 1h-5.6a2.7 2.7 0 0 1 0-5.4Zm.9 3.9a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z" />
    </Svg>
  );
}

export function YouIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9.5" opacity=".3" />
      <circle cx="12" cy="9.4" r="3.4" />
      <path d="M12 13.9c2.9 0 5.35 1.6 6.15 3.8A9.47 9.47 0 0 1 12 21.5a9.47 9.47 0 0 1-6.15-3.8c.8-2.2 3.25-3.8 6.15-3.8Z" />
    </Svg>
  );
}
