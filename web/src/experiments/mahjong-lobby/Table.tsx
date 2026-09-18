"use client";

/**
 * The game around the 3D table: turn order, the three flies' decisions, and
 * the small overlay you play through. You are seat 0. The engine owns the
 * rules; the bots own the other seats; the view owns the picture.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MahjongView, TableStore, type TableView } from "./MahjongView";
import {
  canSelfWin, claimOptions, concealedKongs, declareKong, discard, draw, newGame, resolveClaims, selfWin,
  type Claim, type Game, type Kind, type Msg,
} from "./engine";
import { makeBot, type Bot } from "./bots";
import { FlyBrains, type BrainsApi } from "./FlyBrains";
import { tileName, useT, type Key, type T } from "@/lib/i18n";

const NAMES = ["You", "Otto", "Mira", "Kip"];
const ME = 0;
const WINDS: Key[] = ["mj.wind.east", "mj.wind.south", "mj.wind.west", "mj.wind.north"];

/** Table talk into words, in the current language. */
function say(t: T, m: Msg): string {
  const name = (s: number | undefined) => (s === undefined ? "" : s === ME ? t("mj.you") : NAMES[s]);
  return t(m.key as Key, {
    name: name(m.seat), from: name(m.from), n: m.n ?? "", fan: m.fan ?? "",
    tile: m.tile === undefined ? "" : tileName(t, m.tile),
    call: m.call ? t(`mj.${m.call}` as Key) : "",
    reasons: m.reasons ? m.reasons.map((r) => say(t, r)).join(", ") : "",
  });
}

