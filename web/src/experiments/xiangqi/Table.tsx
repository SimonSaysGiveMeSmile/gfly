"use client";

/**
 * Xiangqi on the tea table. You are red at the south seat; the one fly, at
 * the north seat, is black. The board and the
 * piece faces are the public-domain Wikimedia Commons SVGs under
 * /assets/xiangqi, drawn onto a wooden board and wooden discs. Pieces ease
 * to their points, so moves and captures animate.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TableScene, type Preset } from "@/lib/three/tableScene";
import type { BodyKind } from "@/lib/three/body";
import { useLocalT } from "@/lib/i18n";
import { useMedia } from "@/lib/useMedia";
import { useBodyKind } from "@/lib/sim/body";
import { FlyBrains, type BrainsApi, TABLE_SEATS } from "../shared/FlyBrains";
import { brainChoose, brainTeach, codeOf } from "../shared/brainPlay";
import { Lobby, NAMES, TABLE_FRAME } from "../shared/Lobby";
import { dot, ease, imageTexture, pickPlane, ring } from "../shared/tableAssets";
import { dict } from "./dict";
import { applyMove, createGame, generateLegalMoves, isInCheck, moveToString, type Color, type GameState, type Move, type PieceKind, type Position } from "./engine";
import { getBestMoves } from "./bot";

const ME = 0, FLY = 2;
const BOT: Color = "black";
const KINDS: PieceKind[] = ["general", "advisor", "elephant", "horse", "chariot", "cannon", "soldier"];
// The SVG board is 900 x 1200 with points every 100 units; the whole sheet is 0.72 m across here.
const BOARD_W = 0.72, BOARD_H = BOARD_W * 1200 / 900, PITCH = BOARD_W / 9, BOARD_T = 0.014;
const DISC_R = 0.031, DISC_H = 0.012;

type View = "seat" | "top";
const PRESETS: Record<View, Preset> = {
  seat: { pos: [0, 0.42, 0.74], look: [0, 0.03, -0.04], fov: 56 },
  top: { pos: [0, 0.95, 0.2], look: [0, 0, -0.03], fov: 50 },
};

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

/** World position of a point: red (rank 0) nearest the south seat. */
const at = (file: number, rank: number, tableTop: number) => new THREE.Vector3((file - 4) * PITCH, tableTop + BOARD_T + DISC_H / 2, (4.5 - rank) * PITCH);
// The glyph on a disc faces its owner: red's turned a quarter anticlockwise, black's a quarter clockwise.
const FACING: Record<Color, THREE.Quaternion> = {
  red: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
  black: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2),
};
const key = (p: Position) => p.rank * 9 + p.file;

