/**
 * Texas Hold'em Poker bot
 */

import type { GameState } from "./engine";
import { evaluateHand, getLegalActions } from "./engine";

export interface ScoredAction {
  action: "fold" | "call" | "raise";
  raiseAmount?: number;
  score: number;
}

/**
 * Simple bot that evaluates hand strength
 */
export function getBestActions(game: GameState, seat: number): ScoredAction[] {
  const player = game.players[seat];
  const legalActions = getLegalActions(game);

  if (legalActions.length === 0) return [];

  const handStrength = evaluateHand(player.hand, game.community);
  const potOdds = game.currentBet > 0 ? game.pot / game.currentBet : 1;

  const actions: ScoredAction[] = [];

  for (const action of legalActions) {
    let score = 0;

    if (action === "fold") {
      score = 10;
    } else if (action === "call") {
      score = 30 + handStrength.rank * 10 + Math.min(potOdds * 5, 20);
    } else if (action === "raise") {
      if (handStrength.rank >= 1) {
        const raiseAmount = Math.min(game.currentBet, player.chips / 4);
        score = 20 + handStrength.rank * 15;
        actions.push({ action, raiseAmount, score });
        continue;
      }
    }

    actions.push({ action, score });
  }

  actions.sort((a, b) => b.score - a.score);

  return actions.slice(0, 3);
}
