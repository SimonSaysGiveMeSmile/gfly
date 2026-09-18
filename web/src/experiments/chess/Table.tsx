"use client";

/**
 * Chess on the tea table. You are white at the south seat; the one fly, at
 * the north seat, is black. The set is Poly
 * Haven's chess_set (CC0): its board and one mesh per piece kind, cloned
 * for every piece on the board. Pieces ease to their squares, so moves
 * and captures animate for free. The engine owns the rules; the bot
 * proposes candidates; with Brains on the fly's connectome picks one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TableScene, type Preset } from "@/lib/three/tableScene";
import type { BodyKind } from "@/lib/three/body";
import { useLocalT } from "@/lib/i18n";
import { useMedia } from "@/lib/useMedia";
import { useBodyKind } from "@/lib/sim/body";
import { FlyBrains, type BrainsApi, TABLE_SEATS } from "../shared/FlyBrains";
import { brainChoose, brainTeach, codeOf } from "../shared/brainPlay";
import { Lobby, NAMES, TABLE_FRAME } from "../shared/Lobby";
import { dot, ease, pickPlane, ring } from "../shared/tableAssets";
import { dict } from "./dict";
import { applyMove, createGame, generateLegalMoves, isInCheck, moveToString, posToString, type Color, type GameState, type Move, type PieceKind, type Position } from "./engine";
import { getBestMoves } from "./bot";

const ME = 0, FLY = 2;
const BOT: Color = "black";
const SCALE = 1.3;                       // the set is 55 cm across; a little bigger reads better from the stool
const PITCH = 0.05789 * SCALE;           // square pitch in the glTF, scaled
const PIECE_Y = 0.01739 * SCALE;         // the board's top face

type View = "seat" | "top";
const PRESETS: Record<View, Preset> = {
  // Steep enough that the back ranks are not hidden behind the pieces in front.
  seat: { pos: [0, 0.58, 0.58], look: [0, 0.02, -0.04], fov: 52 },
  top: { pos: [0, 0.86, 0.12], look: [0, 0, -0.03], fov: 46 },
};

/** Game state handed to the scene without going through React renders. */
class Store {
  game: GameState | null = null;
  selected: Position | null = null;
  legal: Move[] = [];
  last: Move | null = null;
  actor: number | null = null;
  version = 0;
  bump(actor: number | null = null) { this.actor = actor; this.version++; }
  begin(game: GameState) { this.game = game; this.selected = null; this.legal = []; this.last = null; }
  moved(move: Move) { this.last = move; this.selected = null; this.legal = []; }
  select(selected: Position | null, legal: Move[]) { this.selected = selected; this.legal = legal; }
}
/** World position of a square: white (rank 0) nearest the south seat, a-file on its left. */
const at = (file: number, rank: number, tableTop: number) => new THREE.Vector3(-(file - 3.5) * PITCH, tableTop + PIECE_Y, -(rank - 3.5) * PITCH);
const TURNED = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

