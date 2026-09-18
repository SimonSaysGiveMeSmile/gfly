/**
 * The fly's putting: it reads the green by trying lines, the cup's line at
 * a few paces and a fan of offsets either side for the break, all rolled
 * in the same simulator to see where they finish. The best few are the
 * candidates.
 */
import { HOLES, simulate, speedFor, type GameState, type Putt } from "./engine";

export interface Line { angle: number; speed: number; label: string; result: Putt; score: number }

export function getBestLines(state: GameState, player: 0 | 1, topN = 3): Line[] {
  const hole = HOLES[state.hole];
  const [bx, bz] = state.balls[player];
  const [cx, cz] = hole.cup;
  const d = Math.hypot(cx - bx, cz - bz);
  const base = Math.atan2(cx - bx, -(cz - bz));
  const lines: Line[] = [];
  for (const off of [0, 1.5, -1.5, 3, -3, 5, -5, 8, -8]) {
    for (const k of [0.98, 1.06, 1.16, 1.3]) {
      const angle = base + (off * Math.PI) / 180, speed = speedFor(d * k);
      const result = simulate(hole, [bx, bz], angle, speed);
      const dist = Math.hypot(result.final[0] - cx, result.final[1] - cz);
      lines.push({ angle, speed, label: `${off === 0 ? "straight" : `${Math.abs(off)}° ${off > 0 ? "right" : "left"}`}, ${k < 1 ? "soft" : k < 1.1 ? "firm" : k < 1.2 ? "brisk" : "hard"}`, result, score: result.holed ? 100 - k : -dist * 100 });
    }
  }
  lines.sort((a, b) => b.score - a.score);
  return lines.slice(0, topN);
}
