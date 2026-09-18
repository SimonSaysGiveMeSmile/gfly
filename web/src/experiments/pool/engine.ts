/**
 * Eight-ball on a tabletop, in two dimensions. A shot is simulated to rest
 * before anything is drawn, so the same code animates the balls, judges
 * the shot and lets the fly try its candidates. The rules are the plain
 * ones: solids and stripes are assigned by the first ball potted after the
 * break, potting the eight before your group is cleared loses, potting it
 * afterwards wins, a scratch or hitting the wrong ball first is a foul and
 * gives the other player the cue ball at the head spot. Nothing is called.
 */

export const L = 0.84, W = 0.42, R = 0.0135;                 // table length, width, ball radius (metres)
export const POCKET_R = 0.03;
export const POCKETS: [number, number][] = [[-W / 2, -L / 2], [W / 2, -L / 2], [-W / 2, 0], [W / 2, 0], [-W / 2, L / 2], [W / 2, L / 2]];
export const HEAD = [0, L / 4] as const, FOOT = [0, -L / 4] as const;
const FRICTION = 0.36, STOP = 0.012, RESTITUTION = 0.96, CUSHION = 0.7;
const DT = 1 / 240, FRAME = 1 / 60, MAX_T = 12;

export type Group = "solid" | "stripe";
export interface Ball { id: number; x: number; z: number; on: boolean }
export interface GameState {
  balls: Ball[];
  turn: 0 | 1;
  groups: [Group | null, Group | null];
  breakDone: boolean;
  status: "active" | "over";
  winner: 0 | 1 | null;
  /** What the last shot did, for the caption. */
  last: "none" | "potted" | "scratch" | "foul" | "miss" | "eight" | "win" | "lose";
  shots: number;
}
export interface Frame { p: Float32Array }                    // x,z per ball; NaN when off the table
export interface ShotResult { frames: Frame[]; firstHit: number | null; potted: number[]; final: Ball[] }

export const groupOf = (id: number): Group | null => (id === 0 || id === 8 ? null : id < 8 ? "solid" : "stripe");

export function rack(): Ball[] {
  const balls: Ball[] = [{ id: 0, x: HEAD[0], z: HEAD[1], on: true }];
  // Rows of the triangle from the apex at the foot spot, eight in the middle, a solid and a stripe at the back corners.
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  let k = 0;
  const d = R * 2.02;
  for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) {
    balls.push({ id: order[k++], x: (i - row / 2) * d, z: FOOT[1] - row * d * Math.sqrt(3) / 2, on: true });
  }
  balls.sort((a, b) => a.id - b.id);
  return balls;
}

export function createGame(): GameState {
  return { balls: rack(), turn: 0, groups: [null, null], breakDone: false, status: "active", winner: null, last: "none", shots: 0 };
}

/** A spot for the cue ball at the head, moved along if something sits there. */
export function headSpot(balls: Ball[]): [number, number] {
  for (let k = 0; k < 20; k++) {
    const x = HEAD[0] + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * R * 2.2, z = HEAD[1];
    if (!balls.some((b) => b.on && b.id !== 0 && Math.hypot(b.x - x, b.z - z) < R * 2.1)) return [x, z];
  }
  return [HEAD[0], HEAD[1] + R * 3];
}

