/**
 * The fly's pool: for every ball it may hit and every pocket, aim the cue
 * ball at the ghost-ball point, skip shots whose paths are blocked or cut
 * too thin, and try the rest in the simulator. Potting is scored by what
 * the rules make of it. The best few are the candidates.
 */
import { groupOf, POCKETS, R, resolve, simulate, type GameState } from "./engine";

export interface Shot { angle: number; speed: number; target: number; pocket: number; score: number }

function clear(balls: GameState["balls"], ax: number, az: number, bx: number, bz: number, ignore: number[]): boolean {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  for (const b of balls) {
    if (!b.on || ignore.includes(b.id)) continue;
    const t = len2 ? Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.z - az) * dz) / len2)) : 0;
    if (Math.hypot(ax + dx * t - b.x, az + dz * t - b.z) < 2 * R * 0.98) return false;
  }
  return true;
}

export function getBestShots(state: GameState, topN = 3): Shot[] {
  const me = state.turn, cue = state.balls[0];
  const mine = state.groups[me];
  const left = mine ? state.balls.filter((b) => b.on && groupOf(b.id) === mine).length : Infinity;
  const legal = state.balls.filter((b) => b.on && b.id !== 0 && (mine === null ? b.id !== 8 : groupOf(b.id) === mine || (b.id === 8 && left === 0)));
  const shots: Shot[] = [];
  for (const tb of legal) {
    for (let p = 0; p < POCKETS.length; p++) {
      const [px, pz] = POCKETS[p];
      const tx = px - tb.x, tz = pz - tb.z, td = Math.hypot(tx, tz);
      if (td < 1e-6) continue;
      const gx = tb.x - (tx / td) * 2 * R, gz = tb.z - (tz / td) * 2 * R;   // ghost ball
      const cx = gx - cue.x, cz = gz - cue.z, cd = Math.hypot(cx, cz);
      if (cd < R) continue;
      const cut = Math.acos(Math.max(-1, Math.min(1, (cx * tx + cz * tz) / (cd * td))));
      if (cut > Math.PI * 0.42) continue;
      if (!clear(state.balls, cue.x, cue.z, gx, gz, [0, tb.id]) || !clear(state.balls, tb.x, tb.z, px, pz, [0, tb.id])) continue;
      const angle = Math.atan2(cx, -cz);
      const speed = Math.min(1.5, Math.max(0.5, 0.45 + (cd + td / Math.cos(cut)) * 1.2));
      const after = resolve(state, simulate(state.balls, angle, speed));
      let score = -cut * 4 - cd * 2;
      if (after.status === "over") score += after.winner === me ? 200 : -200;
      else if (after.last === "potted" && after.turn === me) score += 40;
      else if (after.last === "scratch" || after.last === "foul") score -= 40;
      shots.push({ angle, speed, target: tb.id, pocket: p, score });
    }
  }
  if (shots.length === 0 && legal.length) {
    // Nothing clean: nudge the nearest legal ball softly.
    const near = legal.slice().sort((a, b) => Math.hypot(a.x - cue.x, a.z - cue.z) - Math.hypot(b.x - cue.x, b.z - cue.z))[0];
    shots.push({ angle: Math.atan2(near.x - cue.x, -(near.z - cue.z)), speed: 0.55, target: near.id, pocket: -1, score: 0 });
  }
  shots.sort((a, b) => b.score - a.score);
  return shots.slice(0, topN);
}
