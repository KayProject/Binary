"use client";

import Link from "next/link";
import { motion } from "motion/react";
import RippleGrid from "@/components/RippleGrid";

const rise = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0 },
};

export default function DeltaHero() {
  return (
    <section className="relative -mx-6 overflow-hidden px-6 pb-28 pt-20 lg:-mx-10 lg:px-10 lg:pb-44 lg:pt-32">
      {/* Depth stack: ripple grid, then an arc of light above the fold, then a
          floor wash so the section resolves into the page instead of ending. */}
      {/* Finer mesh spread over a much wider radius — the coarse grid read as
          a handful of huge boxes crowding the headline. */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-70">
        <RippleGrid
          gridSize={11}
          gridThickness={26}
          fadeDistance={2.8}
          vignetteStrength={3.2}
          glowIntensity={0.14}
          opacity={0.5}
          speed={0.3}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-42rem] z-0 h-[62rem] w-[62rem] -translate-x-1/2 rounded-full
                   border border-act/25
                   shadow-[0_0_140px_20px_rgba(61,116,255,0.18),inset_0_0_120px_10px_rgba(61,116,255,0.10)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-64 bg-gradient-to-t from-mid to-transparent"
      />

      <motion.div
        className="relative z-10 mx-auto max-w-5xl text-center"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.09 } } }}
      >
        <motion.h1
          variants={rise}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="text-[2.9rem] font-extrabold leading-[0.96] tracking-[-0.04em] sm:text-6xl lg:text-[5.4rem]"
        >
          Delta moved half
          <br />
          <span className="bg-gradient-to-b from-ice to-act-soft bg-clip-text text-transparent">
            the agent economy
          </span>
        </motion.h1>

        <motion.p
          variants={rise}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-ice/70"
        >
          An autonomous agent that takes real positions, settles in USDm, and
          buys its own market data on open rails — with no account and no
          relationship arranged in advance.
        </motion.p>

        <motion.div
          variants={rise}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="mt-11 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            href="/app"
            className="group relative overflow-hidden rounded-full bg-act px-8 py-4 font-semibold text-white
                       transition-transform duration-300 hover:scale-[1.03] active:scale-95"
          >
            <span className="relative z-10">See Delta trade →</span>
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent
                         transition-transform duration-700 group-hover:translate-x-full"
            />
          </Link>
          <a
            href="#thesis"
            className="rounded-full bg-white/[0.05] px-8 py-4 font-semibold text-ice ring-1 ring-inset ring-white/10
                       transition-colors duration-300 hover:bg-white/[0.09]"
          >
            Why it works
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
