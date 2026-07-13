import Globe from "@/components/Globe";
import { Logo } from "@/components/Logo";

const demoMarkets = [
  { q: "Will BTC close 2026 above $150K?", yes: 34 },
  { q: "Will Nigeria win AFCON 2027?", yes: 22 },
  { q: "Will ETH flip $10K before July 2027?", yes: 41 },
];

const steps = [
  {
    n: "01",
    title: "Deposit USDm",
    body: "Fund your account with Mento Dollars straight from your Celo wallet or MiniPay. No gas, no seed phrase.",
  },
  {
    n: "02",
    title: "Tap YES or NO",
    body: "Every market is one question. Prices are live probabilities from the world's deepest prediction markets.",
  },
  {
    n: "03",
    title: "Cash out in USDm",
    body: "Sell any time or hold to resolution. Winning shares pay a full dollar — settled back to your wallet in USDm.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 sm:max-w-2xl">
      {/* Nav */}
      <header className="flex items-center justify-between py-6">
        <Logo />
        <span className="rounded-full border border-white/30 px-3 py-1 font-mono text-xs tracking-widest text-white/80">
          COMING SOON
        </span>
      </header>

      {/* Hero */}
      <section className="relative flex flex-col items-center pt-6 text-center">
        <Globe className="pointer-events-none absolute -top-4 left-1/2 max-w-sm -translate-x-1/2 opacity-40" />
        <h1 className="relative mt-10 text-6xl font-extrabold leading-none tracking-tight sm:text-8xl">
          Every question
          <br />
          has two sides.
        </h1>
        <p className="relative mt-6 max-w-sm text-lg text-white/85">
          The mobile prediction market for the Mento Dollar. Back your view
          with USDm — powered by Polymarket liquidity, built on Celo.
        </p>
        <div className="relative mt-8 flex w-full max-w-xs gap-3">
          <span className="flex-1 rounded-2xl bg-yes py-4 text-center text-lg font-bold text-ink">
            YES
          </span>
          <span className="flex-1 rounded-2xl bg-no py-4 text-center text-lg font-bold text-ink">
            NO
          </span>
        </div>
        <p className="relative mt-3 font-mono text-xs tracking-widest text-white/60">
          PICK A SIDE
        </p>
      </section>

      {/* Demo markets */}
      <section className="mt-20">
        <h2 className="font-mono text-xs tracking-[0.25em] text-white/60">
          LIVE ON DAY ONE
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          {demoMarkets.map((m) => (
            <div
              key={m.q}
              className="rounded-3xl bg-white/10 p-5 backdrop-blur-sm"
            >
              <p className="text-lg font-semibold">{m.q}</p>
              <div className="mt-4 flex gap-3">
                <div className="flex-1 rounded-xl bg-white/10 py-3 text-center">
                  <span className="font-mono text-sm text-white/70">YES</span>
                  <p className="text-xl font-bold">{m.yes}¢</p>
                </div>
                <div className="flex-1 rounded-xl bg-white/10 py-3 text-center">
                  <span className="font-mono text-sm text-white/70">NO</span>
                  <p className="text-xl font-bold">{100 - m.yes}¢</p>
                </div>
              </div>
              <p className="mt-3 font-mono text-xs text-white/50">
                market thinks: {m.yes}% chance · priced in USDm
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-20">
        <h2 className="font-mono text-xs tracking-[0.25em] text-white/60">
          HOW IT WORKS
        </h2>
        <div className="mt-4 flex flex-col gap-8">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-5">
              <span className="font-mono text-2xl font-bold text-white/40">
                {s.n}
              </span>
              <div>
                <h3 className="text-xl font-bold">{s.title}</h3>
                <p className="mt-1 text-white/80">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mt-20 rounded-3xl bg-ink/40 p-8 text-center backdrop-blur-sm">
        <h2 className="text-3xl font-extrabold">Be first in line.</h2>
        <p className="mt-2 text-white/80">
          Binary is in build. Follow along — launch starts on Celo.
        </p>
        <a
          href="https://github.com/KayProject/Binary"
          className="mt-6 inline-block rounded-2xl bg-white px-8 py-4 font-bold text-brand-deep"
        >
          Watch the build →
        </a>
      </section>

      {/* Footer */}
      <footer className="flex items-center justify-between py-10 font-mono text-xs text-white/60">
        <span>BINARY © {new Date().getFullYear()}</span>
        <span>Built on Celo · Liquidity by Polymarket</span>
      </footer>
    </main>
  );
}
