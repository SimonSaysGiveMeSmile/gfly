/**
 * Sudoku bot
 */

import type { Board } from "./engine";
import { getCandidates } from "./engine";

export interface ScoredMove {
  row: number;
  col: number;
  num: number;
  score: number;
}

/**
 * Get best moves using constraint propagation
 */
export function getBestMoves(board: Board, topN = 3): ScoredMove[] {
  const moves: ScoredMove[] = [];

  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === 0) {
        const candidates = getCandidates(board, row, col);

        for (const num of candidates) {
          const score = scoreMove(board, row, col, num, candidates.length);
          moves.push({ row, col, num, score });
        }
      }
    }
  }

  moves.sort((a, b) => b.score - a.score);

  return moves.slice(0, topN);
}

/**
 * Score a potential move
 */
function scoreMove(board: Board, row: number, col: number, num: number, numCandidates: number): number {
  let score = 0;

  // Prefer cells with fewer candidates
  score += (10 - numCandidates) * 10;

  // Count how many cells this move affects
  let affected = 0;

  // Check row
  for (let c = 0; c < 9; c++) {
    if (c !== col && board[row][c] === 0) {
      const cands = getCandidates(board, row, c);
      if (cands.includes(num)) affected++;
    }
  }

  // Check column
  for (let r = 0; r < 9; r++) {
    if (r !== row && board[r][col] === 0) {
      const cands = getCandidates(board, r, col);
      if (cands.includes(num)) affected++;
    }
  }

  // Check 3x3 box
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if ((r !== row || c !== col) && board[r][c] === 0) {
        const cands = getCandidates(board, r, c);
        if (cands.includes(num)) affected++;
      }
    }
  }

  score += affected * 2;

  return score;
}
