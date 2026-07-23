use client";

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

function calculatePointPosition(
  x: number,
  y: number,
  z: number,
  t: number,
  size: number,
  R: number,
  cx: number,
  cy: number
) {
  const angle = t * SPIN;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // rotate around Y axis
  const rx = x * cos - z * sin;
  const rz = x * sin + z * cos;
  // depth: rz in [-1, 1]; back hemisphere dimmed
  const depth = (rz + 1) / 2;
  const px = cx + rx * R;
  const py = cy + y * R;
  const dotR = 0.9 + depth * 1.5;
  return { px, py, depth, dotR };
}

export default function Globe({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d\