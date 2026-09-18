/**
 * Putting on a garden green at the creature's scale: a real green's size
 * times 0.125, with slopes. The surface is a height field, a gentle tilt
 * and a few smooth mounds per hole; the ball rolls down its gradient
 * under scaled gravity and against the felt's friction, more in the
 * fringe and much more in the rough, and the cup takes it if it arrives
 * slowly enough. You click where the ball would stop on a flat green; on
 * a slope you have to read the break, as anyone does.
 */

export const S = 0.125;
export const GREEN_R = 1.9, FRINGE_R = 2.2, BALL_R = 0.008, CUP_R = 0.012, G = 9.81 * S;
const MU_GREEN = 0.075, MU_FRINGE = 0.22, MU_ROUGH = 0.5, LIP = 0.22, DT = 1 / 240, FRAME = 1 / 60, MAX_T = 14;
export const MAX_STROKES = 6;

export interface Mound { x: number; z: number; a: number; s: number }
export interface Hole { tee: [number, number]; cup: [number, number]; tilt: [number, number]; mounds: Mound[]; par: number }
export const HOLES: Hole[] = [
  { tee: [0, 0.55], cup: [0, -0.35], tilt: [0.006, 0], mounds: [], par: 2 },
  { tee: [-0.7, 0.7], cup: [0.55, -0.5], tilt: [0, 0], mounds: [{ x: 0, z: 0.05, a: 0.022, s: 0.38 }], par: 2 },
  { tee: [0.9, 0.35], cup: [-0.75, -0.25], tilt: [0, 0.01], mounds: [{ x: -0.15, z: 0.35, a: 0.026, s: 0.42 }], par: 2 },
  { tee: [0.05, 1.15], cup: [0.1, -0.65], tilt: [0.004, -0.004], mounds: [{ x: 0.35, z: 0.2, a: 0.03, s: 0.4 }, { x: -0.3, z: 0.25, a: 0.03, s: 0.4 }], par: 3 },
  { tee: [-1.05, -0.85], cup: [0.95, 0.75], tilt: [0.008, -0.006], mounds: [{ x: 0.1, z: -0.1, a: -0.02, s: 0.5 }], par: 3 },
];

/** The green's height at (x, z). */
export function height(h: Hole, x: number, z: number): number {
  let y = h.tilt[0] * x + h.tilt[1] * z;
  for (const m of h.mounds) { const dx = x - m.x, dz = z - m.z; y += m.a * Math.exp(-(dx * dx + dz * dz) / (2 * m.s * m.s)); }
  return y;
}
function slope(h: Hole, x: number, z: number): [number, number] {
  let gx = h.tilt[0], gz = h.tilt[1];
  for (const m of h.mounds) {
    const dx = x - m.x, dz = z - m.z, e = m.a * Math.exp(-(dx * dx + dz * dz) / (2 * m.s * m.s));
    gx += e * (-dx / (m.s * m.s)); gz += e * (-dz / (m.s * m.s));
  }
  return [gx, gz];
}
const mu = (x: number, z: number) => { const r = Math.hypot(x, z); return r < GREEN_R ? MU_GREEN : r < FRINGE_R ? MU_FRINGE : MU_ROUGH; };

export interface Putt { path: Float32Array; holed: boolean; final: [number, number]; duration: number }

/** The speed that brings a ball to rest after `dist` metres on a flat green. */
export const speedFor = (dist: number) => Math.min(1.6, Math.sqrt(2 * MU_GREEN * Math.max(0.005, dist)));

export function simulate(hole: Hole, from: [number, number], angle: number, speed: number): Putt {
  let x = from[0], z = from[1], vx = Math.sin(angle) * speed, vz = -Math.cos(angle) * speed;
  const path: number[] = [x, z];
  let t = 0, next = FRAME, holed = false;
  while (t < MAX_T) {
    const [gx, gz] = slope(hole, x, z);
    const s = Math.hypot(vx, vz);
    const m = mu(x, z);
    // Downhill pull, and friction against the motion.
    let ax = -G * gx, az = -G * gz;
    if (s > 1e-4) { ax -= m * G * (vx / s); az -= m * G * (vz / s); }
    else if (Math.hypot(ax, az) < m * G) { break; }                 // it sits still
    vx += ax * DT; vz += az * DT;
    const s2 = Math.hypot(vx, vz);
    if (s > 1e-4 && s2 > 1e-4 && (vx * (vx - ax * DT) + vz * (vz - az * DT)) < 0 && Math.hypot(-G * gx, -G * gz) < m * G) { vx = vz = 0; break; }   // friction stopped it
    x += vx * DT; z += vz * DT; t += DT;
    const dc = Math.hypot(x - hole.cup[0], z - hole.cup[1]);
    if (dc < CUP_R - BALL_R * 0.35 && s2 < LIP) { holed = true; x = hole.cup[0]; z = hole.cup[1]; path.push(x, z); break; }
    if (Math.hypot(x, z) > FRINGE_R + 1.2) { vx = vz = 0; break; }
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

/** Who putts next: the one farther from the cup, as the rules have it; anyone in or picked up is skipped. */
function nextTurn(s: GameState): 0 | 1 | null {
  const done = (p: 0 | 1) => s.holed[p] || s.strokes[p] >= MAX_STROKES;
  const cup = HOLES[s.hole].cup;
  const d = (p: 0 | 1) => Math.hypot(s.balls[p][0] - cup[0], s.balls[p][1] - cup[1]);
  if (done(0) && done(1)) return null;
  if (done(0)) return 1;
  if (done(1)) return 0;
  return d(0) >= d(1) ? 0 : 1;
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
  const nt = nextTurn(s);
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
