/**
 * Putting on a tabletop green: five holes on one square of felt with a
 * wooden rim and a few wooden blocks. A putt is rolled to rest before it
 * is drawn: friction slows the ball, the rim and the blocks bounce it, and
 * the cup takes it if it arrives slowly enough. You click where the ball
 * should come to rest on open felt; the engine finds the speed for that.
 */

export const GREEN = 0.8, BALL_R = 0.011, CUP_R = 0.021;
const FRICTION = 0.3, RIM = 0.55, LIP = 0.34, DT = 1 / 240, FRAME = 1 / 60, MAX_T = 10;
export const MAX_STROKES = 6;

export interface Block { x: number; z: number; w: number; d: number }
export interface Hole { tee: [number, number]; cup: [number, number]; blocks: Block[]; par: number }
export const HOLES: Hole[] = [
  { tee: [0, 0.3], cup: [0, -0.3], blocks: [], par: 2 },
  { tee: [-0.26, 0.3], cup: [0.26, -0.28], blocks: [{ x: 0, z: 0, w: 0.05, d: 0.34 }], par: 3 },
  { tee: [0.28, 0.3], cup: [-0.28, -0.3], blocks: [{ x: -0.1, z: -0.05, w: 0.18, d: 0.04 }, { x: 0.16, z: 0.1, w: 0.16, d: 0.04 }], par: 3 },
  { tee: [0, 0.32], cup: [0, -0.32], blocks: [{ x: 0, z: -0.2, w: 0.2, d: 0.04 }], par: 3 },
  { tee: [-0.3, 0.32], cup: [0.3, 0.3], blocks: [{ x: 0, z: 0.16, w: 0.04, d: 0.44 }], par: 3 },
];

export interface Putt { path: Float32Array; holed: boolean; final: [number, number]; duration: number }

/** The speed that brings a ball to rest after `dist` metres on open felt. */
export const speedFor = (dist: number) => Math.min(1.4, Math.sqrt(2 * FRICTION * Math.max(0.005, dist)));

export function simulate(hole: Hole, from: [number, number], angle: number, speed: number): Putt {
  let x = from[0], z = from[1], vx = Math.sin(angle) * speed, vz = -Math.cos(angle) * speed;
  const path: number[] = [x, z];
  let t = 0, next = FRAME, holed = false;
  const half = GREEN / 2 - BALL_R;
  while (t < MAX_T) {
    const s = Math.hypot(vx, vz);
    if (s < 0.008) break;
    const k = Math.max(0, s - FRICTION * DT) / s;
    vx *= k; vz *= k;
    x += vx * DT; z += vz * DT; t += DT;
    if (x < -half) { x = -half; vx = Math.abs(vx) * RIM; } else if (x > half) { x = half; vx = -Math.abs(vx) * RIM; }
    if (z < -half) { z = -half; vz = Math.abs(vz) * RIM; } else if (z > half) { z = half; vz = -Math.abs(vz) * RIM; }
    for (const b of hole.blocks) {
      const hx = b.w / 2 + BALL_R, hz = b.d / 2 + BALL_R;
      const dx = x - b.x, dz = z - b.z;
      if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
      // Push out along the shallower axis and bounce.
      if (hx - Math.abs(dx) < hz - Math.abs(dz)) { x = b.x + Math.sign(dx) * hx; vx = Math.sign(dx) * Math.abs(vx) * RIM; }
      else { z = b.z + Math.sign(dz) * hz; vz = Math.sign(dz) * Math.abs(vz) * RIM; }
    }
    const dc = Math.hypot(x - hole.cup[0], z - hole.cup[1]);
    if (dc < CUP_R - BALL_R * 0.4 && Math.hypot(vx, vz) < LIP) { holed = true; x = hole.cup[0]; z = hole.cup[1]; path.push(x, z); break; }
    if (t >= next) { path.push(x, z); next += FRAME; }
  }
  path.push(x, z);
  return { path: Float32Array.from(path), holed, final: [x, z], duration: t };
}

export interface GameState {
  hole: number;
  balls: [[number, number], [number, number]];
  strokes: [number, number];
  holed: [boolean, boolean];
  totals: [number, number];
  turn: 0 | 1;
  status: "active" | "hole" | "over";
  last: { player: 0 | 1; holed: boolean; dist: number } | null;
}

export function createGame(): GameState {
  const h = HOLES[0];
  return { hole: 0, balls: [[...h.tee], [...h.tee]], strokes: [0, 0], holed: [false, false], totals: [0, 0], turn: 0, status: "active", last: null };
}

/** Who putts next: alternate, skipping anyone who is in or has picked up. */
function nextTurn(s: GameState, after: 0 | 1): 0 | 1 | null {
  const done = (p: 0 | 1) => s.holed[p] || s.strokes[p] >= MAX_STROKES;
  const other: 0 | 1 = after === 0 ? 1 : 0;
  if (!done(other)) return other;
  if (!done(after)) return after;
  return null;
}

export function applyPutt(state: GameState, player: 0 | 1, putt: Putt): GameState {
  const balls: GameState["balls"] = [[...state.balls[0]], [...state.balls[1]]];
  balls[player] = putt.final;
  const strokes: [number, number] = [state.strokes[0], state.strokes[1]];
  strokes[player]++;
  const holed: [boolean, boolean] = [state.holed[0], state.holed[1]];
  holed[player] = putt.holed;
  const cup = HOLES[state.hole].cup;
  const s: GameState = { ...state, balls, strokes, holed, last: { player, holed: putt.holed, dist: Math.hypot(putt.final[0] - cup[0], putt.final[1] - cup[1]) } };
  const nt = nextTurn(s, player);
  if (nt === null) {
    const totals: [number, number] = [state.totals[0] + strokes[0], state.totals[1] + strokes[1]];
    return { ...s, totals, status: state.hole >= HOLES.length - 1 ? "over" : "hole" };
  }
  return { ...s, turn: nt };
}

export function nextHole(state: GameState): GameState {
  if (state.status !== "hole") return state;
  const hole = state.hole + 1, h = HOLES[hole];
  return { ...state, hole, balls: [[...h.tee], [...h.tee]], strokes: [0, 0], holed: [false, false], turn: 0, status: "active", last: null };
}
