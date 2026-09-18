"use client";

/**
 * The game around the 3D table: turn order, the three flies' decisions, and
 * the small overlay you play through. You are seat 0. The engine owns the
 * rules; the bots own the other seats; the view owns the picture.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MahjongView, TableStore } from "./MahjongView";
import {
  canSelfWin, claimOptions, concealedKongs, declareKong, discard, draw, KIND_LABELS, newGame, resolveClaims, selfWin,
  type Claim, type Game, type Kind,
} from "./engine";
import { makeBot, type Bot } from "./bots";

const NAMES = ["You", "Otto", "Mira", "Kip"];
const ME = 0;
const WINDS = ["East", "South", "West", "North"];

export function Table() {
  const store = useMemo(() => new TableStore(), []);
  const gameRef = useRef<Game | null>(null);
  const bots = useMemo<Bot[]>(() => [0, 1, 2, 3].map((i) => makeBot(0x9e3779b9 * (i + 1))), []);
  const [, setTick] = useState(0);
  const [game, setGame] = useState<Game | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [myClaim, setMyClaim] = useState<Claim[] | null>(null);
  const answersRef = useRef(new Map<number, Claim>());
  const timer = useRef<number | null>(null);

  const bump = useCallback((actor: number | null = null) => {
    if (gameRef.current) store.set(gameRef.current, actor);
    setTick((t) => t + 1);
  }, [store]);

  const later = useCallback((ms: number, fn: () => void) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; fn(); }, ms);
  }, []);

  const start = useCallback((dealer = 0, scores?: number[], handNo = 1) => {
    const ng = newGame(NAMES, Date.now() ^ (handNo * 7919), dealer, scores, handNo);
    gameRef.current = ng;
    setGame(ng);
    setMyClaim(null);
    store.set(ng);
    setTick((t) => t + 1);
  }, [store]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  // The turn machine. Runs whenever the game changes.
  const g = game;
  const phaseKey = g ? `${store.version}` : "none";
  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    const ph = g.phase;
    if (ph.kind === "draw") {
      later(ph.seat === ME ? 380 : 520, () => { draw(g); bump(ph.seat); });
    } else if (ph.kind === "discard" && ph.seat !== ME) {
      const bot = bots[ph.seat];
      later(650 + bot.tempo * 900, () => {
        if (canSelfWin(g)) selfWin(g);
        else discard(g, bot.chooseDiscard(g, ph.seat).id);
        bump(ph.seat);
      });
    } else if (ph.kind === "claim") {
      const answers = new Map<number, Claim>();
      for (const s of ph.pending) if (s !== ME) answers.set(s, bots[s].chooseClaim(g, s));
      answersRef.current = answers;
      if (ph.pending.includes(ME)) {
        setMyClaim(claimOptions(g, ME));
      } else {
        later(450, () => { resolveClaims(g, answers); bump(); });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKey]);

  const pick = useCallback((tileId: number) => {
    const g = gameRef.current;
    if (!g || g.phase.kind !== "discard" || g.phase.seat !== ME) return;
    discard(g, tileId);
    bump(ME);
  }, [bump]);

  const answer = (c: Claim) => {
    const g = gameRef.current;
    if (!g || g.phase.kind !== "claim") return;
    const answers = answersRef.current;
    answers.set(ME, c);
    setMyClaim(null);
    resolveClaims(g, answers);
    bump(c.kind === "pass" ? null : ME);
  };

  const win = () => { const g = gameRef.current; if (g && canSelfWin(g)) { selfWin(g); bump(ME); } };
  const kong = (k: Kind) => { const g = gameRef.current; if (g) { declareKong(g, k); bump(ME); } };

  if (!g) return <Lobby onStart={() => start()} />;

  const ph = g.phase;
  const myTurn = ph.kind === "discard" && ph.seat === ME;
  const kongs = myTurn ? concealedKongs(g!) : [];
  const hoverTile = hover !== null ? g.players[ME].hand.find((t) => t.id === hover) : null;
  const status =
    ph.kind === "over" ? ph.reason
    : myClaim ? `${NAMES[(ph as { discarder: number }).discarder]} threw ${KIND_LABELS[(ph as { tile: { kind: number } }).tile.kind]}.`
    : myTurn ? (hoverTile ? `Throw ${KIND_LABELS[hoverTile.kind]}?` : "Your turn. Pick a tile to throw.")
    : ph.kind === "discard" ? `${NAMES[ph.seat]} is thinking…`
    : ph.kind === "draw" ? `${NAMES[ph.seat]} draws.`
    : "…";

  return (
    <div className="space-y-2">
      <div className="relative w-full" style={{ height: "min(calc(100vh - 24.5rem), 58vw)" }}>
        <MahjongView store={store} me={ME} onPick={pick} onHover={setHover} className="glass-inner h-full w-full" />

        {/* Top strip: round, wall, scores. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="hud">
            <span className="t-cap">Hand {g.hand} · {WINDS[g.round - 27]} round</span>
            <span className="num t-foot">{g.wall.length} tiles left</span>
          </div>
          <div className="hud items-end">
            {g.players.map((p) => {
              const active = (ph.kind === "discard" || ph.kind === "draw") && ph.seat === p.seat;
              return (
                <span key={p.seat} className={`flex items-baseline gap-2 ${active ? "text-label" : "text-label-2"}`}>
                  {active && <span className="live-dot" />}
                  <span className="t-foot">{p.name}</span>
                  <span className={`num t-foot ${p.score > 0 ? "text-green" : p.score < 0 ? "text-orange" : ""}`}>{p.score > 0 ? "+" : ""}{p.score}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Bottom strip: what is happening, and what you can do. */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div className="hud pointer-events-none max-w-[60%]">
            <span className="t-foot">{status}</span>
            <span className="t-cap">{g.log.slice(-2, -1)[0] ?? ""}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {ph.kind === "over" && (
              <button className="btn-primary text-xs" onClick={() => start((g.dealer + (ph.winner === g.dealer ? 0 : 1)) % 4, g.players.map((p) => p.score), g.hand + 1)}>
                Next hand
              </button>
            )}
            {myTurn && canSelfWin(g!) && <button className="btn-primary text-xs" onClick={win}>Win</button>}
            {kongs.map((k) => <button key={k} className="btn text-xs" onClick={() => kong(k)}>Kong {KIND_LABELS[k]}</button>)}
            {myClaim?.map((c, i) => (
              <button
                key={i}
                className={c.kind === "win" ? "btn-primary text-xs" : c.kind === "pass" ? "btn text-xs" : "btn-on text-xs"}
                onClick={() => answer(c)}
              >
                {c.kind === "chow" ? `Chow ${c.tiles.map((t) => KIND_LABELS[t.kind].replace(/ of .*/, "")).join("·")}` : c.kind[0].toUpperCase() + c.kind.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="t-foot px-1">
        Hong Kong rules, four sets and a pair. Chow from the fly on your left, pung and kong from anyone. Hover a tile to lift it, click to throw it.
        The three flies play a fixed strategy for now; the mushroom-body learner that replaces them is the point of this experiment.
      </p>
    </div>
  );
}

function Lobby({ onStart }: { onStart: () => void }) {
  return (
    <div className="glass p-10 text-center">
      <h3 className="t-title">Take a seat</h3>
      <p className="t-body mx-auto mt-3 max-w-md">
        A table, a lamp, three flies on stools. It loads the fly, the furniture and the tiles once, about 12 MB, then plays on your device.
      </p>
      <button onClick={onStart} className="btn-primary mt-6">Sit down</button>
    </div>
  );
}
