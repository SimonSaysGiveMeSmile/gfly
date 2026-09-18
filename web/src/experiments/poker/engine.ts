/**
 * Texas Hold'em Poker rules engine
 */

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface Player {
  seat: number;
  hand: Card[];
  chips: number;
  bet: number;
  folded: boolean;
  allIn: boolean;
}

export type Phase = "preflop" | "flop" | "turn" | "river" | "showdown" | "over";

export interface GameState {
  players: Player[];
  deck: Card[];
  community: Card[];
  pot: number;
  phase: Phase;
  dealer: number;
  currentPlayer: number;
  currentBet: number;
  status: "active" | "won";
  winner: number | null;
}

const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

/**
 * Create and shuffle deck
 */
function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Create new game
 */
export function createGame(numPlayers = 4, startChips = 1000): GameState {
  const deck = createDeck();
  const players: Player[] = [];

  for (let i = 0; i < numPlayers; i++) {
    players.push({
      seat: i,
      hand: [deck.pop()!, deck.pop()!],
      chips: startChips,
      bet: 0,
      folded: false,
      allIn: false,
    });
  }

  return {
    players,
    deck,
    community: [],
    pot: 0,
    phase: "preflop",
    dealer: 0,
    currentPlayer: 1,
    currentBet: 0,
    status: "active",
    winner: null,
  };
}

/**
 * Get rank value
 */
function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank);
}

/**
 * Evaluate hand strength
 */
export function evaluateHand(hand: Card[], community: Card[]): { rank: number; values: number[] } {
  const allCards = [...hand, ...community];
  if (allCards.length < 5) return { rank: 0, values: [] };

  const combinations: Card[][] = [];
  for (let i = 0; i < allCards.length; i++) {
    for (let j = i + 1; j < allCards.length; j++) {
      for (let k = j + 1; k < allCards.length; k++) {
        for (let l = k + 1; l < allCards.length; l++) {
          for (let m = l + 1; m < allCards.length; m++) {
            combinations.push([allCards[i], allCards[j], allCards[k], allCards[l], allCards[m]]);
          }
        }
      }
    }
  }

  let best = { rank: 0, values: [0] };
  for (const combo of combinations) {
    const result = evaluateFiveCards(combo);
    if (result.rank > best.rank || (result.rank === best.rank && compareValues(result.values, best.values) > 0)) {
      best = result;
    }
  }

  return best;
}

/**
 * Compare two value arrays
 */
