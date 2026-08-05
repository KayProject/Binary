"use client";

import { motion, useInView } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Surfaces for the Delta page. The depth comes from three stacked cheap
 * effects rather than a drop shadow: a hairline inner highlight along the top
 * edge (light appears to fall from above), a very low-contrast gradient across
 * the fill, and a glow that only resolves on hover. Flat bordered boxes were
 * the reason the first pass read as a template.
 */

export function Panel({
  children,
  className,
  glow = false,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[1.75rem]",
        "bg-gradient-to-b from-mid-2/90 to-mid-2/40",
        "ring-1 ring-inset ring-white/[0.07]",
        interactive &&
          "transition-[transform,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-[0_24px_70px_-30px_rgba(61,116,255,0.55)]",
        className,
      )}
    >
      {/* Top-edge highlight — the single biggest cue that a surface has depth */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />
      {glow && (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-act/20 blur-3xl"
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * Delta's wordmark, built the same way Binary's is — italic, black weight,
 * split across two colours — so the two read as siblings rather than as two
 * unrelated products.
 */
export function DeltaMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={cn(
        "select-none text-lg font-black italic leading-none tracking-tight",
        className,
      )}
    >
      <span className="text-act">DEL</span>
      <span className="text-ice">TA</span>
    </span>
  );
}

/**
 * Section marker: an index numeral against a rule that fades out. Editorial
 * rather than a chip — the pill treatment was reading as stock UI.
 */
export function SectionLabel({
  index,
  children,
}: {
  index: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-5">
      <span className="font-mono text-xs font-bold text-act">{index}</span>
      <span className="h-px w-14 bg-gradient-to-r from-act/70 to-transparent" />
      <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-fog">
        {children}
      </span>
    </div>
  );
}

/** Scroll reveal. Children stagger; nothing moves more than 16px. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