export function simulate(start: Ball[], angle: number, speed: number): ShotResult {
  const n = 16;
  const x = new Float64Array(n), z = new Float64Array(n), vx = new Float64Array(n), vz = new Float64Array(n);
  const on = new Array<boolean>(n).fill(false);
  for (const b of start) { x[b.id] = b.x; z[b.id] = b.z; on[b.id] = b.on; }
  vx[0] = Math.sin(angle) * speed; vz[0] = -Math.cos(angle) * speed;   // angle 0 points away from you (−z)
  const frames: Frame[] = [];
  const potted: number[] = [];
  let firstHit: number | null = null;
  let t = 0, nextFrame = 0;
  const snap = () => {
    const p = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { p[i * 2] = on[i] ? x[i] : NaN; p[i * 2 + 1] = on[i] ? z[i] : NaN; }
    frames.push({ p });
  };
  snap();
  let moving = true;
  while (moving && t < MAX_T) {
    moving = false;
    for (let i = 0; i < n; i++) {
      if (!on[i]) continue;
      const s = Math.hypot(vx[i], vz[i]);
      if (s < STOP) { vx[i] = vz[i] = 0; continue; }
      const k = Math.max(0, s - FRICTION * DT) / s;
      vx[i] *= k; vz[i] *= k;
      x[i] += vx[i] * DT; z[i] += vz[i] * DT;
      moving = true;
      // Pockets first: a ball over a pocket mouth drops.
      let dropped = false;
      for (const [px, pz] of POCKETS) if (Math.hypot(x[i] - px, z[i] - pz) < POCKET_R) { on[i] = false; potted.push(i); dropped = true; break; }
      if (dropped) continue;
      // Cushions.
      if (x[i] < -W / 2 + R) { x[i] = -W / 2 + R; vx[i] = Math.abs(vx[i]) * CUSHION; }
      else if (x[i] > W / 2 - R) { x[i] = W / 2 - R; vx[i] = -Math.abs(vx[i]) * CUSHION; }
      if (z[i] < -L / 2 + R) { z[i] = -L / 2 + R; vz[i] = Math.abs(vz[i]) * CUSHION; }
      else if (z[i] > L / 2 - R) { z[i] = L / 2 - R; vz[i] = -Math.abs(vz[i]) * CUSHION; }
    }
    // Ball on ball: equal masses, so the normal components swap.
    for (let i = 0; i < n; i++) {
      if (!on[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!on[j]) continue;
        const dx = x[j] - x[i], dz = z[j] - z[i];
        const d = Math.hypot(dx, dz);
        if (d >= 2 * R || d === 0) continue;
        const nx = dx / d, nz = dz / d;
        const rel = (vx[i] - vx[j]) * nx + (vz[i] - vz[j]) * nz;
        // Separate.
        const push = (2 * R - d) / 2;
        x[i] -= nx * push; z[i] -= nz * push; x[j] += nx * push; z[j] += nz * push;
        if (rel <= 0) continue;
        if (firstHit === null && (i === 0 || j === 0)) firstHit = i === 0 ? j : i;
        const imp = rel * (1 + RESTITUTION) / 2;
        vx[i] -= imp * nx; vz[i] -= imp * nz; vx[j] += imp * nx; vz[j] += imp * nz;
      }
    }
    t += DT;
    if (t >= nextFrame) { snap(); nextFrame += FRAME; }
  }
  snap();
  const final: Ball[] = [];
  for (let i = 0; i < n; i++) final.push({ id: i, x: x[i], z: z[i], on: on[i] });
  return { frames, firstHit, potted, final };
}

/** Apply the rules to a finished shot. */
export function resolve(state: GameState, r: ShotResult): GameState {
  const me = state.turn, them: 0 | 1 = me === 0 ? 1 : 0;
  const balls = r.final.map((b) => ({ ...b }));
  const groups: [Group | null, Group | null] = [state.groups[0], state.groups[1]];
  const mine = groups[me];
  const potted = r.potted.filter((id) => id !== 0);
  const scratch = r.potted.includes(0);
  const pottedEight = potted.includes(8);
  const remaining = (g: Group | null) => (g ? balls.filter((b) => b.on && groupOf(b.id) === g).length : Infinity);
  // The first ball the cue touched had to be one of ours (any ball while the table is open).
  const wrongFirst = r.firstHit === null || (mine !== null && r.firstHit !== 8 && groupOf(r.firstHit) !== mine)
    || (mine !== null && r.firstHit === 8 && remaining(mine) > 0);
  const foul = scratch || wrongFirst;
  const next = (turn: 0 | 1, last: GameState["last"]): GameState => {
    if (foul || scratch) { const [hx, hz] = headSpot(balls); balls[0] = { id: 0, x: hx, z: hz, on: true }; }
    return { ...state, balls, groups, turn, breakDone: true, last, shots: state.shots + 1 };
  };
  if (pottedEight) {
    // The group had to be clear before this shot; the eight going down with your last ball is a loss.
    const cleared = mine !== null && state.balls.filter((b) => b.on && groupOf(b.id) === mine).length === 0;
    const win = cleared && !foul;
    return { ...next(them, win ? "win" : "lose"), status: "over", winner: win ? me : them, last: win ? "win" : "lose" };
  }
  // Assign groups on the first clean pot after the break.
  let assigned = false;
  if (state.breakDone && mine === null && !foul && potted.length > 0) {
    const g = groupOf(potted[0])!;
    groups[me] = g; groups[them] = g === "solid" ? "stripe" : "solid";
    assigned = true;
  }
  if (foul) return next(them, scratch ? "scratch" : "foul");
  const ownPot = potted.some((id) => groupOf(id) === groups[me] || (groups[me] === null && id !== 8));
  if (ownPot || assigned) return next(me, "potted");
  return next(them, potted.length ? "potted" : "miss");
}
