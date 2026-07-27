export function concatClassName(baseClass: string, additionalClass?: string) { return additionalClass ? `${baseClass} ${additionalClass}` : baseClass; }

export function Logo({ className = "" }: { className?: string }) {
  const logoClassName = concatClassName(`select-none text-lg font-black italic leading-none tracking-tight`, className);
  return (
    <span className={logoClassName}>
      <span className="text-black">BI</span>
      <span className='text-white'>NARY</span>
    </span>
  );
}

export function LogoChip({ className = "" }: { className?: string }) {
  const chipClassName = concatClassName(`inline-flex items-center rounded-lg bg-brand px-2 py-1`, className);
  return (
    <span className={chipClassName}>
      <Logo />
    </span>
  );
}