function ChessView({ store, view, body, onPick, className }: { store: Store; view: View; body: BodyKind; onPick: (square: number) => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick); const viewRef = useRef(view);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ts = new TableScene(el, {
      body, set: "tea", presets: PRESETS, view: viewRef.current, seated: [FLY],
      mat: { shape: "square", size: 0.96, texture: "velvet", color: 0x6e7a6a },
    });
    const { scene, tableTop } = ts;
    let disposed = false;

    // The set: board in the middle, one template mesh per colour and kind.
    const group = new THREE.Group();
    scene.add(group);
    const templates = new Map<string, THREE.Object3D>();
    new GLTFLoader().loadAsync("/assets/models/chess_set/chess_set.gltf").then((g) => {
      if (disposed) return;
      // The loader names objects after their meshes ("Cylinder.014") and wraps a
      // multi-material piece (the bishops) in a Group; the piece names live on the
      // glTF nodes, one per top-level child of the scene.
      const nodes = (g.parser.json as { nodes: { name?: string }[] }).nodes;
      for (const o of g.scene.children) {
        const i = g.parser.associations.get(o)?.nodes;
        const name = (i !== undefined && nodes[i]?.name) || o.name;
        o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
        if (name === "board") {
          const board = o.clone();
          board.position.set(0, tableTop, 0);
          board.quaternion.copy(TURNED);
          board.scale.setScalar(SCALE);
          group.add(board);
          continue;
        }
        const mm = /^piece_(\w+?)_(white|black)/.exec(name);
        if (mm && !templates.has(`${mm[2]}-${mm[1]}`)) templates.set(`${mm[2]}-${mm[1]}`, o);
      }
      seen = -1;                                         // lay the pieces out now the meshes exist
    }).catch((e) => console.error(e));

    // Squares the visitor can point at, and the marks laid on them.
    const planes: THREE.Mesh[] = [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = pickPlane(PITCH, PITCH, r * 8 + f);
      p.position.copy(at(f, r, tableTop)).add(new THREE.Vector3(0, 0.0005, 0));
      group.add(p); planes.push(p);
    }
    const selRing = ring(PITCH * 0.48, 0x4ea1ff); selRing.visible = false; group.add(selRing);
    const checkRing = ring(PITCH * 0.48, 0xff453a); checkRing.visible = false; group.add(checkRing);
    const lastFrom = dot(PITCH * 0.44, 0xffd60a, 0.22); lastFrom.visible = false; group.add(lastFrom);
    const lastTo = dot(PITCH * 0.44, 0xffd60a, 0.32); lastTo.visible = false; group.add(lastTo);
    const dots: THREE.Mesh[] = [];
    for (let i = 0; i < 32; i++) { const d = dot(PITCH * 0.14, 0x30d158, 0.8); d.visible = false; group.add(d); dots.push(d); }

    // Pieces: a pool of clones per colour and kind, matched to squares by where they last stood.
    type P = { mesh: THREE.Object3D; key: string; square: number };
    const pieces: P[] = [];
    const targets = new Map<THREE.Object3D, { pos: THREE.Vector3; quat: THREE.Quaternion }>();
    let seen = -1;

    const layout = (game: GameState) => {
      if (templates.size === 0) return;
      const b = game.board.squares;
      const wanted: { key: string; square: number }[] = [];
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const pc = b[r][f]; if (pc) wanted.push({ key: `${pc.color}-${pc.kind}`, square: r * 8 + f }); }
      const free = new Set(pieces);
      const assign: [P, number][] = [];
      // First pieces that have not moved, then the rest of the same kind (the piece that moved), then new clones (promotions).
      const rest: typeof wanted = [];
      for (const w of wanted) {
        const p = [...free].find((x) => x.key === w.key && x.square === w.square);
        if (p) { free.delete(p); assign.push([p, w.square]); } else rest.push(w);
      }
      for (const w of rest) {
        let p = [...free].find((x) => x.key === w.key);
        if (!p) {
          const t = templates.get(w.key);
          if (!t) { console.error(`chess set has no ${w.key}`); continue; }
          const mesh = t.clone();
          mesh.scale.setScalar(SCALE);
          mesh.quaternion.copy(TURNED);
          const [file, rank] = [w.square % 8, Math.floor(w.square / 8)];
          mesh.position.copy(at(file, rank, tableTop));
          group.add(mesh);
          p = { mesh, key: w.key, square: w.square };
          pieces.push(p);
        }
        free.delete(p); assign.push([p, w.square]);
      }
      targets.clear();
      for (const [p, square] of assign) {
        p.square = square;
        p.mesh.userData.pickId = square;
        targets.set(p.mesh, { pos: at(square % 8, Math.floor(square / 8), tableTop), quat: TURNED });
      }
      for (const p of free) { p.square = -1; p.mesh.userData.pickId = undefined; }   // captured: fades off in ease()
      ts.pickables = [...planes, ...assign.map(([p]) => p.mesh)];

      // Marks.
      const put = (m: THREE.Mesh, pos: Position | null) => { m.visible = !!pos; if (pos) m.position.copy(at(pos.file, pos.rank, tableTop)).add(new THREE.Vector3(0, 0.001, 0)); };
      put(selRing, store.selected);
      put(lastFrom, store.last?.from ?? null); put(lastTo, store.last?.to ?? null);
      dots.forEach((d, i) => put(d, store.legal[i] ? store.legal[i].to : null));
      const turn = game.board.turn;
      let king: Position | null = null;
      if (game.status !== "stalemate" && game.status !== "draw" && isInCheck(game.board, turn)) {
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const pc = b[r][f]; if (pc && pc.kind === "king" && pc.color === turn) king = { file: f, rank: r }; }
      }
      put(checkRing, king);
    };

    ts.onPick = (id) => pickRef.current(id);
    ts.onFrame = (dt) => {
      ts.view = viewRef.current;
      if (store.game && store.version !== seen) {
        seen = store.version;
        layout(store.game);
        if (store.actor !== null) ts.reach(store.actor);
      }
      ease(pieces.map((p) => [p.mesh, targets.get(p.mesh)]), dt, 8);
    };
    // Where squares are on screen, for checks from outside (tests, the console).
    (window as unknown as { __gflyChess?: unknown }).__gflyChess = {
      square: (file: number, rank: number, up = 0) => ts.toScreen(at(file, rank, tableTop).add(new THREE.Vector3(0, up, 0))),
      hit: (x: number, y: number) => {
        const r = ts.renderer.domElement.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), ts.camera);
        return ray.intersectObjects(ts.pickables, true).slice(0, 3).map((h) => ({ name: h.object.name, pickId: h.object.userData.pickId, d: h.distance }));
      },
      pickables: () => ts.pickables.length,
      pieces: () => pieces.filter((p) => p.mesh.visible).map((p) => `${p.key}@${p.square}`),
      state: () => store.game && { turn: store.game.board.turn, status: store.game.status, winner: store.game.winner, moves: store.game.moves.length },
      legal: () => (store.game ? generateLegalMoves(store.game.board).map((m) => [m.from.file, m.from.rank, m.to.file, m.to.rank]) : []),
      creatures: () => ts.creatures.map((c) => c.seat),
    };

    return () => { disposed = true; ts.dispose(); };
  }, [store, body]);

  return <div ref={host} className={className} />;
}

