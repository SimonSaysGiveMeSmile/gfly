/**
 * Poker i18n dictionary
 */

export const dict = {
  en: {
    "status.playing": "Playing",
    "status.won": "Game Over",
    "phase.preflop": "Pre-Flop",
    "phase.flop": "Flop",
    "phase.turn": "Turn",
    "phase.river": "River",
    "phase.showdown": "Showdown",
    "action.newGame": "New Game",
    "action.fold": "Fold",
    "action.call": "Call",
    "action.raise": "Raise",
    "msg.yourTurn": "Your turn",
    "msg.pot": "Pot",
    "msg.chips": "Chips",
    "msg.winner": "Winner",
  },
  zh: {
    "status.playing": "进行中",
    "status.won": "游戏结束",
    "phase.preflop": "翻牌前",
    "phase.flop": "翻牌",
    "phase.turn": "转牌",
    "phase.river": "河牌",
    "phase.showdown": "摊牌",
    "action.newGame": "新游戏",
    "action.fold": "弃牌",
    "action.call": "跟注",
    "action.raise": "加注",
    "msg.yourTurn": "轮到你了",
    "msg.pot": "底池",
    "msg.chips": "筹码",
    "msg.winner": "赢家",
  },
  az: {
    "status.playing": "Oynayır",
    "status.won": "Oyun Bitdi",
    "phase.preflop": "Floopa qədər",
    "phase.flop": "Flop",
    "phase.turn": "Dönüş",
    "phase.river": "Çay",
    "phase.showdown": "Açılış",
    "action.newGame": "Yeni Oyun",
    "action.fold": "Burax",
    "action.call": "Zəng et",
    "action.raise": "Artır",
    "msg.yourTurn": "Sizin növbənizdir",
    "msg.pot": "Bank",
    "msg.chips": "Fişlər",
    "msg.winner": "Qalib",
  },
} as const;

export type PokerKey = keyof typeof dict.en;
