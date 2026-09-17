"use client";

/**
 * What each eye sees, and what the first two layers of the visual system
 * make of it. Each dot is one real column of the compound eye at its position
 * from the release's optic-lobe coordinates; there are about 880 per eye.
 */
import { useEffect, useRef } from "react";
import { RETINA_CH } from "./protocol";
import type { FrameBus } from "./bus";

const CHANNELS = [
  { label: "What it sees", ch: 0 },
  { label: "Lamina input", ch: 1 },
  { label: "L1 firing", ch: 2 },
  { label: "L2 firing", ch: 3 },
];

function color(ch: number, v: number): string {
  const t = v / 255;
  if (ch === 0) { const g = Math.round(30 + 200 * t); return `rgb(${g},${g},${g})`; }
  if (ch === 1) { return `rgb(${Math.round(40 + 215 * t)},${Math.round(30 + 110 * t)},${Math.round(60 + 20 * t)})`; }
  if (ch === 2) { return `rgb(${Math.round(20 + 28 * t)},${Math.round(40 + 175 * t)},${Math.round(40 + 60 * t)})`; }
  return `rgb(${Math.round(40 + 215 * t)},${Math.round(40 + 120 * t)},${Math.round(20 + 20 * t)})`;
}

export function RetinaPanel({ bus, className }: { bus: FrameBus; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let latest: { l: Uint8Array; r: Uint8Array } | null = null;
    const off = bus.on((f) => { latest = { l: f.retinaL, r: f.retinaR }; });

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const r = bus.ready;
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.clientWidth;
      const cols = CHANNELS.length;
      const cell = cw / cols;
      const ch = cell * 0.62 * 2 + 28;
      if (canvas.width !== cw * dpr || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = cw * dpr; canvas.height = Math.round(ch * dpr);
        canvas.style.height = `${ch}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.font = "500 11px -apple-system, system-ui, sans-serif";
      ctx.fillStyle = "rgba(235,235,245,0.55)";
      for (let c = 0; c < cols; c++) ctx.fillText(CHANNELS[c].label, c * cell + 8, 14);
      ctx.fillStyle = "rgba(235,235,245,0.35)";
      ctx.fillText("L", 2, 28 + cell * 0.31);
      ctx.fillText("R", 2, 28 + cell * 0.62 + cell * 0.31);
      if (!r || !latest) return;

      const eyes: [Float32Array, Uint8Array][] = [[r.retinaLayoutL, latest.l], [r.retinaLayoutR, latest.r]];
      const rowH = cell * 0.62;
      const dot = Math.max(1.0, cell / 80);
      for (let e = 0; e < 2; e++) {
        const [layout, data] = eyes[e];
        const n = layout.length / 2;
        const y0 = 28 + e * rowH;
        for (let c = 0; c < cols; c++) {
          const x0 = c * cell + 10;
          const w = cell - 20, h = rowH - 8;
          for (let i = 0; i < n; i++) {
            const u = layout[i * 2], v = layout[i * 2 + 1];
            const x = x0 + ((u + 1) / 2) * w;
            const y = y0 + 4 + ((1 - v) / 2) * h;
            ctx.fillStyle = color(CHANNELS[c].ch, data[i * RETINA_CH + CHANNELS[c].ch]);
            ctx.beginPath(); ctx.arc(x, y, dot, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); off(); };
  }, [bus]);

  return <canvas ref={ref} className={className} style={{ width: "100%", display: "block" }} />;
}