function XiangqiView({ store, view, body, onPick, className }: { store: Store; view: View; body: BodyKind; onPick: (point: number) => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick); const viewRef = useRef(view);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ts = new TableScene(el, {
      body, set: "tea", presets: PRESETS, view: viewRef.current, seated: [FLY],
      mat: { shape: "square", size: 0.98, texture: "velvet", color: 0x7a5c48 },
    });
    const { scene, tableTop, renderer } = ts;
    let disposed = false;
    const group = new THREE.Group();
    scene.add(group);

    // The board: a wooden slab with the Commons sheet on top.
    const tex = new THREE.TextureLoader();
    const wood = { map: tex.load("/assets/tex/wood_table_001/diffuse.jpg"), normalMap: tex.load("/assets/tex/wood_table_001/nor_gl.jpg"), roughnessMap: tex.load("/assets/tex/wood_table_001/rough.jpg") };
    wood.map.colorSpace = THREE.SRGBColorSpace;
    const woodMat = new THREE.MeshStandardMaterial({ ...wood, color: 0xb08a5a, roughness: 0.8 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W + 0.03, BOARD_T, BOARD_H + 0.03), woodMat);
    slab.position.y = tableTop + BOARD_T / 2;
    slab.castShadow = true; slab.receiveShadow = true;
    group.add(slab);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.y = tableTop + BOARD_T + 0.0004;
    sheet.receiveShadow = true;
    group.add(sheet);
    imageTexture("/assets/xiangqi/board.svg", 1024, 1366, renderer).then((t) => {
      if (disposed) { t.dispose(); return; }
      (sheet.material as THREE.MeshStandardMaterial).map = t; (sheet.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }).catch((e) => console.error(e));

    // Discs: wood sides, the piece's face on top. One material per colour and kind.
    const discGeo = new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_H, 40);
    const faces = new Map<string, THREE.Material[]>();
    const faceReady = Promise.all((["red", "black"] as const).flatMap((c) => KINDS.map(async (k) => {
      const t = await imageTexture(`/assets/xiangqi/${c}_${k}.svg`, 256, 256, renderer, (ctx) => { ctx.fillStyle = "#e9d2a4"; ctx.fillRect(0, 0, 256, 256); });
      const top = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
      faces.set(`${c}-${k}`, [woodMat, top, woodMat]);         // cylinder groups: side, top, bottom
    }))).then(() => { seen = -1; }).catch((e) => console.error(e));

    // Points the visitor can point at, and the marks.
    const planes: THREE.Mesh[] = [];
    for (let r = 0; r < 10; r++) for (let f = 0; f < 9; f++) {
      const p = pickPlane(PITCH, PITCH, r * 9 + f);
      p.position.copy(at(f, r, tableTop)).setY(tableTop + BOARD_T + 0.0006);
      group.add(p); planes.push(p);
    }
    const markY = tableTop + BOARD_T + 0.0012;
    const selRing = ring(DISC_R * 1.35, 0x4ea1ff); selRing.visible = false; group.add(selRing);
    const checkRing = ring(DISC_R * 1.35, 0xff453a); checkRing.visible = false; group.add(checkRing);
    const lastFrom = dot(DISC_R * 0.9, 0xffd60a, 0.25); lastFrom.visible = false; group.add(lastFrom);
    const lastTo = ring(DISC_R * 1.3, 0xffd60a, 0.5); lastTo.visible = false; group.add(lastTo);
    const dots: THREE.Mesh[] = [];
    for (let i = 0; i < 20; i++) { const d = dot(0.009, 0x30d158, 0.85); d.visible = false; group.add(d); dots.push(d); }

    type P = { mesh: THREE.Mesh; key: string; point: number };
    const pieces: P[] = [];
    const targets = new Map<THREE.Object3D, { pos: THREE.Vector3; quat: THREE.Quaternion }>();
    let seen = -1;

    const layout = (game: GameState) => {
      if (faces.size < 14) return;
      const b = game.board.squares;
      const wanted: { key: string; point: number }[] = [];
      for (let r = 0; r < 10; r++) for (let f = 0; f < 9; f++) { const pc = b[r][f]; if (pc) wanted.push({ key: `${pc.color}-${pc.kind}`, point: r * 9 + f }); }
      const free = new Set(pieces);
      const assign: [P, number][] = [];
      const rest: typeof wanted = [];
      for (const w of wanted) {
        const p = [...free].find((x) => x.key === w.key && x.point === w.point);
        if (p) { free.delete(p); assign.push([p, w.point]); } else rest.push(w);
      }
      for (const w of rest) {
        let p = [...free].find((x) => x.key === w.key);
        if (!p) {
          const mesh = new THREE.Mesh(discGeo, faces.get(w.key)!);
          mesh.castShadow = true; mesh.receiveShadow = true;
          mesh.position.copy(at(w.point % 9, Math.floor(w.point / 9), tableTop));
          mesh.quaternion.copy(FACING[w.key.startsWith("red") ? "red" : "black"]);
          group.add(mesh);
          p = { mesh, key: w.key, point: w.point };
          pieces.push(p);
        }
        free.delete(p); assign.push([p, w.point]);
      }
      targets.clear();
      for (const [p, point] of assign) {
        p.point = point; p.mesh.userData.pickId = point;
        targets.set(p.mesh, { pos: at(point % 9, Math.floor(point / 9), tableTop), quat: FACING[p.key.startsWith("red") ? "red" : "black"] });
      }
      for (const p of free) { p.point = -1; p.mesh.userData.pickId = undefined; }
      ts.pickables = [...planes, ...assign.map(([p]) => p.mesh)];

      const put = (m: THREE.Mesh, pos: Position | null) => { m.visible = !!pos; if (pos) m.position.copy(at(pos.file, pos.rank, tableTop)).setY(markY); };
      put(selRing, store.selected);
      put(lastFrom, store.last?.from ?? null); put(lastTo, store.last?.to ?? null);
      dots.forEach((d, i) => put(d, store.legal[i] ? store.legal[i].to : null));
      const turn = game.board.turn;
      let general: Position | null = null;
      if (game.status !== "stalemate" && isInCheck(game.board, turn)) {
        for (let r = 0; r < 10; r++) for (let f = 0; f < 9; f++) { const pc = b[r][f]; if (pc && pc.kind === "general" && pc.color === turn) general = { file: f, rank: r }; }
      }
      put(checkRing, general);
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
    (window as unknown as { __gflyXiangqi?: unknown }).__gflyXiangqi = { point: (file: number, rank: number) => ts.toScreen(at(file, rank, tableTop)) };

    return () => {
      disposed = true;
      faceReady.then(() => { for (const m of faces.values()) { const top = m[1] as THREE.MeshStandardMaterial; top.map?.dispose(); top.dispose(); } });
      ts.dispose();
    };
  }, [store, body]);

  return <div ref={host} className={className} />;
}

