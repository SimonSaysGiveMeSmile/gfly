/**
 * Sudoku rules engine
 */

export type Board = number[][]; // 9x9, 0 = empty, 1-9 = filled

export interface GameState {
  initial: Board;
  current: Board;
  selected: { row: number; col: number } | null;
  status: "active" | "won";
}

/**
 * Create empty board
 */
export function createEmptyBoard(): Board {
  return Array(9).fill(null).map(() => Array(9).fill(0));
}

/**
 * Check if number is valid in position
 */
export function isValid(board: Board, row: number, col: number, num: number): boolean {
  // Check row
  for (let c = 0; c < 9; c++) {
    if (c !== col && board[row][c] === num) return false;
  }

  // Check column
  for (let r = 0; r < 9; r++) {
    if (r !== row && board[r][col] === num) return false;
  }

  // Check 3x3 box
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r++) {
    for (let c = boxCol; c < boxCol + 3; c++) {
      if ((r !== row || c !== col) && board[r][c] === num) return false;
    }
  }

  return true;
}

/**
 * Check if board is complete and valid
 */
export function isComplete(board: Board): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const num = board[row][col];
      if (num === 0) return false;
      if (!isValid(board, row, col, num)) return false;
    }
  }
  return true;
}

/**
 * Generate a solved sudoku board using backtracking
 */
function solveSudoku(board: Board): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === 0) {
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        for (let i = nums.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [nums[i], nums[j]] = [nums[j], nums[i]];
        }

        for (const num of nums) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num;
            if (solveSudoku(board)) return true;
            board[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

/**
 * Generate a new sudoku puzzle
 */
export function generatePuzzle(difficulty: "easy" | "medium" | "hard" = "medium"): Board {
  const board = createEmptyBoard();
  solveSudoku(board);

  const cellsToRemove = difficulty === "easy" ? 35 : difficulty === "medium" ? 45 : 55;
  const cells: Array<[number, number]> = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      cells.push([r, c]);
    }
  }

  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  for (let i = 0; i < cellsToRemove && i < cells.length; i++) {
    const [r, c] = cells[i];
    board[r][c] = 0;
  }

  return board;
}

/**
 * Create new game
 */
export function createGame(difficulty: "easy" | "medium" | "hard" = "medium"): GameState {
  const initial = generatePuzzle(difficulty);
  return {
    initial: initial.map(row => [...row]),
    current: initial.map(row => [...row]),
    selected: null,
    status: "active",
  };
}

/**
 * Clone board
 */
export function cloneBoard(board: Board): Board {
  return board.map(row => [...row]);
}

/**
 * Set number in cell
 */
export function setCell(game: GameState, row: number, col: number, num: number): boolean {
  if (game.initial[row][col] !== 0) return false;

  game.current[row][col] = num;

  if (isComplete(game.current)) {
    game.status = "won";
  }

  return true;
}

/**
 * Get candidates for a cell
 */
export function getCandidates(board: Board, row: number, col: number): number[] {
  if (board[row][col] !== 0) return [];

  const candidates: number[] = [];
  for (let num = 1; num <= 9; num++) {
    if (isValid(board, row, col, num)) {
      candidates.push(num);
    }
  }
  return candidates;
}
