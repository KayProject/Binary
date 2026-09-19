/**
 * One rounded container on the dark ground, three columns of small uppercase type.
 *
 * The previous footer was a single line of two spans, which left the legal and routing
 * facts — who settles, what the token is, where the terms live — nowhere on the page.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="px-6 pb-10 sm:px-10">
      <div className="mx-auto w-full max-w-7xl rounded-[28px] border border-rule bg-surface p-8 sm:p-12">
        <div className="grid gap-10 sm:grid-cols-3">
          <Column title={`Binary © ${year}`}>
            <Line href="/delta/terms">Terms</Line>
            <Line href="/app">Open the app</Line>
            <Line href="/delta">Delta</Line>
          </Column>

          <Column title="Settlement">
            <p>Priced in USDm</p>
            <p>Settled on Celo</p>
            <p>Liquidity by Polymarket</p>
          </Column>

          <Column title="Standing">
            <p>Binary routes your order. It never takes the other side of it.</p>
          </Column>
        </div>
      </div>
    </footer>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-3">{title}</p>
      <div className="mt-4 space-y-2 text-[11px] uppercase tracking-[0.14em] text-ink-2">
        {children}
      </div>
    </div>
  );
}

function Line({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p>
      <a href={href} className="transition-colors hover:text-ink">
        {children}
      </a>
    </p>
  );
}