export function XiangqiTable() {
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();
  const store = useMemo(() => new Store(), []);
  const [, setTick] = useState(0);
  const [game, setGame] = useState<GameState | null>(null);
  const [view, setView] = useState<View>("seat");
  const [brains, setBrains] = useState(false);
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
    setGame(g); setLog([]);
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

  const pick = useCallback((point: number) => {
    const g = store.game;
    if (!g || g.status !== "active" || g.board.turn !== "red") return;
    const pos: Position = { file: point % 9, rank: Math.floor(point / 9) };
    const to = store.legal.find((m) => m.to.file === pos.file && m.to.rank === pos.rank);
    if (to) { play(to, ME); return; }
    const pc = g.board.squares[pos.rank][pos.file];
    if (pc && pc.color === "red") store.select(pos, generateLegalMoves(g.board).filter((m) => m.from.file === pos.file && m.from.rank === pos.rank));
    else store.select(null, []);
    bump();
  }, [store, play, bump]);

  if (!game) return <Lobby title={lt("lobby.title")} body={lt("lobby.body")} action={lt("lobby.sit")} onStart={start} />;

  const g = store.game!;
  const flyName = NAMES[FLY];
  const inCheck = g.status === "active" && isInCheck(g.board, g.board.turn);
  const status =
    g.status === "checkmate" ? `${lt("checkmate")} — ${g.winner === "red" ? lt("youWin", { name: flyName }) : lt("flyWins", { name: flyName })}`
    : g.status === "stalemate" ? `${lt("stalemate")} — ${g.winner === "red" ? lt("youWin", { name: flyName }) : lt("flyWins", { name: flyName })}`
    : g.board.turn === "red" ? lt("turn.you") : lt("turn.fly", { name: flyName });
  const active = g.status === "active" ? (g.board.turn === "red" ? ME : FLY) : null;
  const names = [lt("you"), NAMES[1], flyName, NAMES[3]];
  const seats = TABLE_SEATS.filter((s) => s.seat === FLY);
  const labelOf = (c: number) => labels.current.get(c) ?? "";

  return (
    <div className="space-y-2">
      <div className={TABLE_FRAME}>
        <XiangqiView store={store} view={view} body={bodyKind} onPick={pick} className="glass-inner h-full w-full" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="hud">
            <span className="t-cap">{lt("red")} · {lt("you")}</span>
            <span className="t-foot num">{Math.floor(g.moves.length / 2) + 1}. {log.length ? log[log.length - 1] : "…"}</span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-1.5 pointer-events-auto">
              <div className="seg seg-sm">
                {(["seat", "top"] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{lt(v === "seat" ? "view.seat" : "view.top")}</button>)}
              </div>
              <div className="seg seg-sm"><button aria-pressed={brains} onClick={() => setBrains(!brains)} title={lt("brains.title")}>{lt("brains")}</button></div>
            </div>
            <div className="hud items-end">
              {[["red", ME], ["black", FLY]].map(([c, s]) => (
                <span key={c} className={`flex items-baseline gap-2 ${active === s ? "text-label" : "text-label-2"}`}>
                  {active === s && <span className="live-dot" />}
                  <span className="t-foot">{names[s as number]}</span>
                  <span className="t-cap">{lt(c as "red" | "black")}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {wide && <FlyBrains names={names} seats={seats} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} note={lt("brain.note")} />}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div className="hud pointer-events-none max-w-[60%]">
            <span className={`t-foot ${inCheck ? "text-orange" : ""}`}>{inCheck ? `${lt("check")} · ` : ""}{status}</span>
            <span className="t-cap truncate">{log.length > 1 ? `${lt("moves")}: ${log.slice(-6).join("  ")}` : ""}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {(g.status !== "active" || log.length > 0) && <button className={g.status !== "active" ? "btn-primary text-xs" : "btn text-xs"} onClick={start}>{lt("new")}</button>}
          </div>
        </div>
      </div>

      {!wide && <FlyBrains variant="strip" names={names} seats={seats} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} note={lt("brain.note")} />}
      <p className="t-foot px-1">{lt("caption")}</p>
    </div>
  );
}
