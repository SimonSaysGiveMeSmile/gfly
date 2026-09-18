/**
 * Go on a small board. Stones are captured when their group has no
 * liberties, suicide is illegal, the simple ko rule forbids retaking the
 * single stone just taken, and two passes in a row end the game. Scoring is
 * area scoring (stones plus surrounded empty points) with a komi of 6.5
 * for white, as the fly plays white. Every function returns a new state.
 */

export type Color = 1 | 2;                 // 1 black (you), 2 white (the fly)
export type Cell = 0 | Color;

export interface GameState {
  size: number;
  board: Cell[];                           // row-major, index = row * size + col
  turn: Color;
  /** Point that may not be played this turn because of ko, or -1. */
  ko: number;
  captures: [number, number];              // stones taken by black, by white
  passes: number;                          // consecutive passes
  last: number;                            // last stone played, or -1
  status: "active" | "over";
  moves: number;
}

export const KOMI = 6.5;
export const other = (c: Color): Color => (c === 1 ? 2 : 1);

export function createGame(size = 9): GameState {
  return { size, board: new Array<Cell>(size * size).fill(0), turn: 1, ko: -1, captures: [0, 0], passes: 0, last: -1, status: "active", moves: 0 };
}

export function neighbours(size: number, i: number): number[] {
  const r = Math.floor(i / size), c = i % size, out: number[] = [];
  if (r > 0) out.push(i - size);
  if (r < size - 1) out.push(i + size);
  if (c > 0) out.push(i - 1);
  if (c < size - 1) out.push(i + 1);
  return out;
}

/** The group containing `i` and how many liberties it has. */
export function group(board: readonly Cell[], size: number, i: number): { stones: number[]; liberties: number } {
  const color = board[i];
  const seen = new Set<number>([i]), libs = new Set<number>(), stack = [i], stones: number[] = [];
  while (stack.length) {
    const s = stack.pop()!;
    stones.push(s);
    for (const n of neighbours(size, s)) {
      if (board[n] === 0) libs.add(n);
      else if (board[n] === color && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  return { stones, liberties: libs.size };
}

/** Play a stone; returns the board after captures and which stones were taken, or null if illegal. */
function tryPlay(state: GameState, i: number, color: Color): { board: Cell[]; taken: number[] } | null {
  if (state.board[i] !== 0 || i === state.ko) return null;
  const board = state.board.slice();
  board[i] = color;
  const taken: number[] = [];
  for (const n of neighbours(state.size, i)) {
    if (board[n] === other(color)) {
      const g = group(board, state.size, n);
      if (g.liberties === 0) for (const s of g.stones) { if (board[s] !== 0) { board[s] = 0; taken.push(s); } }
    }
  }
  if (taken.length === 0 && group(board, state.size, i).liberties === 0) return null;   // suicide
  return { board, taken };
}

export function isLegal(state: GameState, i: number, color: Color = state.turn): boolean {
  return state.status === "active" && tryPlay(state, i, color) !== null;
}

export function legalMoves(state: GameState, color: Color = state.turn): number[] {
  const out: number[] = [];
  if (state.status !== "active") return out;
  for (let i = 0; i < state.board.length; i++) if (tryPlay(state, i, color)) out.push(i);
  return out;
}

export function play(state: GameState, i: number): GameState {
  const r = tryPlay(state, i, state.turn);
  if (!r) return state;
  const captures: [number, number] = [state.captures[0], state.captures[1]];
  captures[state.turn - 1] += r.taken.length;
  // Simple ko: one stone took exactly one stone and now sits with one liberty in the hole it made.
  let ko = -1;
  if (r.taken.length === 1) {
    const g = group(r.board, state.size, i);
    if (g.stones.length === 1 && g.liberties === 1) ko = r.taken[0];
  }
  return { ...state, board: r.board, turn: other(state.turn), ko, captures, passes: 0, last: i, moves: state.moves + 1 };
}

export function pass(state: GameState): GameState {
  if (state.status !== "active") return state;
  const passes = state.passes + 1;
  return { ...state, turn: other(state.turn), ko: -1, passes, last: -1, status: passes >= 2 ? "over" : "active", moves: state.moves + 1 };
}

export interface Score { black: number; white: number; territory: Cell[] }

/** Area scoring: each side's stones plus the empty regions only it touches. Dead stones are not judged. */
export function score(state: GameState): Score {
  const { board, size } = state;
  const territory = new Array<Cell>(board.length).fill(0);
  let black = 0, white = 0;
  const seen = new Set<number>();
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 1) black++;
    else if (board[i] === 2) white++;
    else if (!seen.has(i)) {
      const region: number[] = [], stack = [i]; seen.add(i);
      let touchesB = false, touchesW = false;
      while (stack.length) {
        const s = stack.pop()!; region.push(s);
        for (const n of neighbours(size, s)) {
          if (board[n] === 1) touchesB = true; else if (board[n] === 2) touchesW = true;
          else if (!seen.has(n)) { seen.add(n); stack.push(n); }
        }
      }
      const owner: Cell = touchesB && !touchesW ? 1 : touchesW && !touchesB ? 2 : 0;
      if (owner) { for (const s of region) territory[s] = owner; if (owner === 1) black += region.length; else white += region.length; }
    }
  }
  return { black, white: white + KOMI, territory };
}

const LETTERS = "ABCDEFGHJKLMNOPQRST";
export const coord = (size: number, i: number) => `${LETTERS[i % size]}${size - Math.floor(i / size)}`;
