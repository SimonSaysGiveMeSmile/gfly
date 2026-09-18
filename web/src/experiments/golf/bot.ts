/**
 * The fly's putting: straight at the cup, a lag that stops short, and a
 * bank off each rim aimed at the cup's reflection, all rolled in the same
 * simulator to see where they finish. The best few are the candidates.
 */
import { GREEN, HOLES, simulate, speedFor, type GameState, type Putt } from "./engine";

export interface Line { angle: number; speed: number; label: string; result: Putt; score: number }

export function getBestLines(state: GameState, player: 0 | 1, topN = 3): Line[] {
  const hole = HOLES[state.hole];
  const [bx, bz] = state.balls[player];
  const [cx, cz] = hole.cup;
  const aimAt = (tx: number, tz: number, extra: number, label: string) => {
    const d = Math.hypot(tx - bx, tz - bz);
    return { angle: Math.atan2(tx - bx, -(tz - bz)), speed: speedFor(d + extra), label };
  };
  const tries = [
    aimAt(cx, cz, 0.05, "cup"),
    aimAt(cx, cz, -0.03, "lag"),
    aimAt(cx, cz, 0.12, "firm"),
  ];
  const half = GREEN / 2;
  // Bank shots: aim at the cup mirrored in each rim. The bounce loses pace, so ask for a little more.
  tries.push(aimAt(-half * 2 - cx, cz, 0.16, "bank W"));
  tries.push(aimAt(half * 2 - cx, cz, 0.16, "bank E"));
  tries.push(aimAt(cx, -half * 2 - cz, 0.16, "bank N"));
  tries.push(aimAt(cx, half * 2 - cz, 0.16, "bank S"));
  const lines: Line[] = tries.map((t) => {
    const jitter = (Math.random() - 0.5) * 0.02;
    const result = simulate(hole, [bx, bz], t.angle + jitter, t.speed);
    const dist = Math.hypot(result.final[0] - cx, result.final[1] - cz);
    return { ...t, angle: t.angle + jitter, result, score: result.holed ? 100 : -dist * 100 };
  });
  lines.sort((a, b) => b.score - a.score);
  return lines.slice(0, topN);
}
