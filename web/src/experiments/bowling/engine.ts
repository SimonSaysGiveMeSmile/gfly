/**
 * Ten-pin bowling on a lane in the garden, at the creature's scale: a real
 * lane's dimensions times 0.125, so a 22 cm bowler stands where a 1.75 m
 * one would. The ball and the pins are rigid discs on the lane: the ball
 * rolls, hooks late if asked, and drops into the gutter if it strays; a
 * pin it strikes takes an impulse by the two masses and slides, knocking
 * what it meets, and a pin that goes over sweeps the pin behind it as it
 * falls. Pins that leave the deck are down. Scoring is the real thing.
 * Nothing here is random.
 */

export const S = 0.125;
export const LANE_L = 18.29 * S, LANE_W = 1.0668 * S, GUTTER_W = 0.235 * S, APPROACH = 4.57 * S, DECK = 0.86 * S;
export const BALL_R = 0.109 * S, PIN_R = 0.06 * S, PIN_H = 0.381 * S, PIN_SPACING = 0.3048 * S;
export const FOUL_Z = 0, HEAD_Z = -LANE_L, PIT_Z = HEAD_Z - PIN_SPACING * 3 - DECK;
const BALL_M = 7, PIN_M = 1.5, SPEED = 7.5 * S, ROLL_DECEL = 0.05, HOOK_FROM = 0.6;
const E_BALL_PIN = 0.4, E_PIN_PIN = 0.55, PIN_SLIDE = 0.55, LYING_R = 0.011, KNOCK = 0.06;
const DT = 1 / 480, FRAME = 1 / 60;

/** Pin positions, numbered like the sport: 1 at the front, 7 to 10 at the back. */
export const PINS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let row = 0; row < 4; row++) for (let i = 0; i <= row; i++) out.push([(i - row / 2) * PIN_SPACING, HEAD_Z - row * PIN_SPACING * Math.sqrt(3) / 2]);
  return out;
})();

/** One frame of a roll: ball x,z then per pin x,z, down (0/1), fall dx, dz, and the time it went. */
export interface RollResult { frames: Float32Array[]; knocked: boolean[]; pins: number; gutter: boolean; duration: number }

/** How far sideways a hook of `hook` moves the ball by the head pin, so the line can allow for it. */
export const hookShift = (hook: number) => { const t = (LANE_L * (1 - HOOK_FROM)) / SPEED * 1.08; return 0.5 * hook * t * t; };

