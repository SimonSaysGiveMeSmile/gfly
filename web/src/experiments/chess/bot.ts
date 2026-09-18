/**
 * Chess bot with alpha-beta search
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
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 20000,
};

/**
 * Evaluate board position
 */
function evaluateBoard(board: Board): number {
  let score = 0;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board.squares[rank][file];
      if (!piece) continue;

      const value = PIECE_VALUES[piece.kind];
      const mult = piece.color === "white" ? 1 : -1;

      // Material value
      score += value * mult;

      // Position bonus for pawns and center control
      if (piece.kind === "pawn") {
        const advancement = piece.color === "white" ? rank : 7 - rank;
        score += advancement * 10 * mult;
      }

      // Center control
      const centerDist = Math.abs(file - 3.5) + Math.abs(rank - 3.5);
      score += (7 - centerDist) * 2 * mult;
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
    castling: { ...board.castling },
    enPassantTarget: board.enPassantTarget ? { ...board.enPassantTarget } : null,
    halfmoveClock: board.halfmoveClock,
    fullmoveNumber: board.fullmoveNumber,
  };
}

/**
 * Apply move without validation
 */
function applyMoveUnchecked(board: Board, move: Move): void {
  const piece = board.squares[move.from.rank][move.from.file];
  if (!piece) return;

  if (move.castle) {
    const rank = piece.color === "white" ? 0 : 7;
    if (move.castle === "kingside") {
      board.squares[rank][4] = null;
      board.squares[rank][6] = piece;
      const rook = board.squares[rank][7];
      board.squares[rank][7] = null;
      if (rook) board.squares[rank][5] = rook;
    } else {
      board.squares[rank][4] = null;
      board.squares[rank][2] = piece;
      const rook = board.squares[rank][0];
      board.squares[rank][0] = null;
      if (rook) board.squares[rank][3] = rook;
    }
  } else {
    if (move.enPassant) {
      const captureRank = piece.color === "white" ? move.to.rank - 1 : move.to.rank + 1;
      board.squares[captureRank][move.to.file] = null;
    }

    board.squares[move.from.rank][move.from.file] = null;
    if (move.promotion) {
      board.squares[move.to.rank][move.to.file] = { color: piece.color, kind: move.promotion };
    } else {
      board.squares[move.to.rank][move.to.file] = piece;
    }
  }

  if (piece.kind === "pawn" && Math.abs(move.to.rank - move.from.rank) === 2) {
    board.enPassantTarget = {
      file: move.from.file,
      rank: (move.from.rank + move.to.rank) / 2,
    };
  } else {
    board.enPassantTarget = null;
  }

  if (piece.kind === "king") {
    if (piece.color === "white") {
      board.castling.whiteKingside = false;
      board.castling.whiteQueenside = false;
    } else {
      board.castling.blackKingside = false;
      board.castling.blackQueenside = false;
    }
  } else if (piece.kind === "rook") {
    if (piece.color === "white") {
      if (move.from.file === 0 && move.from.rank === 0) board.castling.whiteQueenside = false;
      if (move.from.file === 7 && move.from.rank === 0) board.castling.whiteKingside = false;
    } else {
      if (move.from.file === 0 && move.from.rank === 7) board.castling.blackQueenside = false;
      if (move.from.file === 7 && move.from.rank === 7) board.castling.blackKingside = false;
    }
  }

  board.turn = board.turn === "white" ? "black" : "white";
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
    if (isInCheck(board, board.turn)) {
      return maximizing ? -100000 - depth : 100000 + depth;
    } else {
      return 0;
    }
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

  const maximizing = board.turn === "white";
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
