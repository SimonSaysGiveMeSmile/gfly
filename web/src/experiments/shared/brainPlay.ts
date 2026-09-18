/**
 * How a creature's brain takes part in a game. The game's own bot proposes
 * a few sensible candidates; each is shown to the connectome as a coded
 * pattern on the eyes and the mushroom body's verdict (approach minus avoid
 * output rates) ranks them. Lessons afterwards reward or punish the codes
 * that mattered, which changes that brain's synapses. Any game can use this:
 * a mahjong tile, a chess move, a poker action or a sudoku digit is just a
 * code number.
 */
import type { BrainsApi, Verdict } from "./FlyBrains";

export interface Candidate<T> { item: T; code: number }

/**
 * Pick from `cands` with the brain at `seat`. "like" returns what the brain
 * approaches most (a move to make), "dislike" what it avoids most (a tile to
 * throw). Resolves null if the brain is not ready, so the caller can fall
 * back to its bot.
 */
export async function brainChoose<T>(api: BrainsApi | null, seat: number, cands: Candidate<T>[], prefer: "like" | "dislike"): Promise<{ item: T; verdicts: Verdict[] } | null> {
  if (!api || !api.ready(seat) || cands.length === 0) return null;
  const verdicts: Verdict[] = [];
  for (const c of cands) verdicts.push(await api.look(seat, c.code));   // one look at a time; the eyes are shared
  let best = 0;
  for (let i = 1; i < verdicts.length; i++) {
    const a = verdicts[i].approach - verdicts[i].avoid, b = verdicts[best].approach - verdicts[best].avoid;
    if (prefer === "like" ? a > b : a < b) best = i;
  }
  return { item: cands[best].item, verdicts };
}

/** Teach several codes in a row. Resolves with synapses changed in total. */
export async function brainTeach(api: BrainsApi | null, seat: number, codes: number[], reward: 1 | -1): Promise<number> {
  if (!api || !api.ready(seat)) return 0;
  let n = 0;
  for (const c of [...new Set(codes)]) n += await api.teach(seat, c, reward);
  return n;
}

/** A stable code for a string, in the range the eyes can tell apart. */
export function codeOf(s: string, space = 4096): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % space;
}
