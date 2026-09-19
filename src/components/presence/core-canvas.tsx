"use client";

import { useEffect, useRef } from "react";
import type { PresenceState } from "@/lib/ultron/events";

export type ResourceMode = "quiet" | "normal" | "full";

interface CoreCanvasProps {
  state: PresenceState;
  /** Live 0..1 amplitude (mic while listening, voice envelope while speaking). */
  amplitudeRef: React.RefObject<number>;
  mode: ResourceMode;
}

/** Per-state visual parameters for the golden core. */
const STATE_PARAMS: Record<
  PresenceState,
  { hue: string; ringSpeed: number; particleSpeed: number; glow: number; pulseRate: number }
> = {
  IDLE: { hue: "#c99b3f", ringSpeed: 0.06, particleSpeed: 0.05, glow: 0.55, pulseRate: 0.6 },
  LISTENING: { hue: "#ffd76a", ringSpeed: 0.35, particleSpeed: 0.35, glow: 0.95, pulseRate: 3.2 },
  THINKING: { hue: "#ffb02e", ringSpeed: 0.9, particleSpeed: 0.8, glow: 0.8, pulseRate: 5.0 },
  SPEAKING: { hue: "#ffc65c", ringSpeed: 0.5, particleSpeed: 0.4, glow: 1.0, pulseRate: 6.5 },
  EXECUTING: { hue: "#ff8a3c", ringSpeed: 1.4, particleSpeed: 1.6, glow: 0.9, pulseRate: 4.2 },
  WARNING: { hue: "#ffaa2e", ringSpeed: 0.8, particleSpeed: 0.6, glow: 0.9, pulseRate: 8.0 },
  CONFIRMATION: { hue: "#ffe9a3", ringSpeed: 0.15, particleSpeed: 0.12, glow: 0.85, pulseRate: 2.0 },
  SUCCESS: { hue: "#d8e07a", ringSpeed: 0.5, particleSpeed: 0.5, glow: 1.05, pulseRate: 2.4 },
  ERROR: { hue: "#ff6a3c", ringSpeed: 0.4, particleSpeed: 0.3, glow: 0.9, pulseRate: 7.0 },
};

/**
 * The golden core — original canvas geometry (no assets). Driven ONLY by
 * the event-stream state + live amplitude, so the visual can never show
 * activity that didn't happen.
 */