export function Table() {
  const { t } = useT();
  const store = useMemo(() => new TableStore(), []);
  const gameRef = useRef<Game | null>(null);
  const bots = useMemo<Bot[]>(() => [0, 1, 2, 3].map((i) => makeBot(0x9e3779b9 * (i + 1))), []);
  const [, setTick] = useState(0);
  const [game, setGame] = useState<Game | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<TableView>("seat");
  const [brains, setBrains] = useState(false);
  const brainsApi = useRef<BrainsApi | null>(null);
  const onApi = useCallback((a: BrainsApi | null) => { brainsApi.current = a; }, []);
  const taughtHand = useRef<number>(0);
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
      const seat = ph.seat;
      const api = brainsApi.current;
      if (api?.ready(seat)) {
        // The brain decides: look at the sensible candidates, throw the one it likes least.
        let cancelled = false;
        const run = async () => {
          if (canSelfWin(g)) { selfWin(g); bump(seat); return; }
          const cands = bot.topDiscards(g, seat, 3);
          const verdicts = await Promise.all(cands.map(async (t) => ({ t, v: await api.look(seat, t.kind) })));
          if (cancelled || gameRef.current !== g || g.phase.kind !== "discard" || g.phase.seat !== seat) return;
          const worst = verdicts.reduce((a, b) => ((b.v.approach - b.v.avoid) < (a.v.approach - a.v.avoid) ? b : a));
          discard(g, worst.t.id);
          bump(seat);
        };
        later(300, () => { run().catch(() => { discard(g, bot.chooseDiscard(g, seat).id); bump(seat); }); });
        return () => { cancelled = true; };
      }
      later(650 + bot.tempo * 900, () => {
        if (canSelfWin(g)) selfWin(g);
        else discard(g, bot.chooseDiscard(g, seat).id);
        bump(seat);
      });
    } else if (ph.kind === "over" && brainsApi.current && taughtHand.current !== g.hand) {
      // Lessons: the winner is rewarded for every tile in its hand; whoever
      // fed the win is punished for the tile it threw.
      taughtHand.current = g.hand;
      const api = brainsApi.current;
      const winner = ph.winner;
      if (winner !== null && winner !== ME && api.ready(winner) && ph.winningHand) {
        const kinds = [...new Set(ph.winningHand.map((t) => t.kind))];
        (async () => { for (const k of kinds) await api.teach(winner, k, 1); })();
      }
      if (ph.fedBy && ph.fedBy.seat !== ME && api.ready(ph.fedBy.seat)) api.teach(ph.fedBy.seat, ph.fedBy.kind, -1);
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

  if (!g) return <Lobby onStart={() => start()} t={t} />;

  const ph = g.phase;
  const myTurn = ph.kind === "discard" && ph.seat === ME;
  const kongs = myTurn ? concealedKongs(g!) : [];
  const hoverTile = hover !== null ? g.players[ME].hand.find((t) => t.id === hover) : null;
  const nameOf = (s: number) => (s === ME ? t("mj.you") : NAMES[s]);
  const status =
    ph.kind === "over" ? say(t, ph.reason)
    : myClaim ? t("mj.status.threw", { name: nameOf((ph as { discarder: number }).discarder), tile: tileName(t, (ph as { tile: { kind: number } }).tile.kind) })
    : myTurn ? (hoverTile ? t("mj.status.throw", { tile: tileName(t, hoverTile.kind) }) : t("mj.status.yourTurn"))
    : ph.kind === "discard" ? t(brains ? "mj.status.looking" : "mj.status.thinking", { name: nameOf(ph.seat) })
    : ph.kind === "draw" ? t("mj.status.draws", { name: nameOf(ph.seat) })
    : "…";

  return (
    <div className="space-y-2">
      <div className="relative w-full h-[62vh] lg:h-[min(calc(100vh-24.5rem),58vw)]">
        <MahjongView store={store} me={ME} view={view} onPick={pick} onHover={setHover} className="glass-inner h-full w-full" />

        {/* Top strip: round, wall, scores. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="hud">
            <span className="t-cap">{t("mj.hand", { n: g.hand, wind: t(WINDS[g.round - 27]) })}</span>
            <span className="num t-foot">{t("mj.tilesLeft", { n: g.wall.length })}</span>
          </div>
          <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1.5 pointer-events-auto">
            <div className="seg seg-sm">
              {(["seat", "desk"] as const).map((v) => (
                <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{t(v === "seat" ? "mj.view.seat" : "mj.view.desk")}</button>
              ))}
            </div>
            <div className="seg seg-sm">
              <button aria-pressed={brains} onClick={() => setBrains(!brains)} title={t("mj.brains.title")}>{t("mj.brains")}</button>
            </div>
          </div>
          <div className="hud items-end">
            {g.players.map((p) => {
              const active = (ph.kind === "discard" || ph.kind === "draw") && ph.seat === p.seat;
              return (
                <span key={p.seat} className={`flex items-baseline gap-2 ${active ? "text-label" : "text-label-2"}`}>
                  {active && <span className="live-dot" />}
                  <span className="t-foot">{nameOf(p.seat)}</span>
                  <span className={`num t-foot ${p.score > 0 ? "text-green" : p.score < 0 ? "text-orange" : ""}`}>{p.score > 0 ? "+" : ""}{p.score}</span>
                </span>
              );
            })}
          </div>
          </div>
        </div>

        <FlyBrains names={[t("mj.you"), ...NAMES.slice(1)]} labelOf={(code) => tileName(t, code)} enabled={brains} onApi={onApi} active={ph.kind === "discard" || ph.kind === "draw" ? ph.seat : null} />

        {/* Bottom strip: what is happening, and what you can do. */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div className="hud pointer-events-none max-w-[60%]">
            <span className="t-foot">{status}</span>
            <span className="t-cap">{g.log.length > 1 ? say(t, g.log[g.log.length - 2]) : ""}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {ph.kind === "over" && (
              <button className="btn-primary text-xs" onClick={() => start((g.dealer + (ph.winner === g.dealer ? 0 : 1)) % 4, g.players.map((p) => p.score), g.hand + 1)}>
                {t("mj.next")}
              </button>
            )}
            {myTurn && canSelfWin(g!) && <button className="btn-primary text-xs" onClick={win}>{t("mj.win")}</button>}
            {kongs.map((k) => <button key={k} className="btn text-xs" onClick={() => kong(k)}>{t("mj.kong")} {tileName(t, k)}</button>)}
            {myClaim?.map((c, i) => (
              <button
                key={i}
                className={c.kind === "win" ? "btn-primary text-xs" : c.kind === "pass" ? "btn text-xs" : "btn-on text-xs"}
                onClick={() => answer(c)}
              >
                {c.kind === "chow" ? `${t("mj.chow")} ${c.tiles.map((x) => tileName(t, x.kind)).join(" · ")}` : t(`mj.${c.kind}` as Key)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="t-foot px-1">{t("mj.caption")}</p>
    </div>
  );
}

function Lobby({ onStart, t }: { onStart: () => void; t: T }) {
  return (
    <div className="glass p-10 text-center">
      <h3 className="t-title">{t("mj.lobby.title")}</h3>
      <p className="t-body mx-auto mt-3 max-w-md">{t("mj.lobby.body")}</p>
      <button onClick={onStart} className="btn-primary mt-6">{t("mj.lobby.sit")}</button>
    </div>
  );
}
