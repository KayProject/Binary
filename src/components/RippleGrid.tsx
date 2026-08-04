"use client";

import { useEffect, useRef } from "react";
import { Renderer, Program, Triangle, Mesh } from "ogl";

type RippleGridProps = {
  gridColor?: string;
  rippleIntensity?: number;
  gridSize?: number;
  gridThickness?: number;
  fadeDistance?: number;
  vignetteStrength?: number;
  glowIntensity?: number;
  opacity?: number;
  mouseInteraction?: boolean;
  mouseInteractionRadius?: number;
};

type Uniforms = {
  iTime: { value: number };
  iResolution: { value: [number, number] };
  gridColor: { value: [number, number, number] };
  rippleIntensity: { value: number };
  gridSize: { value: number };
  gridThickness: { value: number };
  fadeDistance: { value: number };
  vignetteStrength: { value: number };
  glowIntensity: { value: number };
  opacity: { value: number };
  mouseInteraction: { value: boolean };
  mousePosition: { value: [number, number] };
  mouseInfluence: { value: number };
  mouseInteractionRadius: { value: number };
};

const vert = /* glsl */ `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

// Two things pulse here: a ripple travelling out from centre (displacing the
// grid UVs), and the vertical lines breathing in thickness once per second.
const frag = /* glsl */ `precision highp float;
uniform float iTime;
uniform vec2 iResolution;
uniform vec3 gridColor;
uniform float rippleIntensity;
uniform float gridSize;
uniform float gridThickness;
uniform float fadeDistance;
uniform float vignetteStrength;
uniform float glowIntensity;
uniform float opacity;
uniform bool mouseInteraction;
uniform vec2 mousePosition;
uniform float mouseInfluence;
uniform float mouseInteractionRadius;
varying vec2 vUv;

const float PI = 3.141592;

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  float dist = length(uv);
  float wave = sin(PI * (iTime - dist));
  vec2 rippleUv = uv + uv * wave * rippleIntensity;

  if (mouseInteraction && mouseInfluence > 0.0) {
    vec2 mouseUv = mousePosition * 2.0 - 1.0;
    mouseUv.x *= iResolution.x / iResolution.y;
    float mouseDist = length(uv - mouseUv);
    float influence = mouseInfluence *
      exp(-mouseDist * mouseDist / (mouseInteractionRadius * mouseInteractionRadius));
    float mouseWave = sin(PI * (iTime * 2.0 - mouseDist * 3.0)) * influence;
    rippleUv += normalize(uv - mouseUv) * mouseWave * rippleIntensity * 0.3;
  }

  vec2 a = sin(gridSize * 0.5 * PI * rippleUv - PI / 2.0);
  vec2 b = abs(a);

  float aaWidth = 0.5;
  vec2 smoothB = vec2(
    smoothstep(0.0, aaWidth, b.x),
    smoothstep(0.0, aaWidth, b.y)
  );

  vec3 color = vec3(0.0);
  color += exp(-gridThickness * smoothB.x * (0.8 + 0.5 * sin(PI * iTime)));
  color += exp(-gridThickness * smoothB.y);
  color += 0.5 * exp(-(gridThickness / 4.0) * sin(smoothB.x));
  color += 0.5 * exp(-(gridThickness / 3.0) * smoothB.y);

  if (glowIntensity > 0.0) {
    color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.x);
    color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.y);
  }

  float radialFade = exp(-2.0 * clamp(pow(dist, fadeDistance), 0.0, 1.0));

  vec2 vignetteCoords = vUv - 0.5;
  float vignette = clamp(1.0 - pow(length(vignetteCoords) * 2.0, vignetteStrength), 0.0, 1.0);

  float finalFade = radialFade * vignette;
  float alpha = length(color) * finalFade * opacity;
  gl_FragColor = vec4(color * gridColor * finalFade * opacity, alpha);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
    : [1, 1, 1];
}

