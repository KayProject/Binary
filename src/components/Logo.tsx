export function getLogoClassName(className?: string) { return `select-none text-lg font-black italic leading-none tracking-tight ${className}`; }

export function getLogoChipClassName(className?: string) { return `inline-flex items-center rounded-lg bg-brand px-2 py-1 ${className}`; }

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={getLogoClassName(className)}>
      <span className="text-black">BI</span>
      <span className="text-white">NARY</span>
    </span>
  );
}

export function LogoChip({ className = "" }: { className?: string }) {
  return (
    <span className={getLogoChipClassName(className)}>
      <Logo />
    </span>
  );
}