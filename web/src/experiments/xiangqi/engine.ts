/**
 * Xiangqi (Chinese Chess) rules engine
 */

export type Color = "red" | "black";
export type PieceKind = "general" | "advisor" | "elephant" | "horse" | "chariot" | "cannon" | "soldier";

export interface Piece {
  color: Color;
  kind: PieceKind;
}

export interface Position {
  file: number; // 0-8 (a-i)
  rank: number; // 0-9 (1-10)
}

export interface Move {
  from: Position;
  to: Position;
}

export interface Board {
  squares: (Piece | null)[][];
  turn: Color;
}

export interface GameState {
  board: Board;
  moves: Move[];
  status: "active" | "checkmate" | "stalemate";
  winner: Color | null;
}

/**
 * Create initial xiangqi position
 */
export function createInitialBoard(): Board {
  const squares: (Piece | null)[][] = Array(10).fill(null).map(() => Array(9).fill(null));

  // Red pieces (bottom, ranks 0-4)
  squares[0][0] = { color: "red", kind: "chariot" };
  squares[0][1] = { color: "red", kind: "horse" };
  squares[0][2] = { color: "red", kind: "elephant" };
  squares[0][3] = { color: "red", kind: "advisor" };
  squares[0][4] = { color: "red", kind: "general" };
  squares[0][5] = { color: "red", kind: "advisor" };
  squares[0][6] = { color: "red", kind: "elephant" };
  squares[0][7] = { color: "red", kind: "horse" };
  squares[0][8] = { color: "red", kind: "chariot" };
  squares[2][1] = { color: "red", kind: "cannon" };
  squares[2][7] = { color: "red", kind: "cannon" };
  squares[3][0] = { color: "red", kind: "soldier" };
  squares[3][2] = { color: "red", kind: "soldier" };
  squares[3][4] = { color: "red", kind: "soldier" };
  squares[3][6] = { color: "red", kind: "soldier" };
  squares[3][8] = { color: "red", kind: "soldier" };

  // Black pieces (top, ranks 5-9)
  squares[9][0] = { color: "black", kind: "chariot" };
  squares[9][1] = { color: "black", kind: "horse" };
  squares[9][2] = { color: "black", kind: "elephant" };
  squares[9][3] = { color: "black", kind: "advisor" };
  squares[9][4] = { color: "black", kind: "general" };
  squares[9][5] = { color: "black", kind: "advisor" };
  squares[9][6] = { color: "black", kind: "elephant" };
  squares[9][7] = { color: "black", kind: "horse" };
  squares[9][8] = { color: "black", kind: "chariot" };
  squares[7][1] = { color: "black", kind: "cannon" };
  squares[7][7] = { color: "black", kind: "cannon" };
  squares[6][0] = { color: "black", kind: "soldier" };
  squares[6][2] = { color: "black", kind: "soldier" };
  squares[6][4] = { color: "black", kind: "soldier" };
  squares[6][6] = { color: "black", kind: "soldier" };
  squares[6][8] = { color: "black", kind: "soldier" };

  return {
    squares,
    turn: "red",
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
  };
}

/**
 * Check if position is on board
 */
