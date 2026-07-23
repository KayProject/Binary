"use client";

import { useEffect, useRef } from "react";

const POINTS = 900;
const SPIN = 0.00035; // radians per ms

// Fibonacci sphere — evenly distributed points
function spherePoints(n: number) {
  const pts: [number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    pts.push([Math.cos(theta) * r, y, Math.sin(theta) * r]);
  }
  return pts;
}

export default function Globe({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pts = spherePoints(POINTS);
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = canvas.clientWidth;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      const size = canvas.clientWidth;
      const cx = size / 2;
      const cy = size / 2;
      const R = size * 0.42;
      const angle = t * SPIN;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      ctx.clearRect(0, 0, size, size);

      for (const [x, y, z] of pts) {
        const rx = x * cos - z * sin;
        const rz = x * sin + z * cos;
        // depth: rz in [-1, 1]; back hemisphere dimmed
        const depth = (rz + 1) / 2;
        const px = cx + rx * R;
        const py = cy + y * R;
        const dotR = 0.9 + depth * 1.5;
        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.08 + depth * 0.85})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`aspect-square w-full ${className}`}
      aria-hidden
    />
  );
}
