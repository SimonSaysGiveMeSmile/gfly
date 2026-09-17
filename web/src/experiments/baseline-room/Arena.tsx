"use client";

import { useEffect, useRef } from "react";
import { FURNITURE, ROOM_H, ROOM_W } from "./world";
import type { Telemetry } from "./protocol";

const PALETTE = {
  floor: "#13160f",
  wall: "#2b3225",
  window: "#c9a94e",
  furniture: "#0b0d08",
  furnitureEdge: "#323a2b",
  trail: "#63e0b4",
  fly: "#d8402c",
  threat: "#000000",
  grid: "#1b2016",
};

/** Top-down view of the room, drawn from the latest telemetry frame. */
export function Arena({ telemetry }: { telemetry: Telemetry | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef<Telemetry | null>(null);
  latest.current = telemetry;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = Math.round((cssW * ROOM_H) / ROOM_W);
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        canvas.style.height = `${cssH}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = cssW / ROOM_W;

      ctx.fillStyle = PALETTE.floor;
      ctx.fillRect(0, 0, cssW, cssH);

      // Floor grid, 100 mm.
      ctx.strokeStyle = PALETTE.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= ROOM_W; x += 100) {
        ctx.moveTo(x * s, 0); ctx.lineTo(x * s, cssH);
      }
      for (let y = 0; y <= ROOM_H; y += 100) {
        ctx.moveTo(0, y * s); ctx.lineTo(cssW, y * s);
      }
      ctx.stroke();

      for (const r of FURNITURE) {
        if (r.kind === "window") {
          const g = ctx.createLinearGradient(0, r.y * s, 0, (r.y + 90) * s);
          g.addColorStop(0, "rgba(201,169,78,0.55)");
          g.addColorStop(1, "rgba(201,169,78,0)");
          ctx.fillStyle = g;
          ctx.fillRect(r.x * s, r.y * s, r.w * s, 90 * s);
          ctx.fillStyle = PALETTE.window;
        } else if (r.kind === "wall") {
          ctx.fillStyle = PALETTE.wall;
        } else {
          ctx.fillStyle = PALETTE.furniture;
        }
        ctx.fillRect(r.x * s, r.y * s, r.w * s, r.h * s);
        if (r.kind === "furniture") {
          ctx.strokeStyle = PALETTE.furnitureEdge;
          ctx.lineWidth = 1;
          ctx.strokeRect(r.x * s + 0.5, r.y * s + 0.5, r.w * s - 1, r.h * s - 1);
          if (r.label) {
            ctx.fillStyle = "#4e5745";
            ctx.font = `${Math.max(9, 10 * s * 1.2)}px ui-monospace, monospace`;
            ctx.fillText(r.label, r.x * s + 8, r.y * s + 18);
          }
        }
      }

      const t = latest.current;
      if (t) {
        // Path history, fading toward the oldest sample.
        const pts = t.trail;
        if (pts.length >= 4) {
          for (let i = 2; i < pts.length; i += 2) {
            const a = (i / pts.length) * 0.5;
            ctx.strokeStyle = `rgba(99,224,180,${a.toFixed(3)})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(pts[i - 2] * s, pts[i - 1] * s);
            ctx.lineTo(pts[i] * s, pts[i + 1] * s);
            ctx.stroke();
          }
        }

        const fx = t.fly.x * s, fy = t.fly.y * s;

        if (t.threat.active && t.threat.size > 0.01) {
          const d = 150 * s;
          const tx = fx + Math.cos(t.threat.bearing) * d;
          const ty = fy + Math.sin(t.threat.bearing) * d;
          const rad = Math.max(3, Math.tan(t.threat.size / 2) * d);
          ctx.fillStyle = "rgba(0,0,0,0.88)";
          ctx.beginPath();
          ctx.arc(tx, ty, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(216,64,44,0.85)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // The fly: body along the heading, with a heading ray.
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(t.fly.heading);
        ctx.strokeStyle = "rgba(216,64,44,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(34, 0);
        ctx.stroke();
        ctx.fillStyle = PALETTE.fly;
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 4.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(233,228,212,0.5)";
        ctx.beginPath();
        ctx.ellipse(-3, -5, 6, 2.4, -0.5, 0, Math.PI * 2);
        ctx.ellipse(-3, 5, 6, 2.4, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      className="w-full border border-rule bg-ink"
      aria-label="Top-down view of the room with the simulated fly"
    />
  );
}
