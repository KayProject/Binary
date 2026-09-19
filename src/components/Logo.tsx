/**
 * Binary wordmark.
 *
 * Both halves inherit `currentColor` rather than naming a token. The landing page and the
 * app run on different token sets — `--ink` on one, `--s-text` on the other — so a
 * wordmark that named either one was invisible on the other: inside the app's light theme
 * it was painting white on white, because `--ink` there still resolved to the dark
 * theme's value.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`select-none text-lg font-bold italic leading-none tracking-[-0.04em] ${className}`}
    >
      BI<span className="opacity-45">NARY</span>
    </span>
  );
}
