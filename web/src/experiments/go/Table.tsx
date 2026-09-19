"use client";

/**
 * Go on the tea table. The board is a wooden slab with the grid inked
 * into Poly Haven's wood texture in a canvas; the stones are flattened
 * spheres, slate and shell. You play black from the south seat, one fly
 * plays white from the north stool. The engine keeps the rules; the bot
 * rates points; with Brains on the fly's connectome chooses among the
 * best and learns from how they ranked.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TableScene, type Preset } from "@/lib/three/tableScene";
import type { BodyKind } from "@/lib/three/body";
import { useLocalT } from "@/lib/i18n";
import { useMedia } from "@/lib/useMedia";
import { useBodyKind } from "@/lib/sim/body";
import { FlyBrains, TABLE_SEATS, type BrainsApi } from "../shared/FlyBrains";
import { brainChoose, brainTeach, codeOf } from "../shared/brainPlay";
import { Lobby, NAMES, TABLE_FRAME } from "../shared/Lobby";
import { canvasTexture, dot, ease, loadImage, pickPlane, ring, FLAT } from "../shared/tableAssets";
import { dict } from "./dict";
import { coord, createGame, isLegal, pass, play, score, type GameState } from "./engine";
import { getBestMoves } from "./bot";

const ME = 0, FLY = 2;
const SIZE = 9;
const BOARD = 0.40, PITCH = BOARD * 0.86 / (SIZE - 1), BOARD_T = 0.022, PX = 1024;
const STONE_R = PITCH * 0.47, STONE_H = 0.0095;
const SEATS = TABLE_SEATS.filter((s) => s.seat === FLY);

type View = "seat" | "top";
const PRESETS: Record<View, Preset> = {
  seat: { pos: [0, 0.46, 0.56], look: [0, 0.02, -0.02], fov: 52 },
  top: { pos: [0, 0.62, 0.04], look: [0, 0, -0.02], fov: 38 },
};

class Store {
  game: GameState | null = null;
  hover: number | null = null;
  actor: number | null = null;
  version = 0;
  bump(actor: number | null = null) { this.actor = actor; this.version++; }
  set(game: GameState) { this.game = game; }
  setHover(i: number | null) { this.hover = i; this.version++; }
}

const pointAt = (i: number, tableTop: number) => new THREE.Vector3((i % SIZE - (SIZE - 1) / 2) * PITCH, tableTop + BOARD_T, (Math.floor(i / SIZE) - (SIZE - 1) / 2) * PITCH);

function GoView({ store, view, body, onPick, className }: { store: Store; view: View; body: BodyKind; onPick: (i: number) => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick); const viewRef = useRef(view);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ts = new TableScene(el, {
      body, set: "tea", presets: PRESETS, view: viewRef.current, seated: [FLY],
      mat: { shape: "square", size: 0.96, texture: "velvet", color: 0x5d5a4a },
    });
    const { scene, tableTop, renderer } = ts;
    let disposed = false;
    const group = new THREE.Group();
    scene.add(group);

    // The board: a slab of Poly Haven wood with the grid drawn on its top.
    const canvas = document.createElement("canvas");
    canvas.width = PX; canvas.height = PX;
    const ctx = canvas.getContext("2d")!;
    const tex = canvasTexture(canvas, renderer);
    const loader = new THREE.TextureLoader();
    const side = new THREE.MeshStandardMaterial({ map: loader.load("/assets/tex/wood_table_001/diffuse.jpg"), color: 0xd9b27a, roughness: 0.6 });
    side.map!.colorSpace = THREE.SRGBColorSpace;
    const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, normalMap: loader.load("/assets/tex/wood_table_001/nor_gl.jpg"), normalScale: new THREE.Vector2(0.4, 0.4) });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD, BOARD_T, BOARD), [side, side, top, side, side, side]);
    slab.position.y = tableTop + 0.0075 + BOARD_T / 2;
    slab.castShadow = true; slab.receiveShadow = true;
    group.add(slab);
    const drawBoard = (wood: HTMLImageElement | null) => {
      if (wood) ctx.drawImage(wood, 0, 0, PX, PX); else { ctx.fillStyle = "#d8b47c"; ctx.fillRect(0, 0, PX, PX); }
      ctx.fillStyle = "rgba(232,190,120,0.55)"; ctx.fillRect(0, 0, PX, PX);   // kaya, lighter than the table wood
      const m = PX * 0.07, g = PX * 0.86, cell = g / (SIZE - 1);
      ctx.strokeStyle = "#2a1e12"; ctx.lineWidth = PX * 0.0035; ctx.lineCap = "square";
      for (let i = 0; i < SIZE; i++) {
        ctx.beginPath(); ctx.moveTo(m + i * cell, m); ctx.lineTo(m + i * cell, m + g); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(m, m + i * cell); ctx.lineTo(m + g, m + i * cell); ctx.stroke();
      }
      ctx.fillStyle = "#2a1e12";
      for (const [r, c] of [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]]) { ctx.beginPath(); ctx.arc(m + c * cell, m + r * cell, PX * 0.009, 0, Math.PI * 2); ctx.fill(); }
      tex.needsUpdate = true;
    };
    drawBoard(null);
    loadImage("/assets/tex/wood_table_001/diffuse.jpg").then((im) => { if (!disposed) drawBoard(im); }).catch((e) => console.error(e));

    // Stones: one geometry, two materials, a mesh per point made when first needed.
    const stoneGeo = new THREE.SphereGeometry(STONE_R, 40, 24);
    stoneGeo.scale(1, STONE_H / STONE_R, 1);
    const slate = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.32, metalness: 0.05 });
    const shell = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.28, metalness: 0.02 });
    const stones = new Map<number, THREE.Mesh>();
    const targets = new Map<THREE.Object3D, { pos: THREE.Vector3; quat: THREE.Quaternion } | undefined>();
    const marker = ring(STONE_R * 0.55, 0xf0b25a, 0.9); marker.visible = false; group.add(marker);
    const hoverDot = dot(STONE_R * 0.5, 0xf0b25a, 0.55); hoverDot.visible = false; group.add(hoverDot);
    const terr: THREE.Mesh[] = [];

    const planes: THREE.Mesh[] = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      const p = pickPlane(PITCH, PITCH, i);
      p.position.copy(pointAt(i, tableTop)).add(new THREE.Vector3(0, 0.0075 + 0.001, 0));
      group.add(p); planes.push(p);
    }
    ts.pickables = planes;

    const layout = (game: GameState) => {
      for (let i = 0; i < game.board.length; i++) {
        const v = game.board[i];
        let m = stones.get(i);
        if (v && !m) {
          m = new THREE.Mesh(stoneGeo, v === 1 ? slate : shell);
          m.castShadow = true; m.receiveShadow = true;
          const at = pointAt(i, tableTop);
          m.position.set(at.x, tableTop + 0.0075 + BOARD_T + 0.05, at.z);   // drops in from above
          m.visible = false;
          group.add(m); stones.set(i, m);
        }
        if (!m) continue;
        if (v) {
          m.material = v === 1 ? slate : shell;
          targets.set(m, { pos: pointAt(i, tableTop).add(new THREE.Vector3(0, 0.0075 + STONE_H / 2, 0)), quat: FLAT });
        } else targets.set(m, undefined);
      }
      if (game.last >= 0) { marker.visible = true; marker.position.copy(pointAt(game.last, tableTop)).add(new THREE.Vector3(0, 0.0075 + STONE_H + 0.001, 0)); }
      else marker.visible = false;
      for (const t of terr) { group.remove(t); t.geometry.dispose(); (t.material as THREE.Material).dispose(); }
      terr.length = 0;
      if (game.status === "over") {
        const s = score(game);
        for (let i = 0; i < s.territory.length; i++) {
          const o = s.territory[i];
          if (!o) continue;
          const d = dot(STONE_R * 0.3, o === 1 ? 0x14161a : 0xf3efe6, 0.9);
          d.position.copy(pointAt(i, tableTop)).add(new THREE.Vector3(0, 0.0075 + 0.001, 0));
          group.add(d); terr.push(d);
        }
      }
      const h = store.hover;
      if (h !== null && game.status === "active" && game.board[h] === 0) { hoverDot.visible = true; hoverDot.position.copy(pointAt(h, tableTop)).add(new THREE.Vector3(0, 0.0075 + 0.0015, 0)); }
      else hoverDot.visible = false;
    };

    let seen = -1;
    ts.onPick = (id) => pickRef.current(id);
    ts.onHover = (id) => store.setHover(id);
    ts.onFrame = (dt) => {
      ts.view = viewRef.current;
      if (store.game && store.version !== seen) {
        seen = store.version;
        layout(store.game);
        if (store.actor !== null) ts.reach(store.actor);
      }
      ease(targets, dt, 10);
    };
    (window as unknown as { __gflyGo?: unknown }).__gflyGo = {
      point: (i: number) => ts.toScreen(pointAt(i, tableTop).add(new THREE.Vector3(0, 0.0075, 0))),
      state: () => store.game,
    };

    return () => { disposed = true; tex.dispose(); stoneGeo.dispose(); ts.dispose(); };
  }, [store, body]);

  return <div ref={host} className={className} />;
}

export function GoTable() {
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();
  const store = useMemo(() => new Store(), []);
  const [, setTick] = useState(0);
  const [game, setGame] = useState<GameState | null>(null);
  const [view, setView] = useState<View>("seat");
  const [brains, setBrains] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const brainsApi = useRef<BrainsApi | null>(null);
  const onApi = useCallback((a: BrainsApi | null) => { brainsApi.current = a; }, []);
  const labels = useRef(new Map<number, string>());
  const timer = useRef<number | null>(null);

  const commit = useCallback((g: GameState, actor: number | null) => { store.set(g); setGame(g); store.bump(actor); setTick((t) => t + 1); }, [store]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const start = useCallback(() => { setNote(null); commit(createGame(SIZE), null); }, [commit]);

  // The fly's stone after yours.
  useEffect(() => {
    const g = store.game;
    if (!g || g.status !== "active" || g.turn !== 2) return;
    let cancelled = false;
    const run = async () => {
      const cands = getBestMoves(g, 2, 3);
      const weak = cands.length === 0 || (g.moves > 20 && cands[0].score < 1.5) || (g.passes === 1 && cands[0].score < 4);
      if (weak) { setNote(lt("passed", { name: NAMES[FLY] })); commit(pass(g), FLY); return; }
      const api = brainsApi.current;
      const code = (c: (typeof cands)[number]) => { const k = codeOf(`go:${c.point}`); labels.current.set(k, coord(SIZE, c.point)); return k; };
      const r = await brainChoose(api, FLY, cands.map((c) => ({ item: c, code: code(c) })), "like");
      if (cancelled || store.game !== g) return;
      const chosen = r?.item ?? cands[0];
      if (r) {
        const rank = cands.indexOf(chosen);
        if (rank === 0) brainTeach(api, FLY, [code(chosen)], 1);
        else if (rank === cands.length - 1) brainTeach(api, FLY, [code(chosen)], -1);
      }
      setNote(null);
      commit(play(g, chosen.point), FLY);
    };
    timer.current = window.setTimeout(() => { timer.current = null; run().catch((e) => console.error(e)); }, 650);
    return () => { cancelled = true; if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  const pick = useCallback((i: number) => {
    const g = store.game;
    if (!g || g.status !== "active" || g.turn !== 1 || !isLegal(g, i, 1)) return;
    setNote(null);
    commit(play(g, i), ME);
  }, [store, commit]);

  const doPass = useCallback(() => {
    const g = store.game;
    if (!g || g.status !== "active" || g.turn !== 1) return;
    setNote(lt("passed", { name: lt("you") }));
    commit(pass(g), ME);
  }, [store, commit, lt]);

  if (!game) return <Lobby title={lt("lobby.title")} body={lt("lobby.body")} action={lt("lobby.sit")} onStart={start} />;

  const names = [lt("you"), NAMES[1], NAMES[2], NAMES[3]];
  const active = game.status === "active" ? (game.turn === 1 ? ME : FLY) : null;
  const sc = score(game);
  const diff = Math.abs(sc.black - sc.white);
  const status = game.status === "over"
    ? (sc.black > sc.white ? lt("youWin", { n: diff }) : lt("flyWins", { name: NAMES[FLY], n: diff }))
    : game.turn === 1 ? lt("turn.you") : lt("turn.fly", { name: NAMES[FLY] });
  const labelOf = (c: number) => labels.current.get(c) ?? "";
  const canPlay = game.status === "active" && game.turn === 1;

  return (
    <div className="space-y-2">
      <div className={TABLE_FRAME}>
        <GoView store={store} view={view} body={bodyKind} onPick={pick} className="glass-inner h-full w-full" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="hud">
            <span className="t-cap">{lt("moves")} {game.moves} · {lt("score", { b: sc.black, w: sc.white })}</span>
            <span className="t-foot num">{status}</span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-1.5 pointer-events-auto">
              <div className="seg seg-sm">
                {(["seat", "top"] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{lt(v === "seat" ? "view.seat" : "view.top")}</button>)}
              </div>
              <div className="seg seg-sm"><button aria-pressed={brains} onClick={() => setBrains(!brains)} title={lt("brains.title")}>{lt("brains")}</button></div>
            </div>
            <div className="hud items-end">
              {[ME, FLY].map((s) => (
                <span key={s} className={`flex items-baseline gap-2 ${active === s ? "text-label" : "text-label-2"}`}>
                  {active === s && <span className="live-dot" />}
                  <span className="t-foot">{names[s]} · {s === ME ? lt("black") : lt("white")}</span>
                  <span className="t-cap">{lt("captures", { n: game.captures[s === ME ? 0 : 1] })}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {wide && <FlyBrains names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} seats={SEATS} note={lt("brain.note")} />}

        <div className="absolute inset-x-0 bottom-0 flex flex-col items-stretch gap-2 p-3 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <div className="hud pointer-events-none sm:max-w-[55%]">
            <span className="t-foot">{note ?? status}</span>
          </div>
          <div className="flex justify-end gap-1.5">
            {game.status === "active" ? (
              <button className="btn text-xs" disabled={!canPlay} onClick={doPass}>{lt("pass")}</button>
            ) : (
              <button className="btn-primary text-xs" onClick={start}>{lt("new")}</button>
            )}
          </div>
        </div>
      </div>

      {!wide && <FlyBrains variant="strip" names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} seats={SEATS} note={lt("brain.note")} />}
      <p className="t-foot px-1">{lt("caption")}</p>
    </div>
  );
}
