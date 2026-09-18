/**
 * Xiangqi bot with alpha-beta search
 */

import type { Board, Move, Color, PieceKind } from "./engine";
import { generateLegalMoves, isInCheck } from "./engine";

interface ScoredMove {
  move: Move;
  score: number;
}

/**
 * Piece values for evaluation
 */
const PIECE_VALUES: Record<PieceKind, number> = {
  general: 6000,
  advisor: 120,
  elephant: 120,
  horse: 270,
  chariot: 600,
  cannon: 285,
  soldier: 30,
};

/**
 * Evaluate board position
 */
function evaluateBoard(board: Board): number {
  let score = 0;

  for (let rank = 0; rank < 10; rank++) {
    for (let file = 0; file < 9; file++) {
      const piece = board.squares[rank][file];
      if (!piece) continue;

      const value = PIECE_VALUES[piece.kind];
      const mult = piece.color === "red" ? 1 : -1;

      score += value * mult;

      // Position bonus for soldiers
      if (piece.kind === "soldier") {
        const advancement = piece.color === "red" ? rank : 9 - rank;
        score += advancement * 5 * mult;
      }

      // Central files bonus
      if (piece.kind === "horse" || piece.kind === "chariot") {
        const centerBonus = 5 - Math.abs(file - 4);
        score += centerBonus * mult;
      }
    }
  }

  return score;
}

/**
 * Clone board
 */
function cloneBoard(board: Board): Board {
  return {
    squares: board.squares.map(row => row.map(p => p ? { ...p } : null)),
    turn: board.turn,
  };
}

/**
 * Apply move without validation
 */
function applyMoveUnchecked(board: Board, move: Move): void {
  const piece = board.squares[move.from.rank][move.from.file];
  if (!piece) return;

  board.squares[move.from.rank][move.from.file] = null;
  board.squares[move.to.rank][move.to.file] = piece;

  board.turn = board.turn === "red" ? "black" : "red";
}

/**
 * Alpha-beta search
 */
function alphaBeta(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean
): number {
  if (depth === 0) {
    return evaluateBoard(board);
  }

  const moves = generateLegalMoves(board);

  if (moves.length === 0) {
    return maximizing ? -100000 - depth : 100000 + depth;
  }

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const newBoard = cloneBoard(board);
      applyMoveUnchecked(newBoard, move);
      const evaluation = alphaBeta(newBoard, depth - 1, alpha, beta, false);
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const newBoard = cloneBoard(board);
      applyMoveUnchecked(newBoard, move);
      const evaluation = alphaBeta(newBoard, depth - 1, alpha, beta, true);
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

/**
 * Get best moves for current position
 */
export function getBestMoves(board: Board, depth = 3, topN = 3): ScoredMove[] {
  const moves = generateLegalMoves(board);
  if (moves.length === 0) return [];

  const maximizing = board.turn === "red";
  const scored: ScoredMove[] = [];

  for (const move of moves) {
    const newBoard = cloneBoard(board);
    applyMoveUnchecked(newBoard, move);
    const score = alphaBeta(
      newBoard,
      depth - 1,
      -Infinity,
      Infinity,
      !maximizing
    );
    scored.push({ move, score });
  }

  scored.sort((a, b) => maximizing ? b.score - a.score : a.score - b.score);

  return scored.slice(0, topN);
}
