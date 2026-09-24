import Link from "next/link";

/**
 * Four columns, a giant fading wordmark, and a base bar.
 *
 * The first version was three columns of small uppercase type in a rounded box, which
 * said the right things and gave the page nothing to end on. The mark behind the columns
 * is the close: set large enough to run the width, clipped to a gradient and masked so it
 * fades into the ground rather than sitting on it as a slab of text.
 */
const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Open the app", href: "/app?enter=1" },
      { label: "Markets", href: "/#markets" },
      { label: "How it works", href: "/#how" },
    ],
  },
  {
    title: "Build",
    links: [
      { label: "Delta", href: "/delta" },
      { label: "Terms", href: "/delta/terms" },
      { label: "Liquidity", href: "/#liquidity" },
    ],
  },
  {
    title: "Protocol",
    links: [
      { label: "Celo", href: "https://celo.org" },
      { label: "Mento", href: "https://mento.org" },
      { label: "Polymarket", href: "https://polymarket.com" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden pt-16">
      <div className="mx-auto w-full max-w-7xl px-6 sm:px-10">
        <div className="relative z-2 grid gap-8 py-7 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <p className="select-none text-2xl font-bold italic leading-none tracking-[-0.04em]">
              <span className="text-ink">BI</span>
              <span className="text-ink-3">NARY</span>
            </p>
            <p className="mt-3.5 max-w-[34ch] text-sm leading-relaxed text-ink-2">
              The prediction market built for the Mento Dollar. Binary routes your order
              into the deepest books on earth and never takes the other side of it.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                {column.title}
              </h3>
              {column.links.map((link) =>
                link.href.startsWith("http") ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block py-1 text-[14.5px] text-ink-2 transition-colors hover:text-accent"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="block py-1 text-[14.5px] text-ink-2 transition-colors hover:text-accent"
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </div>

        <div aria-hidden className="footer-mark-wrap">
          <div className="footer-mark">Binary</div>
        </div>

        <div className="relative z-2 flex flex-wrap items-center justify-between gap-3 border-t border-rule py-6 text-[13.5px] text-ink-2">
          <span>© {new Date().getFullYear()} Binary. Priced in USDm, settled on Celo.</span>
          <div className="flex items-center gap-3.5">
            <Link href="/delta/terms" className="transition-colors hover:text-ink">
              Terms &amp; Conditions
            </Link>
            <span aria-hidden className="opacity-40">
              |
            </span>
            <Link href="/delta/terms" className="transition-colors hover:text-ink">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
