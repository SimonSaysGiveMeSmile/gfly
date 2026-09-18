/**
 * Mahjong, the table rules. Four players, 136 tiles, no flowers. Hong Kong
 * style: a hand wins with four sets and a pair (or seven pairs); calls are
 * chow from the player on your left, pung and kong from anyone, and a win
 * off any discard. Scoring is a plain fan count so the flies have something
 * to learn against. Pure data in, pure data out; the table and the bots sit
 * on top of this.
 */

export type Suit = "m" | "p" | "s" | "z";
/** Tile kind, 0..33: 0-8 characters, 9-17 dots, 18-26 bamboo, 27-30 winds ESWN, 31-33 dragons R G Wh. */
export type Kind = number;
export interface Tile { id: number; kind: Kind }

export const KIND_NAMES: string[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `Man${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `Pin${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `Sou${n}`),
  "Ton", "Nan", "Shaa", "Pei", "Chun", "Hatsu", "Haku",
];
export const KIND_LABELS: string[] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${n} of characters`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${n} of dots`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${n} of bamboo`),
  "East", "South", "West", "North", "Red dragon", "Green dragon", "White dragon",
];

export const suitOf = (k: Kind): Suit => (k < 9 ? "m" : k < 18 ? "p" : k < 27 ? "s" : "z");
export const rankOf = (k: Kind) => (k < 27 ? (k % 9) + 1 : 0);
export const isHonour = (k: Kind) => k >= 27;
export const isTerminal = (k: Kind) => !isHonour(k) && (rankOf(k) === 1 || rankOf(k) === 9);

export type MeldKind = "chow" | "pung" | "kong";
export interface Meld { kind: MeldKind; tiles: Tile[]; /** who discarded the claimed tile, -1 for a concealed kong */ from: number }

export interface Player {
  seat: number;
  name: string;
  hand: Tile[];
  melds: Meld[];
  discards: Tile[];
  /** Cumulative points. */
  score: number;
}

/**
 * A line of table talk, as data. The page turns it into words in whatever
 * language it is showing: `key` names the sentence, the rest fill it in.
 */
export interface Msg { key: string; seat?: number; from?: number; tile?: Kind; n?: number; fan?: number; call?: MeldKind; reasons?: Msg[] }

export type Phase =
  | { kind: "draw"; seat: number }
  | { kind: "discard"; seat: number }
  | { kind: "claim"; discarder: number; tile: Tile; /** seats still to answer, in priority order */ pending: number[] }
  | { kind: "over"; winner: number | null; fan: number; reason: Msg; winningHand?: Tile[]; /** who threw the winning tile, and what it was */ fedBy?: { seat: number; kind: Kind } };

export interface Game {
  wall: Tile[];
  players: Player[];
  phase: Phase;
  /** Wind of the round, 27..30. */
  round: Kind;
  dealer: number;
  turn: number;
  /** The last discard on the table, for the claim window. */
  lastDiscard: { seat: number; tile: Tile } | null;
  log: Msg[];
  hand: number;
}

const HAND_SIZE = 13;

export function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function newGame(names: string[], seed = Date.now(), dealer = 0, scores?: number[], handNo = 1): Game {
  const rng = makeRng(seed);
  const wall: Tile[] = [];
  for (let k = 0; k < 34; k++) for (let c = 0; c < 4; c++) wall.push({ id: k * 4 + c, kind: k });
  for (let i = wall.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [wall[i], wall[j]] = [wall[j], wall[i]]; }
  const players: Player[] = names.map((name, seat) => ({ seat, name, hand: [], melds: [], discards: [], score: scores?.[seat] ?? 0 }));
  for (const p of players) p.hand = sortTiles(wall.splice(0, HAND_SIZE));
  const g: Game = { wall, players, phase: { kind: "draw", seat: dealer }, round: 27, dealer, turn: dealer, lastDiscard: null, log: [], hand: handNo };
  g.log.push({ key: "mj.log.deals", n: handNo, seat: dealer });
  return g;
}

export function sortTiles(ts: Tile[]) { return [...ts].sort((a, b) => a.kind - b.kind || a.id - b.id); }

/* ---- hand analysis ------------------------------------------------------ */

export type Counts = Uint8Array; // 34 entries

export function countKinds(tiles: Tile[] | Kind[]): Counts {
  const c = new Uint8Array(34);
  for (const t of tiles) c[typeof t === "number" ? t : t.kind]++;
  return c;
}

/** Can these counts be split into n sets (chow or pung) plus one pair? */
function splitsIntoSets(c: Counts, needPair: boolean): boolean {
  let i = 0;
  while (i < 34 && c[i] === 0) i++;
  if (i === 34) return !needPair;
  if (needPair && c[i] >= 2) {
    c[i] -= 2;
    if (splitsIntoSets(c, false)) { c[i] += 2; return true; }
    c[i] += 2;
  }
  if (c[i] >= 3) {
    c[i] -= 3;
    if (splitsIntoSets(c, needPair)) { c[i] += 3; return true; }
    c[i] += 3;
  }
  if (i < 27 && rankOf(i) <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    const ok = splitsIntoSets(c, needPair);
    c[i]++; c[i + 1]++; c[i + 2]++;
    if (ok) return true;
  }
  return false;
}

/** A complete hand: concealed tiles that, with the melds, make 4 sets + pair. */
export function isWinning(concealed: Kind[], meldCount: number): boolean {
  if (concealed.length !== 14 - meldCount * 3) return false;
  const c = countKinds(concealed);
  if (splitsIntoSets(c, true)) return true;
  // Seven pairs, closed hands only.
  if (meldCount === 0) {
    let pairs = 0;
    for (let k = 0; k < 34; k++) { if (c[k] === 2) pairs++; else if (c[k] !== 0) return false; }
    return pairs === 7;
  }
  return false;
}

/** How many tiles away from a complete hand (0 = ready to win). Cheap estimate. */
export function shanten(concealed: Kind[], meldCount: number): number {
  const c = countKinds(concealed);
  const need = 4 - meldCount;
  let best = 8;
  // Greedy-with-backtracking over sets, then pairs, then partial sets.
  const rec = (i: number, sets: number, pair: number, partial: number) => {
    while (i < 34 && c[i] === 0) i++;
    if (i === 34) {
      const p = Math.min(partial, need - sets);
      const s = (need - sets) * 2 - p - pair;
      best = Math.min(best, s);
      return;
    }
    if (best === 0) return;
    if (c[i] >= 3) { c[i] -= 3; rec(i, sets + 1, pair, partial); c[i] += 3; }
    if (i < 27 && rankOf(i) <= 7 && c[i + 1] > 0 && c[i + 2] > 0) { c[i]--; c[i + 1]--; c[i + 2]--; rec(i, sets + 1, pair, partial); c[i]++; c[i + 1]++; c[i + 2]++; }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (pair === 0) rec(i, sets, 1, partial); else rec(i, sets, pair, partial + 1);
      c[i] += 2;
    }
    if (i < 27 && rankOf(i) <= 8 && c[i + 1] > 0) { c[i]--; c[i + 1]--; rec(i, sets, pair, partial + 1); c[i]++; c[i + 1]++; }
    if (i < 27 && rankOf(i) <= 7 && c[i + 2] > 0) { c[i]--; c[i + 2]--; rec(i, sets, pair, partial + 1); c[i]++; c[i + 2]++; }
    c[i]--; rec(i, sets, pair, partial); c[i]++;
  };
  rec(0, 0, 0, 0);
  return Math.max(0, best);
}

/** Kinds that would complete the hand if drawn. */
export function waits(concealed: Kind[], meldCount: number): Kind[] {
  const out: Kind[] = [];
  if (concealed.length !== 13 - meldCount * 3) return out;
  for (let k = 0; k < 34; k++) if (isWinning([...concealed, k], meldCount)) out.push(k);
  return out;
}

/** Fan for a winning hand. Enough to reward shape, not a full rulebook. */
export function scoreHand(p: Player, winTile: Kind, selfDrawn: boolean, round: Kind): { fan: number; reasons: Msg[] } {
  const all = [...p.hand.map((t) => t.kind), ...p.melds.flatMap((m) => m.tiles.map((t) => t.kind))];
  const reasons: Msg[] = [];
  let fan = 0;
  const c = countKinds(all);
  const suits = new Set(all.filter((k) => !isHonour(k)).map(suitOf));
  const honours = all.some(isHonour);
  if (selfDrawn) { fan += 1; reasons.push({ key: "mj.fan.selfDrawn" }); }
  if (p.melds.length === 0) { fan += 1; reasons.push({ key: "mj.fan.concealed" }); }
  const seatWind = 27 + ((p.seat - 0 + 4) % 4);
  for (const k of [31, 32, 33]) if (c[k] >= 3) { fan += 1; reasons.push({ key: "mj.fan.dragonPung", tile: k }); }
  if (c[round] >= 3) { fan += 1; reasons.push({ key: "mj.fan.roundWind" }); }
  if (c[seatWind] >= 3 && seatWind !== round) { fan += 1; reasons.push({ key: "mj.fan.seatWind" }); }
  if (suits.size === 1 && !honours) { fan += 6; reasons.push({ key: "mj.fan.pure" }); }
  else if (suits.size === 1) { fan += 3; reasons.push({ key: "mj.fan.half" }); }
  else if (suits.size === 0) { fan += 10; reasons.push({ key: "mj.fan.allHonours" }); }
  const allPungs = p.melds.every((m) => m.kind !== "chow") && (() => {
    const cc = countKinds(p.hand.map((t) => t.kind));
    let pair = 0, ok = true;
    for (let k = 0; k < 34; k++) { if (cc[k] === 2) pair++; else if (cc[k] !== 0 && cc[k] !== 3 && cc[k] !== 4) ok = false; }
    return ok && pair === 1;
  })();
  if (allPungs) { fan += 3; reasons.push({ key: "mj.fan.allPungs" }); }
  const allChows = p.melds.every((m) => m.kind === "chow") && !honours && (() => {
    const cc = countKinds(p.hand.map((t) => t.kind));
    let pairK = -1; for (let k = 0; k < 34; k++) if (cc[k] >= 2) pairK = k;
    if (pairK < 0) return false;
    cc[pairK] -= 2;
    const chowsOnly = (i: number): boolean => { while (i < 34 && cc[i] === 0) i++; if (i === 34) return true; if (i >= 27 || rankOf(i) > 7 || !cc[i + 1] || !cc[i + 2]) return false; cc[i]--; cc[i + 1]--; cc[i + 2]--; const r = chowsOnly(i); cc[i]++; cc[i + 1]++; cc[i + 2]++; return r; };
    return chowsOnly(0);
  })();
  if (allChows) { fan += 1; reasons.push({ key: "mj.fan.allChows" }); }
  if (all.every((k) => isTerminal(k) || isHonour(k))) { fan += 4; reasons.push({ key: "mj.fan.terminals" }); }
  if (fan === 0) { fan = 1; reasons.push({ key: "mj.fan.chicken" }); }
  void winTile;
  return { fan, reasons };
}

/* ---- moves -------------------------------------------------------------- */

export type Claim =
  | { kind: "win" }
  | { kind: "pung" }
  | { kind: "kong" }
  | { kind: "chow"; tiles: [Tile, Tile] }
  | { kind: "pass" };

/** What a seat may do with the discard on the table. */
export function claimOptions(g: Game, seat: number): Claim[] {
  const ld = g.lastDiscard;
  if (!ld || ld.seat === seat) return [];
  const p = g.players[seat];
  const kinds = p.hand.map((t) => t.kind);
  const out: Claim[] = [];
  if (isWinning([...kinds, ld.tile.kind], p.melds.length)) out.push({ kind: "win" });
  const same = p.hand.filter((t) => t.kind === ld.tile.kind);
  if (same.length >= 3) out.push({ kind: "kong" });
  if (same.length >= 2) out.push({ kind: "pung" });
  if ((ld.seat + 1) % 4 === seat && !isHonour(ld.tile.kind)) {
    const k = ld.tile.kind, r = rankOf(k);
    const find = (kk: number) => p.hand.find((t) => t.kind === kk);
    const combos: [number, number][] = [];
    if (r >= 3) combos.push([k - 2, k - 1]);
    if (r >= 2 && r <= 8) combos.push([k - 1, k + 1]);
    if (r <= 7) combos.push([k + 1, k + 2]);
    for (const [a, b] of combos) {
      const ta = find(a), tb = find(b);
      if (ta && tb) out.push({ kind: "chow", tiles: [ta, tb] });
    }
  }
  out.push({ kind: "pass" });
  return out;
}

function removeTiles(p: Player, tiles: Tile[]) {
  for (const t of tiles) {
    const i = p.hand.findIndex((h) => h.id === t.id);
    if (i >= 0) p.hand.splice(i, 1);
  }
}

export function draw(g: Game): Tile | null {
  if (g.phase.kind !== "draw") return null;
  const seat = g.phase.seat;
  if (g.wall.length === 0) {
    g.phase = { kind: "over", winner: null, fan: 0, reason: { key: "mj.over.wallOut" } };
    g.log.push({ key: "mj.log.wallOut" });
    return null;
  }
  const t = g.wall.shift()!;
  g.players[seat].hand.push(t);
  g.turn = seat;
  g.phase = { kind: "discard", seat };
  return t;
}

/** Can the seat whose turn it is declare a win on the tile just drawn? */
export function canSelfWin(g: Game): boolean {
  if (g.phase.kind !== "discard") return false;
  const p = g.players[g.phase.seat];
  return isWinning(p.hand.map((t) => t.kind), p.melds.length);
}

export function selfWin(g: Game) {
  if (!canSelfWin(g)) return;
  const seat = (g.phase as { seat: number }).seat;
  const p = g.players[seat];
  const last = p.hand[p.hand.length - 1];
  const { fan, reasons } = scoreHand(p, last.kind, true, g.round);
  settle(g, seat, fan, null);
  g.phase = { kind: "over", winner: seat, fan, reason: { key: "mj.over.selfWin", seat, reasons }, winningHand: sortTiles(p.hand) };
  g.log.push({ key: "mj.log.wins", seat, fan });
}

/** Concealed kong from hand on your own turn (four of a kind). */
export function concealedKongs(g: Game): Kind[] {
  if (g.phase.kind !== "discard") return [];
  const c = countKinds(g.players[g.phase.seat].hand.map((t) => t.kind));
  const out: Kind[] = [];
  for (let k = 0; k < 34; k++) if (c[k] === 4) out.push(k);
  return out;
}

export function declareKong(g: Game, kind: Kind) {
  if (g.phase.kind !== "discard") return;
  const seat = g.phase.seat, p = g.players[seat];
  const tiles = p.hand.filter((t) => t.kind === kind);
  if (tiles.length !== 4) return;
  removeTiles(p, tiles);
  p.melds.push({ kind: "kong", tiles, from: -1 });
  g.log.push({ key: "mj.log.kong", seat, tile: kind });
  g.phase = { kind: "draw", seat };            // replacement tile
}

export function discard(g: Game, tileId: number) {
  if (g.phase.kind !== "discard") return;
  const seat = g.phase.seat, p = g.players[seat];
  const i = p.hand.findIndex((t) => t.id === tileId);
  if (i < 0) return;
  const [t] = p.hand.splice(i, 1);
  p.hand = sortTiles(p.hand);
  p.discards.push(t);
  g.lastDiscard = { seat, tile: t };
  g.log.push({ key: "mj.log.discards", seat, tile: t.kind });
  // Everyone else gets a say, in priority order: win beats pung/kong beats chow,
  // but we simply ask each seat in turn order and resolve by priority after.
  const pending = [1, 2, 3].map((d) => (seat + d) % 4).filter((s) => claimOptions(g, s).length > 1);
  if (pending.length === 0) {
    g.phase = { kind: "draw", seat: (seat + 1) % 4 };
  } else {
    g.phase = { kind: "claim", discarder: seat, tile: t, pending };
  }
}

/** Answers collected during a claim window, resolved by priority. */
export function resolveClaims(g: Game, answers: Map<number, Claim>) {
  if (g.phase.kind !== "claim") return;
  const { discarder, tile } = g.phase;
  const rank = (c: Claim) => (c.kind === "win" ? 3 : c.kind === "kong" || c.kind === "pung" ? 2 : c.kind === "chow" ? 1 : 0);
  let best: { seat: number; claim: Claim } | null = null;
  for (const [seat, claim] of answers) {
    if (!best || rank(claim) > rank(best.claim) || (rank(claim) === rank(best.claim) && (seat - discarder + 4) % 4 < (best.seat - discarder + 4) % 4)) best = { seat, claim };
  }
  if (!best || best.claim.kind === "pass") {
    g.phase = { kind: "draw", seat: (discarder + 1) % 4 };
    return;
  }
  const p = g.players[best.seat];
  g.players[discarder].discards.pop();
  g.lastDiscard = null;
  if (best.claim.kind === "win") {
    p.hand.push(tile);
    const { fan, reasons } = scoreHand(p, tile.kind, false, g.round);
    settle(g, best.seat, fan, discarder);
    g.phase = { kind: "over", winner: best.seat, fan, reason: { key: "mj.over.winOn", seat: best.seat, from: discarder, tile: tile.kind, reasons }, winningHand: sortTiles(p.hand), fedBy: { seat: discarder, kind: tile.kind } };
    g.log.push({ key: "mj.log.wins", seat: best.seat, fan });
    return;
  }
  if (best.claim.kind === "pung" || best.claim.kind === "kong") {
    const n = best.claim.kind === "pung" ? 2 : 3;
    const mine = p.hand.filter((t) => t.kind === tile.kind).slice(0, n);
    removeTiles(p, mine);
    p.melds.push({ kind: best.claim.kind, tiles: [...mine, tile], from: discarder });
    g.log.push({ key: "mj.log.call", seat: best.seat, call: best.claim.kind, tile: tile.kind });
    g.turn = best.seat;
    g.phase = best.claim.kind === "kong" ? { kind: "draw", seat: best.seat } : { kind: "discard", seat: best.seat };
    return;
  }
  if (best.claim.kind === "chow") {
    removeTiles(p, best.claim.tiles);
    p.melds.push({ kind: "chow", tiles: sortTiles([...best.claim.tiles, tile]), from: discarder });
    g.log.push({ key: "mj.log.call", seat: best.seat, call: "chow", tile: tile.kind });
    g.turn = best.seat;
    g.phase = { kind: "discard", seat: best.seat };
  }
}

function settle(g: Game, winner: number, fan: number, discarder: number | null) {
  const base = Math.min(64, 2 ** Math.min(fan, 6)) * 2;
  for (const p of g.players) {
    if (p.seat === winner) continue;
    const pays = discarder === null ? base : discarder === p.seat ? base * 2 : base / 2;
    p.score -= pays;
    g.players[winner].score += pays;
  }
}
