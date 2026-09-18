/**
 * Tennis on a garden court at the creature's scale: everything is a real
 * court's size times 0.125, so a 22 cm player stands where a 1.75 m one
 * would, and gravity is scaled the same way so a ball takes as long to
 * cross the court as a real one. A shot names a spot and a pace; the
 * engine finds the launch that would land there, perturbs it by the
 * hitter's error (more for pace, more when stretched), then flies the
 * ball under gravity, over or into the net, to a bounce. The other runner
 * gets to the top of the bounce if there is time; otherwise it is a
 * winner. Serves must land in the diagonal box. Scoring is real. The
 * errors come from a seeded generator kept in the state.
 */

export const S = 0.125;
export const CL = 23.77 * S, CW = 8.23 * S, CW2 = 10.97 * S, SERVICE = 6.4 * S, NET_H = 0.914 * S, BALL_R = 0.006, G = 9.81 * S;
const HIT_H = 1.0 * S, SERVE_H = 2.9 * S, RUN = 7 * S, REACH = 1.1 * S, REACT = 0.15, RECOVER = 0.45;
const BOUNCE_Y = 0.72, BOUNCE_XZ = 0.8, DT = 1 / 240, FRAME = 1 / 60;
export type Pace = "soft" | "firm" | "hard";
const SPEED: Record<Pace, number> = { soft: 14 * S, firm: 20 * S, hard: 26 * S };   // 50, 72, 94 km/h groundstrokes
const SERVE_K = 1.4;                                          // a serve of the same effort is faster: 70, 100, 130 km/h
const YAW_ERR: Record<Pace, number> = { soft: 0.012, firm: 0.02, hard: 0.03 };
const SPEED_ERR: Record<Pace, number> = { soft: 0.03, firm: 0.05, hard: 0.08 };

export interface Pt { x: number; z: number }
export interface Pt3 { x: number; y: number; z: number }
export interface GameState {
  points: [number, number];
  games: [number, number];
  server: 0 | 1;
  serving: boolean;
  secondServe: boolean;
  turn: 0 | 1;
  runners: [Pt, Pt];                // you on +z, the fly on −z
  ballAt: Pt3;                      // where the next hit is made from
  stretch: [number, number];        // 0..1, how far the last ball made each runner run
  rally: number;
  status: "active" | "over";
  last: "none" | "in" | "out" | "net" | "winner" | "fault" | "double" | "point";
  seed: number;
}

function rng(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}
function normal(seed: number): [number, number] {
  const [a, s1] = rng(seed), [b, s2] = rng(s1);
  return [Math.sqrt(-2 * Math.log(1 - a)) * Math.cos(2 * Math.PI * b), s2];
}

export const homeZ = (p: 0 | 1) => (p === 0 ? CL / 2 + 0.08 : -(CL / 2 + 0.08));
/** Deuce court on even points: the server stands right of centre (its own right), the receiver across the diagonal. */
export function servePositions(state: Pick<GameState, "points" | "server">): [Pt, Pt] {
  const deuce = (state.points[0] + state.points[1]) % 2 === 0;
  const sx = (state.server === 0 ? 1 : -1) * (deuce ? 1 : -1) * 0.13;   // your right is +x facing −z; the fly's right is −x
  const server: Pt = { x: sx, z: homeZ(state.server) };
  const receiver: Pt = { x: -Math.sign(sx) * 0.2, z: homeZ(state.server === 0 ? 1 : 0) };
  return state.server === 0 ? [server, receiver] : [receiver, server];
}
/** The service box the ball must land in: on the receiver's side, the half with x opposite to the server's. */
export function serveBox(state: Pick<GameState, "points" | "server">): { x0: number; x1: number; z0: number; z1: number } {
  const [a, b] = servePositions(state);
  const server = state.server === 0 ? a : b;
  const xs = -Math.sign(server.x);
  const zs = state.server === 0 ? -1 : 1;
  return { x0: Math.min(0, xs * CW / 2), x1: Math.max(0, xs * CW / 2), z0: Math.min(0, zs * SERVICE), z1: Math.max(0, zs * SERVICE) };
}

export function createGame(seed = Math.floor(Math.random() * 1e9)): GameState {
  const base = { points: [0, 0] as [number, number], server: 0 as const };
  const runners = servePositions(base);
  return { ...base, games: [0, 0], serving: true, secondServe: false, turn: 0, runners, ballAt: { x: runners[0].x, y: SERVE_H, z: runners[0].z }, stretch: [0, 0], rally: 0, status: "active", last: "none", seed };
}

export interface Flight {
  /** x, y, z per frame at 60 fps. */
  path: Float32Array;
  duration: number;
  /** Frame index where the other runner meets the ball, or -1 if nobody does. */
  meet: number;
  landing: Pt | null;
  pace: Pace;
}
export interface HitResult { state: GameState; flight: Flight; outcome: "in" | "out" | "net" | "winner" | "fault" | "double" }