export function CoreCanvas({ state, amplitudeRef, mode }: CoreCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PresenceState>(state);
  const modeRef = useRef<ResourceMode>(mode);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    let raf = 0;
    let last = 0;
    let running = true;
    const t0 = performance.now();

    interface Particle {
      angle: number;
      radius: number;
      speed: number;
      size: number;
      wobble: number;
    }
    const counts: Record<ResourceMode, number> = { quiet: 150, normal: 340, full: 560 };
    const fps: Record<ResourceMode, number> = { quiet: 20, normal: 30, full: 60 };

    let particles: Particle[] = [];
    let canvasW = 0;
    let canvasH = 0;

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvasW = rect.width;
      canvasH = rect.height;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    }

    function seedParticles() {
      const n = counts[modeRef.current];
      particles = Array.from({ length: n }, () => {
        const ring = Math.random();
        return {
          angle: Math.random() * Math.PI * 2,
          radius: 0.16 + Math.pow(ring, 1.4) * 0.34,
          speed: (0.35 + Math.random() * 0.85) * (Math.random() > 0.5 ? 1 : -1),
          size: 0.6 + Math.random() * 1.6,
          wobble: Math.random() * Math.PI * 2,
        };
      });
    }

    function frame(now: number) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const dt = now - last;
      if (dt < 1000 / fps[modeRef.current]) return;
      last = now;
      if (!ctx) return;

      const t = (now - t0) / 1000;
      const p = STATE_PARAMS[stateRef.current] ?? STATE_PARAMS.IDLE;
      const amp = Math.max(0, Math.min(1, amplitudeRef.current ?? 0));
      const breathing = 0.5 + 0.5 * Math.sin(t * p.pulseRate);
      const effective = Math.max(amp, breathing * 0.35);

      const w = canvasW;
      const h = canvasH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h);

      // ---------- halo glow
      const glowR = R * (0.3 + effective * 0.16);
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR * 1.4);
      halo.addColorStop(0, hexA(p.hue, 0.34 * p.glow));
      halo.addColorStop(0.55, hexA(p.hue, 0.1 * p.glow));
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // ---------- core
      const coreR = R * (0.085 + effective * 0.028);
      const core = ctx.createRadialGradient(cx - coreR * 0.25, cy - coreR * 0.3, 0, cx, cy, coreR);
      core.addColorStop(0, "#fff7dd");
      core.addColorStop(0.35, p.hue);
      core.addColorStop(1, hexA(p.hue, 0.05));
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.shadowColor = p.hue;
      ctx.shadowBlur = 40 * p.glow;
      ctx.fill();
      ctx.shadowBlur = 0;

      // ---------- rings (dashed, counter-rotating)
      const ringDefs = [
        { r: 0.16, segs: 48, dir: 1, width: 1.1, alpha: 0.85 },
        { r: 0.23, segs: 64, dir: -1, width: 1, alpha: 0.6 },
        { r: 0.3, segs: 80, dir: 1, width: 0.8, alpha: 0.4 },
        { r: 0.37, segs: 96, dir: -1, width: 0.6, alpha: 0.25 },
      ];
      ringDefs.forEach((ring, ri) => {
        const radius = R * ring.r * (1 + Math.sin(t * 0.7 + ri) * 0.008);
        const rot = t * p.ringSpeed * ring.dir + ri * 0.6;
        const segLen = (Math.PI * 2) / ring.segs;
        ctx.strokeStyle = hexA(p.hue, ring.alpha);
        ctx.lineWidth = ring.width;
        for (let s = 0; s < ring.segs; s += 3) {
          const a0 = rot + s * segLen;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, a0, a0 + segLen * 1.6);
          ctx.stroke();
        }
      });

      // ---------- orbiting nodes + links
      const nodeCount = 10;
      ctx.lineWidth = 0.6;
      for (let i = 0; i < nodeCount; i++) {
        const a = t * p.ringSpeed * 0.9 + (i / nodeCount) * Math.PI * 2;
        const nr = R * 0.23;
        const nx = cx + Math.cos(a) * nr;
        const ny = cy + Math.sin(a) * nr * 0.98;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = hexA(p.hue, 0.1 + 0.08 * Math.sin(t * 2 + i));
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(nx, ny, 1.6 + effective * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = hexA(p.hue, 0.8);
        ctx.fill();
      }

      // ---------- particle streams
      const inwardBias = stateRef.current === "EXECUTING" ? 0.35 : 0;
      for (const pt of particles) {
        pt.angle += pt.speed * p.particleSpeed * 0.016;
        pt.wobble += 0.02;
        const rr =
          R * (pt.radius - inwardBias * ((t * pt.speed) % 0.2)) +
          Math.sin(pt.wobble) * 3;
        const px = cx + Math.cos(pt.angle) * rr;
        const py = cy + Math.sin(pt.angle) * rr * 0.94;
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(pt.wobble * 1.7));
        ctx.beginPath();
        ctx.arc(px, py, pt.size * (0.7 + effective * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = hexA(p.hue, 0.55 * twinkle);
        ctx.fill();
      }

      // ---------- amplitude spokes (voice/system reactivity)
      if (amp > 0.02) {
        const spokes = 36;
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI * 2 + t * 0.3;
          const inner = R * 0.1;
          const len = R * (0.06 + amp * 0.2 * Math.abs(Math.sin(t * 9 + i * 1.7)));
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
          ctx.lineTo(cx + Math.cos(a) * (inner + len), cy + Math.sin(a) * (inner + len));
          ctx.strokeStyle = hexA("#ffe9a3", 0.35 * amp);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // ---------- state caption
      ctx.font = "600 10px 'SFMono-Regular', Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = hexA("#ffd76a", 0.75);
      ctx.fillText(stateRef.current, cx, cy + R * 0.44);
      ctx.font = "9px 'SFMono-Regular', Menlo, monospace";
      ctx.fillStyle = hexA("#ffb02e", 0.4);
      ctx.fillText("U L T R O N", cx, cy + R * 0.44 + 13);
    }

    function onVisibility() {
      running = document.visibilityState === "visible";
      if (running) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
      }
    }
    function onResize() {
      resize();
      seedParticles();
    }

    resize();
    seedParticles();
    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
    };
  }, [amplitudeRef]);

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full"
      aria-label={`ULTRON core — state ${state}`}
    />
  );
}

function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}