export function roll(standing: boolean[], x0: number, targetX: number, hook: number): RollResult {
  // The straight part of the line aims short of the target by the hook, so a hooking ball still arrives there, at an angle.
  const dirX = targetX - hookShift(hook) - x0, dirZ = HEAD_Z - FOUL_Z, len = Math.hypot(dirX, dirZ);
  let bx = x0, bz = FOUL_Z, bvx = (dirX / len) * SPEED, bvz = (dirZ / len) * SPEED;
  const n = 10;
  const px = new Float64Array(n), pz = new Float64Array(n), pvx = new Float64Array(n), pvz = new Float64Array(n);
  const up = standing.slice(), down = new Array<boolean>(n).fill(false), gone = new Array<boolean>(n).fill(false);
  const fdx = new Float64Array(n), fdz = new Float64Array(n), fallT = new Float64Array(n).fill(-1);
  for (let i = 0; i < n; i++) { px[i] = PINS[i][0]; pz[i] = PINS[i][1]; }
  const sweeps: { pin: number; t: number; dx: number; dz: number; v: number }[] = [];
  const frames: Float32Array[] = [];
  let t = 0, next = 0, gutter = false, ballOn = true;
  const snap = () => {
    const f = new Float32Array(2 + n * 6);
    f[0] = ballOn ? bx : NaN; f[1] = ballOn ? bz : NaN;
    for (let i = 0; i < n; i++) { const o = 2 + i * 6; f[o] = gone[i] ? NaN : px[i]; f[o + 1] = pz[i]; f[o + 2] = down[i] ? 1 : 0; f[o + 3] = fdx[i]; f[o + 4] = fdz[i]; f[o + 5] = fallT[i]; }
    frames.push(f);
  };
  const knock = (i: number, vx: number, vz: number) => {
    if (down[i] || !up[i]) return;
    down[i] = true; fallT[i] = t;
    const s = Math.hypot(vx, vz) || 1;
    fdx[i] = vx / s; fdz[i] = vz / s;
    // Going over, the pin's length sweeps the pin behind it a moment later.
    sweeps.push({ pin: i, t: t + 0.1, dx: vx / s, dz: vz / s, v: 0.22 + 0.25 * s });
  };
  while (t < 5) {
    // The ball.
    if (ballOn) {
      const s = Math.hypot(bvx, bvz);
      const k = Math.max(0, s - ROLL_DECEL * DT) / (s || 1);
      bvx *= k; bvz *= k;
      if (!gutter && FOUL_Z - bz > LANE_L * HOOK_FROM) bvx += hook * DT;
      bx += bvx * DT; bz += bvz * DT;
      if (!gutter && Math.abs(bx) > LANE_W / 2 - BALL_R * 0.55) { gutter = true; bx = Math.sign(bx) * (LANE_W / 2 + GUTTER_W / 2); bvx = 0; }
      if (bz < PIT_Z - 0.1) ballOn = false;
    }
    // Pins: slide if they are moving, and stop by friction.
    for (let i = 0; i < n; i++) {
      if (!up[i] || gone[i]) continue;
      const s = Math.hypot(pvx[i], pvz[i]);
      if (s > 0) {
        if (!down[i]) { pvx[i] = pvz[i] = 0; continue; }          // a standing pin that was only brushed stays put
        const k = Math.max(0, s - PIN_SLIDE * DT) / s;
        pvx[i] *= k; pvz[i] *= k;
        px[i] += pvx[i] * DT; pz[i] += pvz[i] * DT;
        if (pz[i] < PIT_Z || Math.abs(px[i]) > LANE_W / 2 + 0.01) { gone[i] = true; if (!down[i]) knock(i, pvx[i], pvz[i]); }
      }
    }
    // Sweeps from falling pins.
    for (let k = sweeps.length - 1; k >= 0; k--) {
      const sw = sweeps[k];
      if (t < sw.t) continue;
      sweeps.splice(k, 1);
      const [ox, oz] = PINS[sw.pin];
      for (let j = 0; j < n; j++) {
        if (j === sw.pin || !up[j] || down[j] || gone[j]) continue;
        const dx = px[j] - ox, dz = pz[j] - oz, d = Math.hypot(dx, dz);
        if (d > PIN_H * 0.95 || d < 1e-6) continue;
        const cos = (dx * sw.dx + dz * sw.dz) / d;
        if (cos < 0.87) continue;
        pvx[j] += sw.dx * sw.v * 0.5; pvz[j] += sw.dz * sw.v * 0.5;
        knock(j, pvx[j], pvz[j]);
      }
    }
    // Ball on pin.
    if (ballOn && !gutter) {
      for (let i = 0; i < n; i++) {
        if (!up[i] || gone[i]) continue;
        const r = BALL_R + (down[i] ? LYING_R : PIN_R);
        const dx = px[i] - bx, dz = pz[i] - bz, d = Math.hypot(dx, dz);
        if (d >= r || d === 0) continue;
        const nx = dx / d, nz = dz / d;
        const rel = (bvx - pvx[i]) * nx + (bvz - pvz[i]) * nz;
        const push = r - d;
        px[i] += nx * push; pz[i] += nz * push;
        if (rel <= 0) continue;
        const j = (1 + E_BALL_PIN) * rel / (1 / BALL_M + 1 / PIN_M);
        bvx -= (j / BALL_M) * nx; bvz -= (j / BALL_M) * nz;
        pvx[i] += (j / PIN_M) * nx; pvz[i] += (j / PIN_M) * nz;
        if (Math.hypot(pvx[i], pvz[i]) > KNOCK) knock(i, pvx[i], pvz[i]);
      }
    }
    // Pin on pin.
    for (let i = 0; i < n; i++) {
      if (!up[i] || gone[i]) continue;
      for (let j = i + 1; j < n; j++) {
        if (!up[j] || gone[j]) continue;
        const r = (down[i] ? LYING_R : PIN_R) + (down[j] ? LYING_R : PIN_R);
        const dx = px[j] - px[i], dz = pz[j] - pz[i], d = Math.hypot(dx, dz);
        if (d >= r || d === 0) continue;
        const nx = dx / d, nz = dz / d;
        const rel = (pvx[i] - pvx[j]) * nx + (pvz[i] - pvz[j]) * nz;
        const push = (r - d) / 2;
        if (down[i]) { px[i] -= nx * push; pz[i] -= nz * push; }
        if (down[j]) { px[j] += nx * push; pz[j] += nz * push; }
        if (rel <= 0) continue;
        const imp = rel * (1 + E_PIN_PIN) / 2;
        pvx[i] -= imp * nx; pvz[i] -= imp * nz; pvx[j] += imp * nx; pvz[j] += imp * nz;
        if (Math.hypot(pvx[i], pvz[i]) > KNOCK) knock(i, pvx[i], pvz[i]);
        if (Math.hypot(pvx[j], pvz[j]) > KNOCK) knock(j, pvx[j], pvz[j]);
      }
    }
    t += DT;
    if (t >= next) { snap(); next += FRAME; }
    if (!ballOn && sweeps.length === 0 && t > 1.5) {
      let moving = false;
      for (let i = 0; i < n; i++) if (up[i] && !gone[i] && Math.hypot(pvx[i], pvz[i]) > 0.002) moving = true;
      if (!moving) break;
    }
  }
  snap();
  const knocked = down.map((d, i) => d || gone[i]);
  return { frames, knocked, pins: knocked.filter(Boolean).length, gutter, duration: t };
}