/** Horizontal distance a ball launched at `pitch` with speed `v` from height `h` travels before landing. */
function range(v: number, pitch: number, h: number) {
  const vy = v * Math.sin(pitch), vh = v * Math.cos(pitch);
  const t = (vy + Math.sqrt(vy * vy + 2 * G * h)) / G;
  return vh * t;
}
/** Height of that ball when it has travelled `d` horizontally (NaN if it never gets there). */
function heightAt(v: number, pitch: number, h: number, d: number) {
  const vh = v * Math.cos(pitch);
  if (vh <= 0) return NaN;
  const t = d / vh;
  return h + v * Math.sin(pitch) * t - 0.5 * G * t * t;
}

/** The launch pitch that lands the ball `d` away, low unless the low one would hit the net. */
function solvePitch(v: number, h: number, d: number, dNet: number | null): number {
  let best = -0.35, bestR = -1;
  for (let p = -0.35; p <= 1.3; p += 0.01) { const r = range(v, p, h); if (r > bestR) { bestR = r; best = p; } }
  if (bestR < d) return best;                                   // cannot reach: as far as it goes
  const root = (lo: number, hi: number) => { for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if ((range(v, m, h) - d) * (range(v, lo, h) - d) <= 0) hi = m; else lo = m; } return (lo + hi) / 2; };
  const low = root(-0.35, best);
  if (dNet === null || dNet <= 0 || dNet >= d) return low;
  if (heightAt(v, low, h, dNet) > NET_H + BALL_R + 0.012) return low;
  if (range(v, 1.3, h) >= d) return low;                       // too fast to lob it in: it will find the net
  const high = root(best, 1.3);
  return heightAt(v, high, h, dNet) > NET_H + BALL_R + 0.012 ? high : low;
}

/** How far over the tape the nominal ball to `target` at `pace` would pass (negative: into the net; +Infinity: no net on the way). */
export function clearance(state: GameState, target: Pt, pace: Pace): number {
  const from = state.ballAt;
  const dx = target.x - from.x, dz = target.z - from.z, d = Math.hypot(dx, dz);
  const crosses = Math.sign(from.z) !== Math.sign(target.z);
  if (!crosses) return Infinity;
  const dNet = d * Math.abs(from.z) / Math.abs(dz);
  const v = SPEED[pace] * (state.serving ? SERVE_K : 1);
  const pitch = solvePitch(v, from.y, d, dNet);
  return heightAt(v, pitch, from.y, dNet) - (NET_H + BALL_R);
}

