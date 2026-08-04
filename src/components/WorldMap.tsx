"use client";

import { useEffect, useRef } from "react";
import { MAP_ASPECT, MAP_COLS, MAP_ROWS, landCells } from "./worldMapMask";

const CELLS = landCells();

const BASE_RGB = "255, 255, 255";
const BASE_ALPHA = 0.2;
const LIT_RGB = "49, 211, 162"; // --color-win
const GLOW_RADIUS = 0.055; // fraction of map width
const SWEEP_PERIOD = 14000; // ms for one idle pass across the map

export default function WorldMap({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Focus point in normalised map space; drives the lit cluster.
  const focusRef = useRef({ x: 0.5, y: 0.5 });
  const pointerRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = w / MAP_ASPECT;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = true;
      focusRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    const onPointerLeave = () => { pointerRef.current = false; };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    const draw = (t: number) => {
      // With no pointer (touch, or cursor elsewhere) the highlight drifts on
      // its own, so the map still reads as alive on mobile — where hover
      // never fires and a static map would look broken.
      if (!pointerRef.current && !reduceMotion) {
        const phase = (t % SWEEP_PERIOD) / SWEEP_PERIOD;
        focusRef.current = {
          x: phase,
          y: 0.5 + 0.22 * Math.sin(phase * Math.PI * 4),
        };
      }

      const cellW = w / MAP_COLS;
      const cellH = h / MAP_ROWS;
      const dotR = Math.max(0.7, cellW * 0.3);
      const fx = focusRef.current.x * w;
      const fy = focusRef.current.y * h;
      const glow = GLOW_RADIUS * w;
      const glowSq = glow * glow;

      ctx.clearRect(0, 0, w, h);

      for (const [c, r] of CELLS) {
        const x = (c + 0.5) * cellW;
        const y = (r + 0.5) * cellH;

        const dx = x - fx;
        const dy = y - fy;
        const dSq = dx * dx + dy * dy;

        if (reduceMotion || dSq > glowSq) {
          ctx.fillStyle = `rgba(${BASE_RGB}, ${BASE_ALPHA})`;
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        // Smooth falloff so the cluster has no hard edge, and lit dots swell
        // slightly — the same read as the source's scale-on-hover.
        const k = 1 - Math.sqrt(dSq) / glow;
        const ease = k * k * (3 - 2 * k);
        ctx.fillStyle = `rgba(${LIT_RGB}, ${BASE_ALPHA + ease * 0.85})`;
        ctx.beginPath();
        ctx.arc(x, y, dotR * (1 + ease * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className={`w-full ${className}`} aria-hidden />;
}