export default function RippleGrid({
  // --color-act-soft. The action blue (#3d74ff) is too close to the page's
  // own blue ground to read at these opacities.
  gridColor = "#7aa2ff",
  rippleIntensity = 0.03,
  gridSize = 8,
  gridThickness = 20,
  fadeDistance = 1.5,
  vignetteStrength = 1.8,
  glowIntensity = 0.2,
  opacity = 0.45,
  mouseInteraction = true,
  mouseInteractionRadius = 1.5,
}: RippleGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uniformsRef = useRef<Uniforms | null>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const targetMouseRef = useRef({ x: 0.5, y: 0.5 });
  const influenceRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio, 2),
      alpha: true,
    });
    const gl = renderer.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.width = "100%";
    gl.canvas.style.height = "100%";
    container.appendChild(gl.canvas);

    const uniforms: Uniforms = {
      iTime: { value: 0 },
      iResolution: { value: [1, 1] },
      gridColor: { value: hexToRgb(gridColor) },
      rippleIntensity: { value: rippleIntensity },
      gridSize: { value: gridSize },
      gridThickness: { value: gridThickness },
      fadeDistance: { value: fadeDistance },
      vignetteStrength: { value: vignetteStrength },
      glowIntensity: { value: glowIntensity },
      opacity: { value: opacity },
      mouseInteraction: { value: mouseInteraction },
      mousePosition: { value: [0.5, 0.5] },
      mouseInfluence: { value: 0 },
      mouseInteractionRadius: { value: mouseInteractionRadius },
    };
    uniformsRef.current = uniforms;

    const mesh = new Mesh(gl, {
      geometry: new Triangle(gl),
      program: new Program(gl, { vertex: vert, fragment: frag, uniforms }),
    });

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = container;
      renderer.setSize(w, h);
      uniforms.iResolution.value = [w, h];
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      targetMouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: 1 - (e.clientY - rect.top) / rect.height,
      };
    };
    const onMouseEnter = () => { influenceRef.current = 1; };
    const onMouseLeave = () => { influenceRef.current = 0; };

    window.addEventListener("resize", resize);
    if (mouseInteraction) {
      container.addEventListener("mousemove", onMouseMove);
      container.addEventListener("mouseenter", onMouseEnter);
      container.addEventListener("mouseleave", onMouseLeave);
    }
    resize();

    let raf = 0;
    const render = (t: number) => {
      // Freeze the clock under reduced-motion so the grid renders statically.
      uniforms.iTime.value = reduceMotion ? 0 : t * 0.001;

      mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.1;
      mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.1;
      uniforms.mouseInfluence.value += (influenceRef.current - uniforms.mouseInfluence.value) * 0.05;
      uniforms.mousePosition.value = [mouseRef.current.x, mouseRef.current.y];

      renderer.render({ scene: mesh });
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (mouseInteraction) {
        container.removeEventListener("mousemove", onMouseMove);
        container.removeEventListener("mouseenter", onMouseEnter);
        container.removeEventListener("mouseleave", onMouseLeave);
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
    };
    // Re-created only on mount; live prop changes are pushed via the effect below.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const u = uniformsRef.current;
    if (!u) return;
    u.gridColor.value = hexToRgb(gridColor);
    u.rippleIntensity.value = rippleIntensity;
    u.gridSize.value = gridSize;
    u.gridThickness.value = gridThickness;
    u.fadeDistance.value = fadeDistance;
    u.vignetteStrength.value = vignetteStrength;
    u.glowIntensity.value = glowIntensity;
    u.opacity.value = opacity;
    u.mouseInteraction.value = mouseInteraction;
    u.mouseInteractionRadius.value = mouseInteractionRadius;
  }, [
    gridColor,
    rippleIntensity,
    gridSize,
    gridThickness,
    fadeDistance,
    vignetteStrength,
    glowIntensity,
    opacity,
    mouseInteraction,
    mouseInteractionRadius,
  ]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="h-full w-full overflow-hidden [&_canvas]:block"
    />
  );
}