function compareValues(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Evaluate exactly 5 cards
 */
function evaluateFiveCards(cards: Card[]): { rank: number; values: number[] } {
  const ranks = cards.map(c => rankValue(c.rank)).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5;
  const isLowStraight = ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0;

  const counts = new Map<number, number>();
  for (const r of ranks) {
    counts.set(r, (counts.get(r) || 0) + 1);
  }

  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (isFlush && isStraight) return { rank: 8, values: ranks };
  if (isFlush && isLowStraight) return { rank: 8, values: [3, 2, 1, 0, 12] };
  if (groups[0][1] === 4) return { rank: 7, values: [groups[0][0], groups[1][0]] };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { rank: 6, values: [groups[0][0], groups[1][0]] };
  if (isFlush) return { rank: 5, values: ranks };
  if (isStraight) return { rank: 4, values: ranks };
  if (isLowStraight) return { rank: 4, values: [3, 2, 1, 0, 12] };
  if (groups[0][1] === 3) return { rank: 3, values: [groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0][1] === 2 && groups[1][1] === 2) return { rank: 2, values: [groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0][1] === 2) return { rank: 1, values: [groups[0][0], groups[1][0], groups[2][0], groups[3][0]] };

  return { rank: 0, values: ranks };
}

/**
 * Get hand name
 */
export function getHandName(rank: number): string {
  const names = ["High Card", "One Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"];
  return names[rank] || "Unknown";
}

/**
 * Apply action
 */
export function applyAction(game: GameState, action: "fold" | "call" | "raise", raiseAmount = 0): void {
  const player = game.players[game.currentPlayer];

  if (action === "fold") {
    player.folded = true;
  } else if (action === "call") {
    const toCall = game.currentBet - player.bet;
    const amount = Math.min(toCall, player.chips);
    player.bet += amount;
    player.chips -= amount;
    game.pot += amount;
    if (player.chips === 0) player.allIn = true;
  } else if (action === "raise") {
    const toCall = game.currentBet - player.bet;
    const total = toCall + raiseAmount;
    const amount = Math.min(total, player.chips);
    player.bet += amount;
    player.chips -= amount;
    game.pot += amount;
    game.currentBet = player.bet;
    if (player.chips === 0) player.allIn = true;
  }

  advancePlayer(game);
}

/**
 * Advance to next player
 */
function advancePlayer(game: GameState): void {
  const activePlayers = game.players.filter(p => !p.folded && !p.allIn);
  const allBetsEqual = activePlayers.every(p => p.bet === game.currentBet);

  if (activePlayers.length <= 1 || (allBetsEqual && activePlayers.length > 0)) {
    advancePhase(game);
    return;
  }

  do {
    game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
  } while (game.players[game.currentPlayer].folded || game.players[game.currentPlayer].allIn);
}

/**
 * Advance to next phase
 */
function advancePhase(game: GameState): void {
  for (const player of game.players) {
    player.bet = 0;
  }
  game.currentBet = 0;

  if (game.phase === "preflop") {
    game.community.push(game.deck.pop()!, game.deck.pop()!, game.deck.pop()!);
    game.phase = "flop";
    game.currentPlayer = (game.dealer + 1) % game.players.length;
  } else if (game.phase === "flop") {
    game.community.push(game.deck.pop()!);
    game.phase = "turn";
    game.currentPlayer = (game.dealer + 1) % game.players.length;
  } else if (game.phase === "turn") {
    game.community.push(game.deck.pop()!);
    game.phase = "river";
    game.currentPlayer = (game.dealer + 1) % game.players.length;
  } else if (game.phase === "river") {
    game.phase = "showdown";
    determineWinner(game);
  }

  while (game.phase !== "showdown" && (game.players[game.currentPlayer].folded || game.players[game.currentPlayer].allIn)) {
    game.currentPlayer = (game.currentPlayer + 1) % game.players.length;
  }
}

/**
 * Determine winner
 */
function determineWinner(game: GameState): void {
  const active = game.players.filter(p => !p.folded);

  if (active.length === 1) {
    game.winner = active[0].seat;
    active[0].chips += game.pot;
    game.status = "won";
    game.phase = "over";
    return;
  }

  const evaluated = active.map(p => ({
    player: p,
    hand: evaluateHand(p.hand, game.community),
  }));

  evaluated.sort((a, b) => {
    if (b.hand.rank !== a.hand.rank) return b.hand.rank - a.hand.rank;
    return compareValues(b.hand.values, a.hand.values);
  });

  const winner = evaluated[0].player;
  game.winner = winner.seat;
  winner.chips += game.pot;
  game.status = "won";
  game.phase = "over";
}

/**
 * Get legal actions
 */
export function getLegalActions(game: GameState): Array<"fold" | "call" | "raise"> {
  if (game.status !== "active" || game.phase === "showdown" || game.phase === "over") {
    return [];
  }

  const player = game.players[game.currentPlayer];
  const actions: Array<"fold" | "call" | "raise"> = ["fold"];

  const toCall = game.currentBet - player.bet;

  if (player.chips > 0) {
    actions.push("call");
  }

  if (player.chips > toCall) {
    actions.push("raise");
  }

  return actions;
}

/**
 * Card to string
 */
export function cardToString(card: Card): string {
  const suitSymbols = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
  return card.rank + suitSymbols[card.suit];
}
