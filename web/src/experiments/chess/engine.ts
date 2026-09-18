/**
 * Chess rules engine
 */

export type Color = "white" | "black";
export type PieceKind = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

export interface Piece {
  color: Color;
  kind: PieceKind;
}

export interface Position {
  file: number; // 0-7 (a-h)
  rank: number; // 0-7 (1-8)
}

export interface Move {
  from: Position;
  to: Position;
  promotion?: PieceKind;
  castle?: "kingside" | "queenside";
  enPassant?: boolean;
}

export interface Board {
  squares: (Piece | null)[][];
  turn: Color;
  castling: {
    whiteKingside: boolean;
    whiteQueenside: boolean;
    blackKingside: boolean;
    blackQueenside: boolean;
  };
  enPassantTarget: Position | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}

export interface GameState {
  board: Board;
  moves: Move[];
  status: "active" | "checkmate" | "stalemate" | "draw";
  winner: Color | null;
}

const RANKS: PieceKind[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

/**
 * Create initial chess position
 */
export function createInitialBoard(): Board {
  const squares: (Piece | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));

  // White pieces
  for (let i = 0; i < 8; i++) {
    squares[0][i] = { color: "white", kind: RANKS[i] };
    squares[1][i] = { color: "white", kind: "pawn" };
  }

  // Black pieces
  for (let i = 0; i < 8; i++) {
    squares[7][i] = { color: "black", kind: RANKS[i] };
    squares[6][i] = { color: "black", kind: "pawn" };
  }

  return {
    squares,
    turn: "white",
    castling: {
      whiteKingside: true,
      whiteQueenside: true,
      blackKingside: true,
      blackQueenside: true,
    },
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
  };
}

/**
 * Create new game
 */
export function createGame(): GameState {
  return {
    board: createInitialBoard(),
    moves: [],
    status: "active",
    winner: null,
  };
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
 * Check if position is on board
 */
function inBounds(pos: Position): boolean {
  return pos.file >= 0 && pos.file < 8 && pos.rank >= 0 && pos.rank < 8;
}

/**
 * Get piece at position
 */
function getPiece(board: Board, pos: Position): Piece | null {
  if (!inBounds(pos)) return null;
  return board.squares[pos.rank][pos.file];
}

/**
 * Set piece at position
 */
function setPiece(board: Board, pos: Position, piece: Piece | null): void {
  if (inBounds(pos)) {
    board.squares[pos.rank][pos.file] = piece;
  }
}

/**
 * Find king position
 */
function findKing(board: Board, color: Color): Position | null {
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board.squares[rank][file];
      if (piece && piece.color === color && piece.kind === "king") {
        return { file, rank };
      }
    }
  }
  return null;
}

/**
 * Check if square is attacked by opponent
 */