export interface GameState {
  frames: [number[][], number[][]];
  player: 0 | 1;
  frame: number;
  standing: boolean[];
  status: "active" | "over";
  last: { player: 0 | 1; pins: number; kind: "strike" | "spare" | "open" | "roll" | "gutter" } | null;
}

export function createGame(): GameState {
  return { frames: [[], []], player: 0, frame: 0, standing: new Array(10).fill(true), status: "active", last: null };
}

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

export function applyRoll(state: GameState, r: RollResult): GameState {
  const pins = r.pins;
  const frames: [number[][], number[][]] = [state.frames[0].map((f) => f.slice()), state.frames[1].map((f) => f.slice())];
  const mine = frames[state.player];
  if (!mine[state.frame]) mine[state.frame] = [];
  const f = mine[state.frame];
  f.push(pins);
  const tenth = state.frame === 9;
  let standing = state.standing.map((s, i) => s && !r.knocked[i]);
  const kind = r.gutter && pins === 0 ? "gutter" : pins === 10 && f.length === 1 ? "strike" : f.length >= 2 && !standing.some(Boolean) && f[f.length - 1] + f[f.length - 2] === 10 && f[f.length - 2] !== 10 ? "spare" : frameDone(f, tenth) ? "open" : "roll";
  const last = { player: state.player, pins, kind } as GameState["last"];
  if (tenth && !standing.some(Boolean)) standing = new Array(10).fill(true);
  if (!frameDone(f, tenth)) return { ...state, frames, standing, last };
  const nextPlayer: 0 | 1 = state.player === 0 ? 1 : 0;
  const nextFrame = state.player === 1 ? state.frame + 1 : state.frame;
  if (nextFrame > 9) return { ...state, frames, standing, last, status: "over" };
  return { ...state, frames, player: nextPlayer, frame: nextFrame, standing: new Array(10).fill(true), last };
}
