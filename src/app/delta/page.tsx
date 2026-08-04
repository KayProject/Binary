import Link from "next/link";
import StatBar from "@/components/delta/StatBar";
import FavouriteTrap from "@/components/delta/FavouriteTrap";
import DelegateFlow from "@/components/delta/DelegateFlow";
import DeadEnds from "@/components/delta/DeadEnds";

const SECTION = "mt-24 lg:mt-36";
const EYEBROW =
  "font-mono text-[11px] uppercase tracking-[0.22em] text-fog";

export default function DeltaPage() {
  return (
    <main className="mx-auto w-full max-w-md px-6 sm:max-w-2xl lg:max-w-6xl lg:px-10">
      {/* Nav */}
      <header className="flex items-center justify-between py-6">
        <span className="text-xl font-extrabold tracking-tight">
          <span className="text-act-soft">Δ</span>
          <span className="ml-2 text-fog">/ Binary</span>
        </span>
        <Link
          href="/"
          className="font-mono text-xs text-fog transition-colors hover:text-ice"
        >
          binary ↗
        </Link>
      </header>

      {/* Hero — the claim, not the credentials */}
      <section className="pt-10 lg:pt-20">
        <p className={EYEBROW}>The agent Binary is built around</p>
        <h1 className="mt-6 max-w-4xl text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl lg:text-8xl">
          Δ moved half
          <br />
          the volume on
          <br />
          <span className="text-act-soft">Celo&apos;s agent board.</span>
        </h1>
        <p className="mt-8 max-w-xl text-lg text-ice/80 lg:text-xl">
          Not a demo, not a testnet. Δ takes positions on real prediction
          markets, settles in USDm on Celo mainnet, and buys its own market data
          on open rails — with no account and no relationship established in
          advance.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/app"
            className="rounded-2xl bg-act px-7 py-4 font-bold text-ice transition-transform active:scale-95"
          >
            See it live →
          </Link>
          <a
            href="#how"
            className="rounded-2xl border border-mid-3 px-7 py-4 font-bold text-ice transition-colors hover:border-act/50"
          >
            How it works
          </a>
        </div>
      </section>

      {/* Proof — the numbers, polled */}
      <section className={SECTION}>
        <StatBar />
      </section>

      {/* The problem */}
      <section className={SECTION} id="how">
        <p className={EYEBROW}>The trap most agents fall into</p>
        <h2 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight lg:text-5xl">
          Being right is not the same as making money.
        </h2>
        <p className="mt-4 max-w-2xl text-ice/80">
          Every prediction agent pitches accuracy. Accuracy is free — you can buy
          it at any price you like. Try it.
        </p>
        <div className="mt-8">
          <FavouriteTrap />
        </div>
      </section>

      {/* The answer */}
      <section className={SECTION}>
        <p className={EYEBROW}>What Δ optimises instead</p>
        <h2 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight lg:text-5xl">
          Edge requires knowing something the price doesn&apos;t.
        </h2>
        <blockquote className="mt-8 max-w-2xl border-l-2 border-act/60 pl-6 text-lg text-ice/85">
          The price already contains every chart Δ can see. Same information as
          the market means the same estimate, which means{" "}
          <span className="font-mono text-act-soft">Δ = 0</span>, which means no
          bet.
        </blockquote>
        <p className="mt-6 max-w-2xl text-ice/80">
          So Δ does not trade often, and it does not sell its signal — the paid
          endpoint returns measurements of the live book, never the position. The
          strategy that survived measurement is unglamorous: buy, and hold to
          resolution.
        </p>
        <div className="mt-10">
          <p className={EYEBROW}>Four strategies that did not survive</p>
          <div className="mt-4">
            <DeadEnds />
          </div>
        </div>
      </section>

      {/* The product */}
      <section className={SECTION}>
        <p className={EYEBROW}>How people ride with it</p>
        <h2 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight lg:text-5xl">
          Hand Δ your stake. It does the rest.
        </h2>
        <p className="mt-4 max-w-2xl text-ice/80">
          Δ batches up to 25 people into a single deposit, so the group pays for
          one transaction instead of twenty-five, then forwards every beneficiary
          their payout. Before the result is known, it commits a hash of who is
          owed what into the transaction itself — so the split can be checked
          afterwards by anyone, against the chain.
        </p>
        <div className="mt-8">
          <DelegateFlow />
        </div>
      </section>

      {/* The novelty */}
      <section className={SECTION}>
        <p className={EYEBROW}>Why this is DeFAI and not a chatbot</p>
        <h2 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight lg:text-5xl">
          Δ is a paying customer of a financial API.
        </h2>
        <div className="mt-8 grid gap-3 lg:grid-cols-3">
          {[
            {
              n: "402",
              t: "It gets quoted",
              d: "Δ asks for a market read and the endpoint answers with a price, not a login.",
            },
            {
              n: "3009",
              t: "It pays",
              d: "A gasless USDC authorisation on Celo — signed by the agent, no account, no prior relationship.",
            },
            {
              n: "200",
              t: "It gets served",
              d: "Spread, depth at the touch, the book's vig, implied probability — plus a refund guarantee on the fill.",
            },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-mid-3 bg-mid-2/40 p-6"
            >
              <p className="font-mono text-sm text-act-soft">{s.n}</p>
              <p className="mt-2 text-lg font-bold text-ice">{s.t}</p>
              <p className="mt-2 text-sm text-ice/70">{s.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-ice/80">
          The interesting claim was never that an agent can trade. It is that an
          agent can discover a price, pay it, and be served — on open rails, with
          nothing arranged beforehand. That is what x402 makes possible, and Δ
          exercises it for real.
        </p>
      </section>

      {/* Close */}
      <section className={`${SECTION} rounded-3xl border border-mid-3 bg-mid-2/40 p-8 text-center lg:p-16`}>
        <h2 className="text-3xl font-extrabold lg:text-5xl">
          Every transaction is tagged.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-ice/80">
          Δ appends{" "}
          <span className="font-mono text-act-soft">celo_22480bd47654</span> to
          the calldata of everything it signs. You do not have to believe this
          page — the whole economic history is reconstructible from Celo.
        </p>
        <Link
          href="/app"
          className="mt-8 inline-block rounded-2xl bg-act px-8 py-4 font-bold text-ice transition-transform active:scale-95"
        >
          Open Binary →
        </Link>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 py-12 font-mono text-[11px] text-fog">
        <span>Δ · agent 0xC2A4…74E9 · Celo mainnet</span>
        <span>BINARY © {new Date().getFullYear()}</span>
      </footer>
    </main>
  );
}
