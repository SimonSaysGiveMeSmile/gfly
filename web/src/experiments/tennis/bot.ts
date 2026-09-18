/**
 * The fly's tennis: a few targets a coach would name, deep to the open
 * court, deep behind the runner, a short angle, the middle for safety,
 * scored by how far the other runner has to go against how close to the
 * lines the ball is asked to land. Serves go to the corners of the box.
 */
import { CL, CW, SERVICE, type GameState, type Pace, type Pt } from "./engine";

export interface Shot { target: Pt; pace: Pace; label: string; score: number }

export function getBestShots(state: GameState, me: 0 | 1, topN = 3): Shot[] {
  const them: 0 | 1 = me === 0 ? 1 : 0;
  const sign = them === 0 ? 1 : -1;                    // their half is z * sign > 0
  const r = state.runners[them];
  const away = r.x > 0 ? -1 : 1;                       // the open side
  const cands: { target: Pt; pace: Pace; label: string }[] = [];
  if (state.serving) {
    cands.push({ target: { x: 0.13, z: sign * (SERVICE - 0.05) }, pace: state.secondServe ? "firm" : "hard", label: "wide" });
    cands.push({ target: { x: -0.13, z: sign * (SERVICE - 0.05) }, pace: state.secondServe ? "firm" : "hard", label: "wide" });
    cands.push({ target: { x: 0.03 * away, z: sign * (SERVICE - 0.06) }, pace: state.secondServe ? "soft" : "firm", label: "T" });
    cands.push({ target: { x: r.x * 0.5, z: sign * (SERVICE - 0.08) }, pace: "firm", label: "body" });
  } else {
    cands.push({ target: { x: away * 0.14, z: sign * (CL / 2 - 0.07) }, pace: "hard", label: "open, deep" });
    cands.push({ target: { x: away * 0.12, z: sign * (CL / 2 - 0.1) }, pace: "firm", label: "open" });
    cands.push({ target: { x: r.x * 0.9, z: sign * (CL / 2 - 0.06) }, pace: "hard", label: "behind" });
    cands.push({ target: { x: away * 0.15, z: sign * 0.14 }, pace: "soft", label: "drop" });
    cands.push({ target: { x: 0, z: sign * (CL / 2 - 0.12) }, pace: "firm", label: "middle" });
  }
  const shots: Shot[] = cands.map((c) => {
    const run = Math.hypot(c.target.x - r.x, c.target.z - r.z);
    const edge = Math.min(CW / 2 - Math.abs(c.target.x), (state.serving ? SERVICE : CL / 2) - Math.abs(c.target.z));
    const risk = ({ soft: 0.02, firm: 0.04, hard: 0.07 } as const)[c.pace] + state.stretch[me] * 0.1;
    const score = run * 10 - Math.max(0, risk - edge) * 120 + Math.random() * 0.8;
    return { ...c, score };
  });
  shots.sort((a, b) => b.score - a.score);
  return shots.slice(0, topN);
}
