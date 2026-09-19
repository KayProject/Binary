/**
 * The faucet's gift box.
 *
 * Drawn rather than borrowed: the icon set's gift mark is a flat monochrome glyph that
 * reads as a generic outline at any size, and the thing this points at is a present with
 * real money in it. So this is a box — lid, ribbon, bow, and the shading that tells you
 * the lid sits on top of it — in its own colours rather than in the surface's ink.
 *
 * Inline SVG rather than a file: it is a few hundred bytes, it stays crisp at every
 * density, and it needs no request of its own to render in a MiniPay webview.
 */
export function GiftBox({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="gift-box" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff6a4d" />
          <stop offset="100%" stopColor="#d8341c" />
        </linearGradient>
        <linearGradient id="gift-lid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff8163" />
          <stop offset="100%" stopColor="#ef4a2c" />
        </linearGradient>
        <linearGradient id="gift-ribbon" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe08a" />
          <stop offset="100%" stopColor="#e9b641" />
        </linearGradient>
      </defs>

      {/* Body */}
      <rect x="11" y="27" width="42" height="29" rx="4" fill="url(#gift-box)" />
      {/* The inside of the lid's overhang, which is what reads as depth. */}
      <rect x="11" y="27" width="42" height="4" fill="#000" opacity="0.18" />
      {/* Ribbon down the body */}
      <rect x="28" y="27" width="8" height="29" fill="url(#gift-ribbon)" />

      {/* Lid */}
      <rect x="7" y="18" width="50" height="11" rx="3.5" fill="url(#gift-lid)" />
      <rect x="28" y="18" width="8" height="11" fill="url(#gift-ribbon)" />

      {/* Bow: two loops and a knot. */}
      <path
        d="M32 18.5c-4.3 0-8.5-1.3-11.4-4.1-2.6-2.5-3.1-6.1-1-8.2 2.1-2.1 5.7-1.6 8.2 1C30.6 10.1 32 14.5 32 18.5Z"
        fill="url(#gift-ribbon)"
      />
      <path
        d="M32 18.5c4.3 0 8.5-1.3 11.4-4.1 2.6-2.5 3.1-6.1 1-8.2-2.1-2.1-5.7-1.6-8.2 1C33.4 10.1 32 14.5 32 18.5Z"
        fill="url(#gift-ribbon)"
      />
      <circle cx="32" cy="17.5" r="4.1" fill="#f7cf6a" />
      <circle cx="30.6" cy="16.1" r="1.3" fill="#fff" opacity="0.7" />
    </svg>
  );
}
