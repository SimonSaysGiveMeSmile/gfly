/**
 * The fly's tennis: a few targets a coach would name, deep to the open
 * court, deep behind the runner, a short angle, the middle for safety,
 * scored by how far the other runner has to go against how close to the
 * lines the ball is asked to land. Serves go wide, down the T, or at the
 * body. The engine then flies the ball and judges it.
 */
import { CL, CW, SERVICE, serveBox, clearance, type GameState, type Pace, type Pt } from "./engine";

export interface Shot { target: Pt; pace: Pace; label: string; score: number }

export function getBestShots(state: GameState, me: 0 | 1, topN = 3): Shot[] {
  const them: 0 | 1 = me === 0 ? 1 : 0;
  const sign = them === 0 ? 1 : -1;                    // their half is z * sign > 0
  const r = state.runners[them];
  const away = r.x > 0 ? -1 : 1;
  const cands: { target: Pt; pace: Pace; label: string }[] = [];
  if (state.serving) {
    const b = serveBox(state);
    const cx = (b.x0 + b.x1) / 2, wide = Math.abs(b.x0) > Math.abs(b.x1) ? b.x0 : b.x1, tee = Math.abs(b.x0) < Math.abs(b.x1) ? b.x0 : b.x1;
    const deep = sign * (SERVICE - 0.12);
    const first = !state.secondServe;
    cands.push({ target: { x: wide * 0.8, z: deep }, pace: first ? "hard" : "firm", label: "wide" });
    cands.push({ target: { x: tee + (cx - tee) * 0.15, z: deep }, pace: first ? "hard" : "firm", label: "T" });
    cands.push({ target: { x: cx, z: sign * (SERVICE - 0.2) }, pace: first ? "firm" : "soft", label: "body" });
  } else {
    const deep = sign * (CL / 2 - 0.22);
    cands.push({ target: { x: away * (CW / 2 - 0.12), z: deep }, pace: "hard", label: "open, deep" });
    cands.push({ target: { x: away * (CW / 2 - 0.16), z: sign * (CL / 2 - 0.35) }, pace: "firm", label: "open" });
    cands.push({ target: { x: r.x * 0.9, z: deep }, pace: "hard", label: "behind" });
    cands.push({ target: { x: away * 0.3, z: sign * 0.45 }, pace: "soft", label: "drop" });
    cands.push({ target: { x: 0, z: sign * (CL / 2 - 0.4) }, pace: "firm", label: "middle" });
  }
  // A ball that would clip the tape is hit softer, as anyone would.
  const PACES: Pace[] = ["hard", "firm", "soft"];
  for (const c of cands) {
    let i = PACES.indexOf(c.pace);
    while (i < PACES.length - 1 && clearance(state, c.target, PACES[i]) < 0.015) i++;
    c.pace = PACES[i];
  }
  const shots: Shot[] = cands.map((c) => {
    const run = Math.hypot(c.target.x - r.x, c.target.z - r.z);
    const edge = Math.min(CW / 2 - Math.abs(c.target.x), (state.serving ? SERVICE : CL / 2) - Math.abs(c.target.z));
    const risk = ({ soft: 0.06, firm: 0.11, hard: 0.2 } as const)[c.pace] * (1 + state.stretch[me] * 3);
    const score = run * 4 - Math.max(0, risk - edge) * 40 + Math.random() * 0.5;
    return { ...c, score };
  });
  shots.sort((a, b) => b.score - a.score);
  return shots.slice(0, topN);
}
