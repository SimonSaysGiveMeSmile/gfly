/**
 * The three other flies. For now they play a fixed strategy: keep the hand
 * one tile closer to complete, throw away what helps least, call when a call
 * moves the hand forward, and take a win when it is there. The learning
 * version, driven by the mushroom body, replaces this file; the table does
 * not need to know.
 */
import { claimOptions, isHonour, rankOf, shanten, type Claim, type Game, type Kind, type Tile } from "./engine";

export interface Bot {
  chooseDiscard(g: Game, seat: number): Tile;
  chooseClaim(g: Game, seat: number): Claim;
  /** A little personality for the table: how long it "thinks", 0..1. */
  tempo: number;
}

/** Value of keeping a tile, given the rest of the hand. Lower = throw first. */
function keepValue(kind: Kind, counts: Uint8Array): number {
  let v = 0;
  const n = counts[kind];
  if (n >= 2) v += 6 * (n - 1);
  if (!isHonour(kind)) {
    const r = rankOf(kind);
    if (r > 1 && counts[kind - 1]) v += 3;
    if (r < 9 && counts[kind + 1]) v += 3;
    if (r > 2 && counts[kind - 2]) v += 1;
    if (r < 8 && counts[kind + 2]) v += 1;
    v += r === 1 || r === 9 ? 0 : r === 2 || r === 8 ? 0.5 : 1;   // middles connect more
  } else {
    v -= 0.5;
  }
  return v;
}

export function makeBot(seed: number): Bot {
  let s = seed >>> 0 || 7;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const tempo = 0.3 + rnd() * 0.7;
  return {
    tempo,
    chooseDiscard(g, seat) {
      const p = g.players[seat];
      const kinds = p.hand.map((t) => t.kind);
      const counts = new Uint8Array(34);
      for (const k of kinds) counts[k]++;
      // Prefer the discard that leaves the lowest shanten; break ties on keep value.
      let best: { t: Tile; sh: number; v: number } | null = null;
      for (const t of p.hand) {
        const rest = kinds.filter((_, i) => p.hand[i].id !== t.id);
        const sh = shanten(rest, p.melds.length);
        counts[t.kind]--;
        const v = keepValue(t.kind, counts) + rnd() * 0.3;
        counts[t.kind]++;
        if (!best || sh < best.sh || (sh === best.sh && v < best.v)) best = { t, sh, v };
      }
      return best!.t;
    },
    chooseClaim(g, seat) {
      const opts = claimOptions(g, seat);
      const win = opts.find((o) => o.kind === "win");
      if (win) return win;
      const p = g.players[seat];
      const kinds = p.hand.map((t) => t.kind);
      const before = shanten(kinds, p.melds.length);
      const ld = g.lastDiscard!;
      for (const o of opts) {
        if (o.kind === "pung" || o.kind === "kong") {
          const rest = [...kinds];
          for (let i = 0; i < (o.kind === "pung" ? 2 : 3); i++) rest.splice(rest.indexOf(ld.tile.kind), 1);
          if (shanten(rest, p.melds.length + 1) < before) return o;
        }
        if (o.kind === "chow") {
          const rest = kinds.filter((_, i) => !o.tiles.some((t) => t.id === p.hand[i].id));
          if (shanten(rest, p.melds.length + 1) < before && rnd() < 0.7) return o;
        }
      }
      return { kind: "pass" };
    },
  };
}
