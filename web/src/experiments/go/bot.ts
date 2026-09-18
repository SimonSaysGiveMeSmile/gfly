/**
 * A small Go player: every legal point is scored by what it does at once,
 * captures, escapes, atari, connection and shape, with the third and fourth
 * lines preferred on a 9x9 board. The best few are the fly's candidates.
 */
import { group, isLegal, neighbours, other, play, type Color, type GameState } from "./engine";

export interface ScoredMove { point: number; score: number }

export function getBestMoves(state: GameState, color: Color, topN = 3): ScoredMove[] {
  const { size, board } = state;
  const moves: ScoredMove[] = [];
  for (let i = 0; i < board.length; i++) {
    if (!isLegal(state, i, color)) continue;
    let s = 0;
    const after = play({ ...state, turn: color }, i);
    const taken = after.captures[color - 1] - state.captures[color - 1];
    s += taken * 12;
    const mine = group(after.board, size, i);
    if (mine.liberties === 1) s -= 14;                              // self-atari
    else if (mine.liberties === 2) s -= 3;
    else s += Math.min(mine.liberties, 4);
    // Saving a group of ours that was in atari, or putting theirs in atari.
    for (const n of neighbours(size, i)) {
      if (board[n] === color) {
        const g = group(board, size, n);
        if (g.liberties === 1 && mine.liberties > 1) s += 8 + g.stones.length * 2;
        s += 1.5;                                                   // connected
      } else if (board[n] === other(color)) {
        const g = group(after.board, size, n);
        if (after.board[n] !== 0 && g.liberties === 1) s += 4 + g.stones.length;
        s += 0.5;
      }
    }
    // Shape: the third and fourth lines, never the first when the board is open.
    const r = Math.floor(i / size), c = i % size;
    const line = Math.min(r, c, size - 1 - r, size - 1 - c) + 1;
    if (line === 1) s -= state.moves < 30 ? 6 : 1;
    else if (line === 2) s -= state.moves < 12 ? 2 : 0;
    else if (line === 3 || line === 4) s += 2;
    else s += 1;
    // A touch of room: empty neighbours are good early.
    s += neighbours(size, i).filter((n) => board[n] === 0).length * 0.4;
    // A little noise so games differ.
    s += Math.random() * 1.2;
    moves.push({ point: i, score: s });
  }
  moves.sort((a, b) => b.score - a.score);
  return moves.slice(0, topN);
}
