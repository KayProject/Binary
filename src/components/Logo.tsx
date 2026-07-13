// Binary wordmark: italic, BI in black / NARY in white. Needs a colored
// ground to read (the landing's blue gradient, or the chip variant on white).
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`select-none text-lg font-black italic leading-none tracking-tight ${className}`}
    >
      <span className="text-black">BI</span>
      <span className="text-white">NARY</span>
    </span>
  );
}

// Chip variant for light surfaces (app header): wordmark on a brand-blue pill.
export function LogoChip({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-lg bg-brand px-2 py-1 ${className}`}>
      <Logo />
    </span>
  );
}
