/**
 * Ten-pin bowling on a tabletop lane, in two dimensions. A roll is worked
 * out to the end before it is drawn: the ball runs down the lane, hooks
 * late if asked to, drops into the gutter if it strays, and any pin it
 * reaches falls away from it and can take the pins behind it down too.
 * Scoring is the real thing, strikes and spares and the tenth frame's
 * extra balls. Nothing here is random.
 */

export const LANE_L = 0.9, LANE_W = 0.2, BALL_R = 0.018, PIN_R = 0.010, PIN_H = 0.06;
export const FOUL_Z = LANE_L / 2, PIN_SPACING = 0.052;
const SPEED = 0.48, HOOK_FROM = 0.5, FRAME = 1 / 60, DT = 1 / 240;

/** Pin positions, numbered like the sport: 1 at the front, 7 to 10 at the back. */
export const PINS: [number, number][] = (() => {
  const out: [number, number][] = [];
  const rowZ = (row: number) => -0.30 - row * PIN_SPACING * Math.sqrt(3) / 2;
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) out.push([(i - row / 2) * PIN_SPACING, rowZ(row)]);
  return out;
})();

export interface Fall { pin: number; t: number; dx: number; dz: number }
export interface RollResult { path: Float32Array; falls: Fall[]; gutter: boolean; duration: number }

/**
 * Roll from `x0` at the foul line toward `targetX` at the head pin, with
 * `hook` metres per second squared of sideways pull over the last half.
 */
export function roll(standing: boolean[], x0: number, targetX: number, hook: number): RollResult {
  const zTarget = PINS[0][1];
  const dirX = targetX - x0, dirZ = zTarget - FOUL_Z;
  const len = Math.hypot(dirX, dirZ);
  let x = x0, z = FOUL_Z, vx = (dirX / len) * SPEED, vz = (dirZ / len) * SPEED;
  const up = standing.slice();
  const falls: Fall[] = [];
  const path: number[] = [x, z];
  let t = 0, next = FRAME, gutter = false;
  const knock = (pin: number, dx: number, dz: number, when: number) => {
    up[pin] = false;
    const d = Math.hypot(dx, dz) || 1;
    falls.push({ pin, t: when, dx: dx / d, dz: dz / d });
    // A falling pin travels a little way and takes pins in its path with it.
    const [px, pz] = PINS[pin];
    for (let k = 1; k <= 8; k++) {
      const qx = px + (dx / d) * k * 0.012, qz = pz + (dz / d) * k * 0.012;
      for (let j = 0; j < 10; j++) {
        if (!up[j]) continue;
        const [jx, jz] = PINS[j];
        if (Math.hypot(jx - qx, jz - qz) < PIN_R * 2.3) knock(j, jx - px, jz - pz, when + k * 0.03);
      }
    }
  };
  while (z > -LANE_L / 2 - 0.05 && t < 6) {
    const travelled = FOUL_Z - z;
    if (!gutter && travelled > LANE_L * HOOK_FROM) vx += hook * DT;
    x += vx * DT; z += vz * DT; t += DT;
    if (!gutter && Math.abs(x) > LANE_W / 2 - BALL_R * 0.6) { gutter = true; x = Math.sign(x) * (LANE_W / 2 + 0.018); vx = 0; }
    if (!gutter) {
      for (let p = 0; p < 10; p++) {
        if (!up[p]) continue;
        const [px, pz] = PINS[p];
        const dx = px - x, dz = pz - z;
        if (Math.hypot(dx, dz) < BALL_R + PIN_R) {
          knock(p, dx + vx * 0.02, dz + vz * 0.02, t);
          // The ball is nudged the other way and slowed a touch.
          const side = dx * vz - dz * vx;
          const turn = (side > 0 ? -1 : 1) * 0.12;
          const c = Math.cos(turn), s = Math.sin(turn);
          const nvx = vx * c - vz * s, nvz = vx * s + vz * c;
          vx = nvx * 0.93; vz = nvz * 0.93;
        }
      }
    }
    if (t >= next) { path.push(x, z); next += FRAME; }
  }
  path.push(x, z);
  falls.sort((a, b) => a.t - b.t);
  return { path: Float32Array.from(path), falls, gutter, duration: t };
}

export interface GameState {
  /** Pins down per roll, per frame, per player. */
  frames: [number[][], number[][]];
  player: 0 | 1;
  frame: number;            // 0..9
  standing: boolean[];
  status: "active" | "over";
  last: { player: 0 | 1; pins: number; kind: "strike" | "spare" | "open" | "roll" | "gutter" } | null;
}

export function createGame(): GameState {
  return { frames: [[], []], player: 0, frame: 0, standing: new Array(10).fill(true), status: "active", last: null };
}

/** Cumulative score after each frame, null where a frame is not yet decided. */
export function scoreFrames(frames: number[][]): (number | null)[] {
  const rolls: number[] = frames.flat();
  const out: (number | null)[] = [];
  let i = 0, total = 0;
  for (let f = 0; f < 10; f++) {
    const a = rolls[i], b = rolls[i + 1], c = rolls[i + 2];
    if (a === undefined) { out.push(null); continue; }
    if (f < 9 && a === 10) { if (b === undefined || c === undefined) { out.push(null); continue; } total += 10 + b + c; i += 1; }
    else if (f < 9 && b !== undefined && a + b === 10) { if (c === undefined) { out.push(null); continue; } total += 10 + c; i += 2; }
    else if (f < 9) { if (b === undefined) { out.push(null); continue; } total += a + b; i += 2; }
    else {
      const need = a === 10 || (b !== undefined && a + b === 10) ? 3 : 2;
      const have = [a, b, c].filter((v) => v !== undefined) as number[];
      if (have.length < need) { out.push(null); continue; }
      total += have.slice(0, need).reduce((s, v) => s + v, 0);
    }
    out.push(total);
  }
  return out;
}

const frameDone = (f: number[], tenth: boolean) => tenth
  ? (f.length === 3 || (f.length === 2 && f[0] + f[1] < 10 && f[0] !== 10))
  : (f.length === 2 || f[0] === 10);

/** Record a roll for the current player and move on. */
export function applyRoll(state: GameState, r: RollResult): GameState {
  const pins = r.falls.length;
  const frames: [number[][], number[][]] = [state.frames[0].map((f) => f.slice()), state.frames[1].map((f) => f.slice())];
  const mine = frames[state.player];
  if (!mine[state.frame]) mine[state.frame] = [];
  const f = mine[state.frame];
  f.push(pins);
  const tenth = state.frame === 9;
  let standing = state.standing.map((s, i) => s && !r.falls.some((x) => x.pin === i));
  const kind = r.gutter && pins === 0 ? "gutter" : pins === 10 && f.length === 1 ? "strike" : f.length >= 2 && !standing.some(Boolean) && f[f.length - 1] + f[f.length - 2] === 10 && f[f.length - 2] !== 10 ? "spare" : frameDone(f, tenth) ? "open" : "roll";
  const last = { player: state.player, pins, kind } as GameState["last"];
  // In the tenth a strike or spare gets fresh pins.
  if (tenth && !standing.some(Boolean)) standing = new Array(10).fill(true);
  if (!frameDone(f, tenth)) return { ...state, frames, standing, last };
  const nextPlayer: 0 | 1 = state.player === 0 ? 1 : 0;
  const nextFrame = state.player === 1 ? state.frame + 1 : state.frame;
  if (nextFrame > 9) return { ...state, frames, standing, last, status: "over" };
  return { ...state, frames, player: nextPlayer, frame: nextFrame, standing: new Array(10).fill(true), last };
}
