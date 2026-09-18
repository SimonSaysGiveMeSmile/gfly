/**
 * The fly's bowling: a few lines a bowler would try, the pocket between
 * the one and the three, the other pocket, straight at the head pin, and
 * whatever is left standing, each rolled in the same simulator to see
 * what falls. The best few are the candidates.
 */
import { PINS, roll, type GameState, type RollResult } from "./engine";

export interface Line { x0: number; targetX: number; hook: number; label: string; pins: number; result: RollResult }

export function getBestLines(state: GameState, topN = 3): Line[] {
  const up = state.standing;
  const tries: { x0: number; targetX: number; hook: number; label: string }[] = [];
  if (up[0]) {
    tries.push({ x0: -0.02, targetX: 0.012, hook: 0.05, label: "1–3" });
    tries.push({ x0: 0.02, targetX: -0.012, hook: -0.05, label: "1–2" });
    tries.push({ x0: 0, targetX: 0, hook: 0, label: "head" });
  }
  // Whatever stands: aim at each standing pin, and between pairs.
  const stand = PINS.map((p, i) => ({ i, x: p[0], z: p[1] })).filter((p) => up[p.i]);
  for (const p of stand) tries.push({ x0: p.x * 0.4, targetX: p.x, hook: 0, label: `${p.i + 1}` });
  for (let a = 0; a < stand.length; a++) for (let b = a + 1; b < stand.length; b++) {
    if (Math.abs(stand[a].x - stand[b].x) > 0.06) continue;
    const mx = (stand[a].x + stand[b].x) / 2;
    tries.push({ x0: mx * 0.4, targetX: mx, hook: 0, label: `${stand[a].i + 1}–${stand[b].i + 1}` });
  }
  const seen = new Set<string>();
  const lines: Line[] = [];
  for (const t of tries) {
    const k = `${t.x0.toFixed(3)}:${t.targetX.toFixed(3)}:${t.hook}`;
    if (seen.has(k)) continue; seen.add(k);
    const jitter = (Math.random() - 0.5) * 0.008;              // no one bowls the same ball twice
    const result = roll(up, t.x0, t.targetX + jitter, t.hook);
    lines.push({ ...t, targetX: t.targetX + jitter, pins: result.falls.length, result });
  }
  lines.sort((a, b) => b.pins - a.pins);
  return lines.slice(0, topN);
}