export function hit(state: GameState, target: Pt, pace: Pace): HitResult {
  const me = state.turn, them: 0 | 1 = me === 0 ? 1 : 0;
  const from = state.ballAt;
  const dx = target.x - from.x, dz = target.z - from.z, d = Math.hypot(dx, dz);
  let yaw = Math.atan2(dx, dz);
  const v0 = SPEED[pace] * (state.serving ? SERVE_K : 1);
  // Where the net is along this line, if the line crosses it.
  const crosses = Math.sign(from.z) !== Math.sign(target.z);
  const dNet = crosses ? d * Math.abs(from.z) / Math.abs(dz) : null;
  let pitch = solvePitch(v0, from.y, d, dNet);
  // The hitter's error: in line, in height, in pace. More at pace, more when stretched.
  let seed = state.seed;
  const stretched = 1 + state.stretch[me] * 3;
  let n: number;
  [n, seed] = normal(seed); yaw += n * YAW_ERR[pace] * stretched;
  [n, seed] = normal(seed); pitch += n * YAW_ERR[pace] * 0.3 * stretched;
  [n, seed] = normal(seed); const v = v0 * (1 + n * SPEED_ERR[pace] * stretched);

  // Fly it.
  let x = from.x, y = from.y, z = from.z;
  let vx = v * Math.cos(pitch) * Math.sin(yaw), vy = v * Math.sin(pitch), vz = v * Math.cos(pitch) * Math.cos(yaw);
  const path: number[] = [x, y, z];
  let t = 0, nextFrame = FRAME, bounced = -1, landing: Pt | null = null, netted = false, meet = -1, done = false;
  let apexSeen = false;
  const receiver = state.runners[them];
  let reach = false, meetAt: Pt3 | null = null;
  while (!done && t < 6) {
    const pz = z;
    x += vx * DT; y += vy * DT; z += vz * DT; vy -= G * DT; t += DT;
    if (!netted && Math.sign(pz) !== Math.sign(z) && pz !== 0) {          // crossing the net line
      if (y < NET_H + BALL_R && Math.abs(x) < CW2 / 2 + 0.05) { netted = true; z = pz; vx = -vx * 0.05; vz = -vz * 0.05; vy = Math.min(vy, 0); }
    }
    if (y < BALL_R) {
      y = BALL_R;
      if (bounced < 0 && !netted) { landing = { x, z }; bounced = t; }
      vy = -vy * BOUNCE_Y; vx *= BOUNCE_XZ; vz *= BOUNCE_XZ;
      if (Math.abs(vy) < 0.05) { vy = 0; }
    }
    if (y === BALL_R && vy === 0) { const s = Math.hypot(vx, vz); const k = Math.max(0, s - 0.6 * DT) / (s || 1); vx *= k; vz *= k; }
    // The receiver plays the ball at the top of its first bounce, if it can get there.
    if (bounced > 0 && !apexSeen && vy <= 0 && y > BALL_R) {
      apexSeen = true;
      const need = Math.hypot(x - receiver.x, z - receiver.z);
      reach = need <= REACH + RUN * Math.max(0, t - REACT);
      if (reach) { meetAt = { x, y, z }; meet = path.length / 3; done = true; }
    }
    if (t >= nextFrame) { path.push(x, y, z); nextFrame += FRAME; }
    if (netted && Math.hypot(vx, vz) < 0.01 && y <= BALL_R) done = true;
    if (bounced > 0 && t - bounced > 1.6) done = true;
    if (Math.abs(z) > CL / 2 + 1.5 || Math.abs(x) > CW2 / 2 + 1.5) done = true;
  }
  path.push(x, y, z);
  if (meet >= 0) meet = path.length / 3 - 1;

  // Judge it.
  let outcome: HitResult["outcome"];
  if (netted || !landing) outcome = state.serving ? (state.secondServe ? "double" : "fault") : "net";
  else if (state.serving) {
    const b = serveBox(state);
    const ok = landing.x >= b.x0 - 0.01 && landing.x <= b.x1 + 0.01 && landing.z >= b.z0 - 0.01 && landing.z <= b.z1 + 0.01;
    outcome = ok ? "in" : state.secondServe ? "double" : "fault";
  } else {
    const onTheirSide = them === 0 ? landing.z > 0 : landing.z < 0;
    const inCourt = Math.abs(landing.x) <= CW / 2 + 0.01 && Math.abs(landing.z) <= CL / 2 + 0.01 && onTheirSide;
    outcome = inCourt ? "in" : "out";
  }
  const flight: Flight = { path: Float32Array.from(path), duration: t, meet, landing, pace };
  const runners: [Pt, Pt] = [{ ...state.runners[0] }, { ...state.runners[1] }];
  const hz = homeZ(me);
  runners[me] = { x: state.runners[me].x + (0 - state.runners[me].x) * RECOVER, z: state.runners[me].z + (hz - state.runners[me].z) * RECOVER };
  let next: GameState = { ...state, seed, rally: state.rally + 1, last: outcome };
  if (outcome === "in") {
    if (reach && meetAt) {
      const need = Math.hypot(meetAt.x - receiver.x, meetAt.z - receiver.z);
      runners[them] = { x: meetAt.x, z: meetAt.z };
      const stretch: [number, number] = [state.stretch[0], state.stretch[1]];
      stretch[them] = Math.min(1, need / (REACH + RUN * 0.8)); stretch[me] = 0;
      next = { ...next, runners, turn: them, serving: false, secondServe: false, stretch, ballAt: { x: meetAt.x, y: Math.max(HIT_H * 0.5, meetAt.y), z: meetAt.z } };
    } else {
      outcome = "winner";
      next = award({ ...next, runners, last: "winner" }, me);
    }
  } else if (outcome === "fault") {
    next = { ...next, runners: state.runners, secondServe: true, ballAt: { x: state.runners[me].x, y: SERVE_H, z: state.runners[me].z } };
  } else {
    next = award({ ...next, runners }, them);
  }
  return { state: next, flight, outcome };
}

function award(state: GameState, winner: 0 | 1): GameState {
  const points: [number, number] = [state.points[0], state.points[1]];
  const games: [number, number] = [state.games[0], state.games[1]];
  points[winner]++;
  const loser: 0 | 1 = winner === 0 ? 1 : 0;
  let server = state.server, status: GameState["status"] = "active";
  if (points[winner] >= 4 && points[winner] - points[loser] >= 2) {
    games[winner]++;
    points[0] = points[1] = 0;
    server = server === 0 ? 1 : 0;
    if (games[winner] >= 4) status = "over";
  }
  const runners = servePositions({ points, server });
  const sv = runners[server];
  return { ...state, points, games, server, serving: true, secondServe: false, turn: server, runners, ballAt: { x: sv.x, y: SERVE_H, z: sv.z }, stretch: [0, 0], rally: 0, status };
}

export function callOf(points: [number, number], side: 0 | 1): string {
  const a = points[side], b = points[side === 0 ? 1 : 0];
  if (a >= 3 && b >= 3) return a === b ? "40" : a > b ? "Ad" : "40";
  return ["0", "15", "30", "40"][Math.min(3, a)];
}