function inBounds(pos: Position): boolean {
  return pos.file >= 0 && pos.file < 9 && pos.rank >= 0 && pos.rank < 10;
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
 * Check if position is in palace
 */
function inPalace(pos: Position, color: Color): boolean {
  if (pos.file < 3 || pos.file > 5) return false;
  if (color === "red") {
    return pos.rank >= 0 && pos.rank <= 2;
  } else {
    return pos.rank >= 7 && pos.rank <= 9;
  }
}

/**
 * Check if position is on own side
 */
function onOwnSide(pos: Position, color: Color): boolean {
  if (color === "red") {
    return pos.rank <= 4;
  } else {
    return pos.rank >= 5;
  }
}

/**
 * Find general position
 */
function findGeneral(board: Board, color: Color): Position | null {
  for (let rank = 0; rank < 10; rank++) {
    for (let file = 0; file < 9; file++) {
      const piece = board.squares[rank][file];
      if (piece && piece.color === color && piece.kind === "general") {
        return { file, rank };
      }
    }
  }
  return null;
}

/**
 * Check if generals face each other (flying general rule)
 */
function generalsOppose(board: Board): boolean {
  const redGen = findGeneral(board, "red");
  const blackGen = findGeneral(board, "black");

  if (!redGen || !blackGen || redGen.file !== blackGen.file) return false;

  for (let rank = redGen.rank + 1; rank < blackGen.rank; rank++) {
    if (board.squares[rank][redGen.file]) return false;
  }

  return true;
}

/**
 * Check if current player is in check
 */
export function isInCheck(board: Board, color: Color): boolean {
  const genPos = findGeneral(board, color);
  if (!genPos) return false;

  const opponent = color === "red" ? "black" : "red";

  for (let rank = 0; rank < 10; rank++) {
    for (let file = 0; file < 9; file++) {
      const piece = board.squares[rank][file];
      if (!piece || piece.color !== opponent) continue;

      const moves = generatePseudoLegalMoves(board, { file, rank });
      if (moves.some(m => m.to.file === genPos.file && m.to.rank === genPos.rank)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Generate pseudo-legal moves for a piece
 */
function generatePseudoLegalMoves(board: Board, from: Position): Move[] {
  const piece = getPiece(board, from);
  if (!piece) return [];

  const moves: Move[] = [];
  const { color, kind } = piece;

  if (kind === "general") {
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [df, dr] of dirs) {
      const to = { file: from.file + df, rank: from.rank + dr };
      if (inPalace(to, color)) {
        const target = getPiece(board, to);
        if (!target || target.color !== color) {
          moves.push({ from, to });
        }
      }
    }
  } else if (kind === "advisor") {
    const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [df, dr] of dirs) {
      const to = { file: from.file + df, rank: from.rank + dr };
      if (inPalace(to, color)) {
        const target = getPiece(board, to);
        if (!target || target.color !== color) {
          moves.push({ from, to });
        }
      }
    }
  } else if (kind === "elephant") {
    const dirs = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
    for (const [df, dr] of dirs) {
      const to = { file: from.file + df, rank: from.rank + dr };
      const block = { file: from.file + df / 2, rank: from.rank + dr / 2 };

      if (inBounds(to) && onOwnSide(to, color) && !getPiece(board, block)) {
        const target = getPiece(board, to);
        if (!target || target.color !== color) {
          moves.push({ from, to });
        }
      }
    }
  } else if (kind === "horse") {
    const offsets = [
      { df: 2, dr: 1, blockDf: 1, blockDr: 0 },
      { df: 2, dr: -1, blockDf: 1, blockDr: 0 },
      { df: -2, dr: 1, blockDf: -1, blockDr: 0 },
      { df: -2, dr: -1, blockDf: -1, blockDr: 0 },
      { df: 1, dr: 2, blockDf: 0, blockDr: 1 },
      { df: 1, dr: -2, blockDf: 0, blockDr: -1 },
      { df: -1, dr: 2, blockDf: 0, blockDr: 1 },
      { df: -1, dr: -2, blockDf: 0, blockDr: -1 },
    ];

    for (const { df, dr, blockDf, blockDr } of offsets) {
      const to = { file: from.file + df, rank: from.rank + dr };
      const block = { file: from.file + blockDf, rank: from.rank + blockDr };

      if (inBounds(to) && !getPiece(board, block)) {
        const target = getPiece(board, to);
        if (!target || target.color !== color) {
          moves.push({ from, to });
        }
      }
    }
  } else if (kind === "chariot") {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [df, dr] of dirs) {
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
  } else if (kind === "cannon") {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [df, dr] of dirs) {
      let to = { file: from.file + df, rank: from.rank + dr };
      let screen = false;

      while (inBounds(to)) {
        const target = getPiece(board, to);

        if (!screen) {
          if (!target) {
            moves.push({ from, to });
          } else {
            screen = true;
          }
        } else {
          if (target) {
            if (target.color !== color) {
              moves.push({ from, to });
            }
            break;
          }
        }

        to = { file: to.file + df, rank: to.rank + dr };
      }
    }
  } else if (kind === "soldier") {
    const forward = color === "red" ? 1 : -1;
    const crossedRiver = color === "red" ? from.rank > 4 : from.rank < 5;

    const fwd = { file: from.file, rank: from.rank + forward };
    if (inBounds(fwd)) {
      const target = getPiece(board, fwd);
      if (!target || target.color !== color) {
        moves.push({ from, to: fwd });
      }
    }

    if (crossedRiver) {
      for (const df of [-1, 1]) {
        const side = { file: from.file + df, rank: from.rank };
        if (inBounds(side)) {
          const target = getPiece(board, side);
          if (!target || target.color !== color) {
            moves.push({ from, to: side });
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

  for (let rank = 0; rank < 10; rank++) {
    for (let file = 0; file < 9; file++) {
      const piece = board.squares[rank][file];
      if (piece && piece.color === board.turn) {
        pseudoMoves.push(...generatePseudoLegalMoves(board, { file, rank }));
      }
    }
  }

  const legalMoves: Move[] = [];
  for (const move of pseudoMoves) {
    const testBoard = cloneBoard(board);
    applyMoveUnchecked(testBoard, move);
    if (!isInCheck(testBoard, board.turn) && !generalsOppose(testBoard)) {
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

  setPiece(board, move.from, null);
  setPiece(board, move.to, piece);

  board.turn = board.turn === "red" ? "black" : "red";
}

/**
 * Apply move to game state
 */
export function applyMove(game: GameState, move: Move): boolean {
  if (game.status !== "active") return false;

  const legalMoves = generateLegalMoves(game.board);
  const isLegal = legalMoves.some(m =>
    m.from.file === move.from.file && m.from.rank === move.from.rank &&
    m.to.file === move.to.file && m.to.rank === move.to.rank
  );

  if (!isLegal) return false;

  applyMoveUnchecked(game.board, move);
  game.moves.push(move);

  const hasLegalMoves = generateLegalMoves(game.board).length > 0;
  if (!hasLegalMoves) {
    game.status = "checkmate";
    game.winner = game.board.turn === "red" ? "black" : "red";
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
  return posToString(move.from) + posToString(move.to);
}
