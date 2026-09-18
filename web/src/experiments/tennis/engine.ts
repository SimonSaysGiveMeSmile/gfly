/**
 * Tennis as a rally of decisions. Each player is a runner on the court;
 * a shot names a spot on the other side and a pace. The ball lands near
 * that spot, off by more the harder it is hit and the more the hitter
 * was stretched to reach the last ball. The other runner gets there if
 * the flight leaves time; otherwise it is a winner. Serves must land in
 * a service box, with a second serve after a fault. Scoring is real:
 * love, fifteen, thirty, forty, deuce, advantage, and the first to four
 * games wins the short set. Errors come from a seeded generator kept in
 * the state, so a rally can be replayed exactly.
 */

export const CL = 0.84, CW = 0.40, SERVICE = 0.21;         // court length, singles width, service line from the net
const RUN = 0.6, REACH = 0.06, RECOVER = 0.45;
export type Pace = "soft" | "firm" | "hard";
const SPEED: Record<Pace, number> = { soft: 0.5, firm: 0.75, hard: 1.05 };
const SCATTER: Record<Pace, number> = { soft: 0.012, firm: 0.026, hard: 0.048 };

export interface Pt { x: number; z: number }
export interface GameState {
  points: [number, number];
  games: [number, number];
  server: 0 | 1;
  serving: boolean;                 // the next hit is a serve
  secondServe: boolean;
  turn: 0 | 1;                      // who hits next
  runners: [Pt, Pt];                // you on +z, the fly on −z
  ball: Pt;
  stretch: [number, number];        // how far each ran for the last ball
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
/** A pair of standard-normal-ish numbers, and the next seed. */
function noise(seed: number): [number, number, number] {
  const [a, s1] = rng(seed), [b, s2] = rng(s1);
  const r = Math.sqrt(-2 * Math.log(1 - a)) ;
  return [r * Math.cos(2 * Math.PI * b), r * Math.sin(2 * Math.PI * b), s2];
}

export const home = (p: 0 | 1): Pt => ({ x: 0, z: p === 0 ? CL / 2 + 0.03 : -(CL / 2 + 0.03) });

export function createGame(seed = Math.floor(Math.random() * 1e9)): GameState {
  return { points: [0, 0], games: [0, 0], server: 0, serving: true, secondServe: false, turn: 0, runners: [home(0), home(1)], ball: home(0), stretch: [0, 0], rally: 0, status: "active", last: "none", seed };
}

export interface Flight { from: Pt; to: Pt; time: number; pace: Pace }
export interface HitResult { state: GameState; flight: Flight; outcome: "in" | "out" | "net" | "winner" | "fault" | "double" }

/** The hitter's half is z > 0 for you, z < 0 for the fly. */
const onSide = (p: 0 | 1, z: number) => (p === 0 ? z > 0 : z < 0);

export function hit(state: GameState, target: Pt, pace: Pace): HitResult {
  const me = state.turn, them: 0 | 1 = me === 0 ? 1 : 0;
  const from = state.runners[me];
  const [nx, nz, seed] = noise(state.seed);
  const scatter = SCATTER[pace] + state.stretch[me] * 0.12;
  const to: Pt = { x: target.x + nx * scatter, z: target.z + nz * scatter };
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  const time = dist / SPEED[pace];
  const flight: Flight = { from, to, time, pace };
  // Where it came down.
  const inCourt = Math.abs(to.x) <= CW / 2 && Math.abs(to.z) <= CL / 2 && onSide(them, to.z);
  const inBox = inCourt && Math.abs(to.z) <= SERVICE;
  const netted = pace !== "soft" && Math.abs(to.z) < 0.07 && dist > 0.45;   // a hard, flat ball from deep clips the tape
  let outcome: HitResult["outcome"];
  if (state.serving) outcome = netted || !inBox ? (state.secondServe ? "double" : "fault") : "in";
  else outcome = netted ? "net" : !inCourt ? "out" : "in";
  let next: GameState = { ...state, seed, ball: to, rally: state.rally + 1, last: outcome };
  // The hitter drifts back toward the middle of the baseline.
  const h = home(me);
  const runners: [Pt, Pt] = [{ ...state.runners[0] }, { ...state.runners[1] }];
  runners[me] = { x: from.x + (h.x - from.x) * RECOVER, z: from.z + (h.z - from.z) * RECOVER };
  if (outcome === "in") {
    const r = runners[them];
    const need = Math.hypot(to.x - r.x, to.z - r.z);
    const canReach = need <= REACH + RUN * (time + 0.12);
    if (canReach) {
      runners[them] = { x: to.x, z: to.z };
      const stretch: [number, number] = [state.stretch[0], state.stretch[1]];
      stretch[them] = need; stretch[me] = 0;
      next = { ...next, runners, turn: them, serving: false, secondServe: false, stretch };
    } else {
      outcome = "winner";
      next = award({ ...next, runners, last: "winner" }, me);
    }
  } else if (outcome === "fault") {
    next = { ...next, runners, secondServe: true };
  } else {
    next = award({ ...next, runners }, them);
  }
  return { state: next, flight, outcome };
}

/** A point to `winner`; games, the set, and the next serve follow. */
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
  return { ...state, points, games, server, serving: true, secondServe: false, turn: server, runners: [home(0), home(1)], ball: home(server), stretch: [0, 0], rally: 0, status, last: state.last === "winner" ? "winner" : state.last === "double" ? "double" : state.last === "out" ? "out" : state.last === "net" ? "net" : "point" };
}

/** "15", "40", "Ad" and so on for one side. */
export function callOf(points: [number, number], side: 0 | 1): string {
  const a = points[side], b = points[side === 0 ? 1 : 0];
  if (a >= 3 && b >= 3) return a === b ? "40" : a > b ? "Ad" : "40";
  return ["0", "15", "30", "40"][Math.min(3, a)];
}
