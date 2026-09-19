/**
 * Binary wordmark.
 *
 * The two-tone split used to be black/white, which needed a mid-tone ground underneath
 * to read at all — on the light act the white half disappeared. It is drawn in the ink
 * scale instead, so it carries on whichever ground it lands on.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`select-none text-lg font-bold italic leading-none tracking-[-0.04em] ${className}`}
    >
      <span className="text-ink">BI</span>
      <span className="text-ink-3">NARY</span>
    </span>
  );
}