function isAttacked(board: Board, pos: Position, by: Color): boolean {
  // Check all opponent pieces
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board.squares[rank][file];
      if (!piece || piece.color !== by) continue;

      const moves = generatePseudoLegalMoves(board, { file, rank });
      if (moves.some(m => m.to.file === pos.file && m.to.rank === pos.rank)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if current player is in check
 */
export function isInCheck(board: Board, color: Color): boolean {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  return isAttacked(board, kingPos, color === "white" ? "black" : "white");
}

/**
 * Generate pseudo-legal moves for a piece (doesn't check for check)
 */
function generatePseudoLegalMoves(board: Board, from: Position): Move[] {
  const piece = getPiece(board, from);
  if (!piece || piece.color !== board.turn) return [];

  const moves: Move[] = [];
  const { color, kind } = piece;

  if (kind === "pawn") {
    const dir = color === "white" ? 1 : -1;
    const startRank = color === "white" ? 1 : 6;
    const promotionRank = color === "white" ? 7 : 0;

    // Forward move
    const forward = { file: from.file, rank: from.rank + dir };
    if (inBounds(forward) && !getPiece(board, forward)) {
      if (forward.rank === promotionRank) {
        for (const promo of ["queen", "rook", "bishop", "knight"] as PieceKind[]) {
          moves.push({ from, to: forward, promotion: promo });
        }
      } else {
        moves.push({ from, to: forward });
      }

      // Double move from start
      if (from.rank === startRank) {
        const doubleForward = { file: from.file, rank: from.rank + 2 * dir };
        if (!getPiece(board, doubleForward)) {
          moves.push({ from, to: doubleForward });
        }
      }
    }

    // Captures
    for (const df of [-1, 1]) {
      const capture = { file: from.file + df, rank: from.rank + dir };
      if (inBounds(capture)) {
        const target = getPiece(board, capture);
        if (target && target.color !== color) {
          if (capture.rank === promotionRank) {
            for (const promo of ["queen", "rook", "bishop", "knight"] as PieceKind[]) {
              moves.push({ from, to: capture, promotion: promo });
            }
          } else {
            moves.push({ from, to: capture });
          }
        }

        // En passant
        if (board.enPassantTarget &&
            capture.file === board.enPassantTarget.file &&
            capture.rank === board.enPassantTarget.rank) {
          moves.push({ from, to: capture, enPassant: true });
        }
      }
    }
  } else if (kind === "knight") {
    const offsets = [
      { df: 2, dr: 1 }, { df: 2, dr: -1 },
      { df: -2, dr: 1 }, { df: -2, dr: -1 },
      { df: 1, dr: 2 }, { df: 1, dr: -2 },
      { df: -1, dr: 2 }, { df: -1, dr: -2 },
    ];
    for (const { df, dr } of offsets) {
      const to = { file: from.file + df, rank: from.rank + dr };
      if (inBounds(to)) {
        const target = getPiece(board, to);
        if (!target || target.color !== color) {
          moves.push({ from, to });
        }
      }
    }
  } else if (kind === "bishop" || kind === "rook" || kind === "queen") {
    const directions = kind === "bishop"
      ? [{ df: 1, dr: 1 }, { df: 1, dr: -1 }, { df: -1, dr: 1 }, { df: -1, dr: -1 }]
      : kind === "rook"
      ? [{ df: 1, dr: 0 }, { df: -1, dr: 0 }, { df: 0, dr: 1 }, { df: 0, dr: -1 }]
      : [
          { df: 1, dr: 0 }, { df: -1, dr: 0 }, { df: 0, dr: 1 }, { df: 0, dr: -1 },
          { df: 1, dr: 1 }, { df: 1, dr: -1 }, { df: -1, dr: 1 }, { df: -1, dr: -1 },
        ];

    for (const { df, dr } of directions) {
      let to = { file: from.file + df, rank: from.rank + dr };
      while (inBounds(to)) {
        const target = getPiece(board, to);
        if (!target) {
          moves.push({ from, to });
        } else {
          if (target.color !== color) {
            moves.push({ from, to });
          }
          break;
        }
        to = { file: to.file + df, rank: to.rank + dr };
      }
    }
  } else if (kind === "king") {
    const offsets = [
      { df: 1, dr: 0 }, { df: -1, dr: 0 }, { df: 0, dr: 1 }, { df: 0, dr: -1 },
      { df: 1, dr: 1 }, { df: 1, dr: -1 }, { df: -1, dr: 1 }, { df: -1, dr: -1 },
    ];
    for (const { df, dr } of offsets) {
      const to = { file: from.file + df, rank: from.rank + dr };
      if (inBounds(to)) {
        const target = getPiece(board, to);
        if (!target || target.color !== color) {
          moves.push({ from, to });
        }
      }
    }

    // Castling
    const rank = color === "white" ? 0 : 7;
    if (from.rank === rank && from.file === 4 && !isInCheck(board, color)) {
      // Kingside
      if ((color === "white" ? board.castling.whiteKingside : board.castling.blackKingside)) {
        if (!getPiece(board, { file: 5, rank }) && !getPiece(board, { file: 6, rank })) {
          if (!isAttacked(board, { file: 5, rank }, color === "white" ? "black" : "white") &&
              !isAttacked(board, { file: 6, rank }, color === "white" ? "black" : "white")) {
            moves.push({ from, to: { file: 6, rank }, castle: "kingside" });
          }
        }
      }

      // Queenside
      if ((color === "white" ? board.castling.whiteQueenside : board.castling.blackQueenside)) {
        if (!getPiece(board, { file: 1, rank }) &&
            !getPiece(board, { file: 2, rank }) &&
            !getPiece(board, { file: 3, rank })) {
          if (!isAttacked(board, { file: 2, rank }, color === "white" ? "black" : "white") &&
              !isAttacked(board, { file: 3, rank }, color === "white" ? "black" : "white")) {
            moves.push({ from, to: { file: 2, rank }, castle: "queenside" });
          }
        }
      }
    }
  }

  return moves;
}

/**
 * Generate all legal moves for current player
 */
export function generateLegalMoves(board: Board): Move[] {
  const pseudoMoves: Move[] = [];

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board.squares[rank][file];
      if (piece && piece.color === board.turn) {
        pseudoMoves.push(...generatePseudoLegalMoves(board, { file, rank }));
      }
    }
  }

  // Filter out moves that leave king in check
  const legalMoves: Move[] = [];
  for (const move of pseudoMoves) {
    const testBoard = cloneBoard(board);
    applyMoveUnchecked(testBoard, move);
    if (!isInCheck(testBoard, board.turn)) {
      legalMoves.push(move);
    }
  }

  return legalMoves;
}