export function ChessTable() {
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();
  const store = useMemo(() => new Store(), []);
  const [, setTick] = useState(0);
  const [game, setGame] = useState<GameState | null>(null);
  const [view, setView] = useState<View>("seat");
  const [brains, setBrains] = useState(false);
  const [promo, setPromo] = useState<Move[] | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const brainsApi = useRef<BrainsApi | null>(null);
  const onApi = useCallback((a: BrainsApi | null) => { brainsApi.current = a; }, []);
  const labels = useRef(new Map<number, string>());
  const timer = useRef<number | null>(null);

  const bump = useCallback((actor: number | null = null) => { store.bump(actor); setTick((t) => t + 1); }, [store]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const start = useCallback(() => {
    const g = createGame();
    store.begin(g);
    setGame(g); setLog([]); setPromo(null);
    bump();
  }, [store, bump]);

  const play = useCallback((move: Move, actor: number) => {
    const g = store.game;
    if (!g) return;
    applyMove(g, move);
    store.moved(move);
    setLog((l) => [...l, moveToString(move)].slice(-12));
    bump(actor);
  }, [store, bump]);

  // The fly's turn: the search proposes, the brain (if on and ready) chooses, a lesson follows.
  const flyTurn = useCallback(async () => {
    const g = store.game;
    if (!g || g.status !== "active" || g.board.turn !== BOT) return;
    const cands = getBestMoves(g.board, 3, 3);
    if (cands.length === 0) return;
    const api = brainsApi.current;
    if (!api?.ready(FLY)) { play(cands[0].move, FLY); return; }
    const code = (m: Move) => { const c = codeOf(moveToString(m)); labels.current.set(c, moveToString(m)); return c; };
    const r = await brainChoose(api, FLY, cands.map((c) => ({ item: c, code: code(c.move) })), "like");
    if (store.game !== g || g.board.turn !== BOT) return;
    const chosen = r?.item ?? cands[0];
    // Best of the candidates: reward. Worst: punish. In between: nothing to learn.
    if (r && cands.length > 1 && chosen === cands[0]) brainTeach(api, FLY, [code(chosen.move)], 1);
    else if (r && cands.length > 1 && chosen === cands[cands.length - 1]) brainTeach(api, FLY, [code(chosen.move)], -1);
    play(chosen.move, FLY);
  }, [store, play]);

  const version = store.version;
  useEffect(() => {
    const g = store.game;
    if (!g || g.status !== "active" || g.board.turn !== BOT) return;
    timer.current = window.setTimeout(() => { timer.current = null; flyTurn(); }, 650);
    return () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const pick = useCallback((square: number) => {
    const g = store.game;
    if (!g || g.status !== "active" || g.board.turn !== "white" || promo) return;
    const pos: Position = { file: square % 8, rank: Math.floor(square / 8) };
    const to = store.legal.filter((m) => m.to.file === pos.file && m.to.rank === pos.rank);
    if (to.length === 1) { play(to[0], ME); return; }
    if (to.length > 1) { setPromo(to); return; }      // one move per promotion piece: ask
    const pc = g.board.squares[pos.rank][pos.file];
    if (pc && pc.color === "white") store.select(pos, generateLegalMoves(g.board).filter((m) => m.from.file === pos.file && m.from.rank === pos.rank));
    else store.select(null, []);
    bump();
  }, [store, play, bump, promo]);

  if (!game) return <Lobby title={lt("lobby.title")} body={lt("lobby.body")} action={lt("lobby.sit")} onStart={start} />;

  const g = store.game!;
  const flyName = NAMES[FLY];
  const inCheck = g.status === "active" && isInCheck(g.board, g.board.turn);
  const status =
    g.status === "checkmate" ? `${lt("checkmate")} — ${g.winner === "white" ? lt("youWin", { name: flyName }) : lt("flyWins", { name: flyName })}`
    : g.status === "stalemate" ? lt("stalemate")
    : g.status === "draw" ? lt("draw")
    : g.board.turn === "white" ? lt("turn.you") : lt("turn.fly", { name: flyName });
  const active = g.status === "active" ? (g.board.turn === "white" ? ME : FLY) : null;
  const names = [lt("you"), NAMES[1], flyName, NAMES[3]];
  const seats = TABLE_SEATS.filter((s) => s.seat === FLY);
  const labelOf = (c: number) => labels.current.get(c) ?? "";

  return (
    <div className="space-y-2">
      <div className={TABLE_FRAME}>
        <ChessView store={store} view={view} body={bodyKind} onPick={pick} className="glass-inner h-full w-full" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="hud">
            <span className="t-cap">{lt("white")} · {lt("you")}</span>
            <span className="t-foot num">{g.board.fullmoveNumber}. {log.length ? log[log.length - 1] : "…"}</span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-1.5 pointer-events-auto">
              <div className="seg seg-sm">
                {(["seat", "top"] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{lt(v === "seat" ? "view.seat" : "view.top")}</button>)}
              </div>
              <div className="seg seg-sm"><button aria-pressed={brains} onClick={() => setBrains(!brains)} title={lt("brains.title")}>{lt("brains")}</button></div>
            </div>
            <div className="hud items-end">
              {[["white", ME], ["black", FLY]].map(([c, s]) => (
                <span key={c} className={`flex items-baseline gap-2 ${active === s ? "text-label" : "text-label-2"}`}>
                  {active === s && <span className="live-dot" />}
                  <span className="t-foot">{names[s as number]}</span>
                  <span className="t-cap">{lt(c as "white" | "black")}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {wide && <FlyBrains names={names} seats={seats} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} note={lt("brain.note")} />}

        {promo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="glass p-4 text-center">
              <p className="t-cap mb-2">{lt("promote")}</p>
              <div className="flex gap-1.5">
                {promo.map((m) => <button key={m.promotion} className="btn text-xs" onClick={() => { setPromo(null); play(m, ME); }}>{lt(`piece.${m.promotion as Exclude<PieceKind, "pawn" | "king">}`)}</button>)}
              </div>
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div className="hud pointer-events-none max-w-[60%]">
            <span className={`t-foot ${inCheck ? "text-orange" : ""}`}>{inCheck && g.status === "active" ? `${lt("check")} · ` : ""}{status}</span>
            <span className="t-cap truncate">{log.length > 1 ? `${lt("moves")}: ${log.slice(-6).join("  ")}` : ""}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {g.status !== "active" && <button className="btn-primary text-xs" onClick={start}>{lt("new")}</button>}
            {g.status === "active" && log.length > 0 && <button className="btn text-xs" onClick={start}>{lt("new")}</button>}
          </div>
        </div>
      </div>

      {!wide && <FlyBrains variant="strip" names={names} seats={seats} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} note={lt("brain.note")} />}
      <p className="t-foot px-1">{lt("caption")}</p>
    </div>
  );
}
