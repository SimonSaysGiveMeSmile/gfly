/**
 * Sudoku i18n dictionary
 */

export const dict = {
  en: {
    "status.playing": "Playing",
    "status.won": "Solved!",
    "action.newGame": "New Game",
    "action.hint": "Hint",
    "action.clear": "Clear",
    "difficulty.easy": "Easy",
    "difficulty.medium": "Medium",
    "difficulty.hard": "Hard",
    "msg.congratulations": "Congratulations!",
  },
  zh: {
    "status.playing": "进行中",
    "status.won": "完成！",
    "action.newGame": "新游戏",
    "action.hint": "提示",
    "action.clear": "清除",
    "difficulty.easy": "简单",
    "difficulty.medium": "中等",
    "difficulty.hard": "困难",
    "msg.congratulations": "恭喜！",
  },
  az: {
    "status.playing": "Oynayır",
    "status.won": "Həll olundu!",
    "action.newGame": "Yeni Oyun",
    "action.hint": "İpucu",
    "action.clear": "Təmizlə",
    "difficulty.easy": "Asan",
    "difficulty.medium": "Orta",
    "difficulty.hard": "Çətin",
    "msg.congratulations": "Təbrik edirik!",
  },
} as const;

export type SudokuKey = keyof typeof dict.en;