/**
 * Apply move without validation
 */
function applyMoveUnchecked(board: Board, move: Move): void {
  const piece = getPiece(board, move.from);
  if (!piece) return;

  // Handle castling
  if (move.castle) {
    const rank = piece.color === "white" ? 0 : 7;
    if (move.castle === "kingside") {
      setPiece(board, { file: 4, rank }, null);
      setPiece(board, { file: 6, rank }, piece);
      const rook = getPiece(board, { file: 7, rank });
      setPiece(board, { file: 7, rank }, null);
      if (rook) setPiece(board, { file: 5, rank }, rook);
    } else {
      setPiece(board, { file: 4, rank }, null);
      setPiece(board, { file: 2, rank }, piece);
      const rook = getPiece(board, { file: 0, rank });
      setPiece(board, { file: 0, rank }, null);
      if (rook) setPiece(board, { file: 3, rank }, rook);
    }
  } else {
    // Handle en passant capture
    if (move.enPassant) {
      const captureRank = piece.color === "white" ? move.to.rank - 1 : move.to.rank + 1;
      setPiece(board, { file: move.to.file, rank: captureRank }, null);
    }

    // Move piece
    setPiece(board, move.from, null);
    if (move.promotion) {
      setPiece(board, move.to, { color: piece.color, kind: move.promotion });
    } else {
      setPiece(board, move.to, piece);
    }
  }

  // Update en passant target
  if (piece.kind === "pawn" && Math.abs(move.to.rank - move.from.rank) === 2) {
    board.enPassantTarget = {
      file: move.from.file,
      rank: (move.from.rank + move.to.rank) / 2,
    };
  } else {
    board.enPassantTarget = null;
  }

  // Update castling rights
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

  // Update halfmove clock
  const captured = getPiece(board, move.to);
  if (piece.kind === "pawn" || captured) {
    board.halfmoveClock = 0;
  } else {
    board.halfmoveClock++;
  }

  // Update move counters
  if (board.turn === "black") {
    board.fullmoveNumber++;
  }
  board.turn = board.turn === "white" ? "black" : "white";
}

/**
 * Apply move to game state
 */
export function applyMove(game: GameState, move: Move): boolean {
  if (game.status !== "active") return false;

  const legalMoves = generateLegalMoves(game.board);
  const isLegal = legalMoves.some(m =>
    m.from.file === move.from.file && m.from.rank === move.from.rank &&
    m.to.file === move.to.file && m.to.rank === move.to.rank &&
    m.promotion === move.promotion
  );

  if (!isLegal) return false;

  applyMoveUnchecked(game.board, move);
  game.moves.push(move);

  // Check game status
  const hasLegalMoves = generateLegalMoves(game.board).length > 0;
  if (!hasLegalMoves) {
    if (isInCheck(game.board, game.board.turn)) {
      game.status = "checkmate";
      game.winner = game.board.turn === "white" ? "black" : "white";
    } else {
      game.status = "stalemate";
    }
  } else if (game.board.halfmoveClock >= 100) {
    game.status = "draw";
  }

  return true;
}

/**
 * Get algebraic notation for position
 */
export function posToString(pos: Position): string {
  return String.fromCharCode(97 + pos.file) + (pos.rank + 1);
}

/**
 * Get move notation
 */
export function moveToString(move: Move): string {
  let s = posToString(move.from) + posToString(move.to);
  if (move.promotion) {
    s += move.promotion[0];
  }
  return s;
}
