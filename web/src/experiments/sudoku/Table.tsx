"use client";

/**
 * A paper sudoku on the tea table, solved by you and the three flies in
 * turn. The sheet is Poly Haven's paper texture with the grid and the
 * digits inked onto it in a canvas; the ink colour says who wrote what.
 * The engine keeps the rules; the bot ranks empty cells by how few digits
 * fit; with Brains on the fly's connectome chooses among them and learns
 * whether the cell was a safe one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TableScene, type Preset } from "@/lib/three/tableScene";
import type { BodyKind } from "@/lib/three/body";
import { useLocalT } from "@/lib/i18n";
import { useMedia } from "@/lib/useMedia";
import { useBodyKind } from "@/lib/sim/body";
import { FlyBrains, type BrainsApi } from "../shared/FlyBrains";
import { brainChoose, brainTeach, codeOf } from "../shared/brainPlay";
import { Lobby, NAMES, TABLE_FRAME } from "../shared/Lobby";
import { canvasTexture, loadImage, pickPlane } from "../shared/tableAssets";
import { dict } from "./dict";
import { createGame, getCandidates, type GameState } from "./engine";
import { getBestMoves } from "./bot";

const ME = 0;
const SHEET = 0.46, CELL = SHEET * 0.9 / 9, PX = 1024;
const INK = ["#1c1a17", "#1d5fd1", "#2a8f4a", "#d9791d", "#8a4fd6"];   // given, you, Otto, Mira, Kip
const RED = "#d3382b";
type Difficulty = "easy" | "medium" | "hard";

type View = "seat" | "top";
const PRESETS: Record<View, Preset> = {
  seat: { pos: [0, 0.44, 0.56], look: [0, 0.0, -0.02], fov: 52 },
  top: { pos: [0, 0.72, 0.06], look: [0, 0, -0.02], fov: 46 },
};

class Store {
  game: GameState | null = null;
  /** Who wrote each cell: 0 given, 1 you, 2..4 the flies (seat + 1). */
  who: number[][] = [];
  selected: { row: number; col: number } | null = null;
  actor: number | null = null;
  version = 0;
  bump(actor: number | null = null) { this.actor = actor; this.version++; }
  begin(game: GameState) { this.game = game; this.who = game.initial.map((row) => row.map(() => 0)); this.selected = null; }
  wrote(row: number, col: number, n: number, who: number) { if (this.game) { this.game.current[row][col] = n; this.who[row][col] = n ? who : 0; } }
  select(cell: { row: number; col: number } | null) { this.selected = cell; }
  won() { if (this.game) this.game.status = "won"; }
}

/** Does the digit at (row, col) break its row, column or box? Pure: the board is not touched. */
function conflict(board: number[][], row: number, col: number): boolean {
  const n = board[row][col];
  if (!n) return false;
  for (let i = 0; i < 9; i++) {
    if (i !== col && board[row][i] === n) return true;
    if (i !== row && board[i][col] === n) return true;
  }
  const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) if ((r !== row || c !== col) && board[r][c] === n) return true;
  return false;
}
const solved = (board: number[][]) => board.every((row, r) => row.every((v, c) => v !== 0 && !conflict(board, r, c)));

// The cloth on the table is 6 mm thick; the sheet lies on top of it.
const SHEET_Y = 0.0075;
const cellAt = (row: number, col: number, tableTop: number) => new THREE.Vector3((col - 4) * CELL, tableTop + SHEET_Y + 0.0006, (row - 4) * CELL);

function SudokuView({ store, view, body, onPick, className }: { store: Store; view: View; body: BodyKind; onPick: (cell: number) => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick); const viewRef = useRef(view);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ts = new TableScene(el, {
      body, set: "tea", presets: PRESETS, view: viewRef.current,
      mat: { shape: "square", size: 0.96, texture: "cloth", color: 0x9a8f7c },
    });
    const { scene, tableTop, renderer } = ts;
    let disposed = false;
    const group = new THREE.Group();
    scene.add(group);

    // The sheet: paper with the puzzle inked on.
    const canvas = document.createElement("canvas");
    canvas.width = PX; canvas.height = PX;
    const ctx = canvas.getContext("2d")!;
    const tex = canvasTexture(canvas, renderer);
    const paperMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const loader = new THREE.TextureLoader();
    paperMat.normalMap = loader.load("/assets/tex/paper001/nor_gl.jpg");
    paperMat.roughnessMap = loader.load("/assets/tex/paper001/rough.jpg");
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(SHEET, SHEET), paperMat);
    sheet.rotation.x = -Math.PI / 2;
    sheet.rotation.z = 0.012;                                // not quite square to the table, like a real sheet
    sheet.position.y = tableTop + SHEET_Y;
    sheet.receiveShadow = true;
    group.add(sheet);
    let paper: HTMLImageElement | null = null;
    loadImage("/assets/tex/paper001/diffuse.jpg").then((im) => { if (!disposed) { paper = im; seen = -1; } }).catch((e) => console.error(e));

    const planes: THREE.Mesh[] = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = pickPlane(CELL, CELL, r * 9 + c);
      p.position.copy(cellAt(r, c, tableTop));
      group.add(p); planes.push(p);
    }
    ts.pickables = planes;

    const draw = (game: GameState) => {
      ctx.clearRect(0, 0, PX, PX);
      if (paper) ctx.drawImage(paper, 0, 0, PX, PX); else { ctx.fillStyle = "#efe8d8"; ctx.fillRect(0, 0, PX, PX); }
      const m = PX * 0.05, g = PX * 0.9, cell = g / 9;
      // Selection and its row, column and box, faint.
      const sel = store.selected;
      if (sel && game.status === "active") {
        ctx.fillStyle = "rgba(29,95,209,0.08)";
        for (let i = 0; i < 9; i++) { ctx.fillRect(m + i * cell, m + sel.row * cell, cell, cell); ctx.fillRect(m + sel.col * cell, m + i * cell, cell, cell); }
        const br = Math.floor(sel.row / 3) * 3, bc = Math.floor(sel.col / 3) * 3;
        ctx.fillRect(m + bc * cell, m + br * cell, cell * 3, cell * 3);
        ctx.fillStyle = "rgba(29,95,209,0.22)";
        ctx.fillRect(m + sel.col * cell, m + sel.row * cell, cell, cell);
      }
      // The grid.
      ctx.strokeStyle = "#2a2622"; ctx.lineCap = "square";
      for (let i = 0; i <= 9; i++) {
        ctx.lineWidth = i % 3 === 0 ? PX * 0.006 : PX * 0.0018;
        ctx.beginPath(); ctx.moveTo(m + i * cell, m); ctx.lineTo(m + i * cell, m + g); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(m, m + i * cell); ctx.lineTo(m + g, m + i * cell); ctx.stroke();
      }
      // The digits.
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        const n = game.current[r][c];
        if (!n) continue;
        const who = store.who[r]?.[c] ?? 0;
        ctx.fillStyle = conflict(game.current, r, c) ? RED : INK[who];
        ctx.font = `${who === 0 ? "600" : "500"} ${Math.round(cell * (who === 0 ? 0.62 : 0.58))}px ${who === 0 ? "ui-sans-serif, system-ui" : "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive"}`;
        ctx.fillText(String(n), m + (c + 0.5) * cell, m + (r + 0.54) * cell);
      }
      tex.needsUpdate = true;
    };

    let seen = -1;
    ts.onPick = (id) => pickRef.current(id);
    ts.onFrame = () => {
      ts.view = viewRef.current;
      if (store.game && store.version !== seen) {
        seen = store.version;
        draw(store.game);
        if (store.actor !== null) ts.reach(store.actor);
      }
    };
    (window as unknown as { __gflySudoku?: unknown }).__gflySudoku = { cell: (row: number, col: number) => ts.toScreen(cellAt(row, col, tableTop)) };

    return () => { disposed = true; tex.dispose(); ts.dispose(); };
  }, [store, body]);

  return <div ref={host} className={className} />;
}

export function SudokuTable() {
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();
  const store = useMemo(() => new Store(), []);
  const [, setTick] = useState(0);
  const [game, setGame] = useState<GameState | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [turn, setTurn] = useState(ME);                    // whose digit is next
  const [view, setView] = useState<View>("seat");
  const [brains, setBrains] = useState(false);
  const brainsApi = useRef<BrainsApi | null>(null);
  const onApi = useCallback((a: BrainsApi | null) => { brainsApi.current = a; }, []);
  const labels = useRef(new Map<number, string>());
  const timer = useRef<number | null>(null);

  const bump = useCallback((actor: number | null = null) => { store.bump(actor); setTick((t) => t + 1); }, [store]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const start = useCallback((d: Difficulty) => {
    const g = createGame(d);
    store.begin(g);
    setGame(g); setTurn(ME);
    bump();
  }, [store, bump]);

  const write = useCallback((row: number, col: number, n: number, who: number) => {
    const g = store.game;
    if (!g || g.status !== "active" || g.initial[row][col] !== 0) return false;
    store.wrote(row, col, n, who);
    if (solved(g.current)) store.won();
    bump(who === 1 ? ME : who - 1);
    return true;
  }, [store, bump]);

  // The flies take their turns after yours.
  const version = store.version;
  useEffect(() => {
    const g = store.game;
    if (!g || g.status !== "active" || turn === ME) return;
    const seat = turn;
    let cancelled = false;
    const run = async () => {
      const cands = getBestMoves(g.current, 3);
      const api = brainsApi.current;
      const next = seat === 3 ? ME : seat + 1;
      if (cands.length === 0) { setTurn(next); return; }
      if (!api?.ready(seat)) { write(cands[0].row, cands[0].col, cands[0].num, seat + 1); setTurn(next); return; }
      const code = (c: (typeof cands)[number]) => { const k = codeOf(`${c.num}@${getCandidates(g.current, c.row, c.col).length}`); labels.current.set(k, String(c.num)); return k; };
      const r = await brainChoose(api, seat, cands.map((c) => ({ item: c, code: code(c) })), "like");
      if (cancelled || store.game !== g) return;
      const chosen = r?.item ?? cands[0];
      if (r) brainTeach(api, seat, [code(chosen)], getCandidates(g.current, chosen.row, chosen.col).length === 1 ? 1 : -1);
      write(chosen.row, chosen.col, chosen.num, seat + 1);
      setTurn(next);
    };
    timer.current = window.setTimeout(() => { timer.current = null; run().catch((e) => { console.error(e); setTurn(ME); }); }, 700);
    return () => { cancelled = true; if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, turn]);

  const enter = useCallback((n: number) => {
    const g = store.game, sel = store.selected;
    if (!g || !sel || turn !== ME || g.status !== "active" || g.initial[sel.row][sel.col] !== 0) return;
    if (write(sel.row, sel.col, n, 1) && n !== 0) setTurn(1);
  }, [store, turn, write]);

  const pick = useCallback((cell: number) => {
    const g = store.game;
    if (!g || g.status !== "active") return;
    const row = Math.floor(cell / 9), col = cell % 9;
    store.select(g.initial[row][col] === 0 ? { row, col } : null);
    bump();
  }, [store, bump]);

  useEffect(() => {
    if (!game) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "9") { enter(Number(e.key)); e.preventDefault(); }
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") { enter(0); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, enter]);

  if (!game) {
    return (
      <Lobby title={lt("lobby.title")} body={lt("lobby.body")} action={lt("lobby.sit")} onStart={() => start(difficulty)}>
        <div className="seg">{(["easy", "medium", "hard"] as const).map((d) => <button key={d} aria-pressed={difficulty === d} onClick={() => setDifficulty(d)}>{lt(d)}</button>)}</div>
      </Lobby>
    );
  }

  const g = store.game!;
  const filled = g.current.flat().filter((v) => v !== 0).length;
  let conflicts = 0;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (conflict(g.current, r, c)) conflicts++;
  const names = [lt("you"), NAMES[1], NAMES[2], NAMES[3]];
  const active = g.status === "active" ? turn : null;
  const status = g.status === "won" ? lt("solved") : turn === ME ? lt("turn.you") : lt("turn.fly", { name: names[turn] });
  const sel = store.selected;
  const canWrite = turn === ME && g.status === "active" && !!sel;
  const labelOf = (c: number) => labels.current.get(c) ?? "";

  return (
    <div className="space-y-2">
      <div className={TABLE_FRAME}>
        <SudokuView store={store} view={view} body={bodyKind} onPick={pick} className="glass-inner h-full w-full" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="hud">
            <span className="t-cap">{lt(difficulty)} · {lt("filled", { n: filled })}</span>
            <span className={`t-foot num ${conflicts ? "text-red" : ""}`}>{conflicts ? lt("conflicts", { n: conflicts }) : status}</span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-1.5 pointer-events-auto">
              <div className="seg seg-sm">
                {(["seat", "top"] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{lt(v === "seat" ? "view.seat" : "view.top")}</button>)}
              </div>
              <div className="seg seg-sm"><button aria-pressed={brains} onClick={() => setBrains(!brains)} title={lt("brains.title")}>{lt("brains")}</button></div>
            </div>
            <div className="hud items-end">
              {names.map((n, s) => (
                <span key={s} className={`flex items-baseline gap-2 ${active === s ? "text-label" : "text-label-2"}`}>
                  {active === s && <span className="live-dot" />}
                  <span className="t-foot">{n}</span>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: INK[s + 1] }} />
                </span>
              ))}
            </div>
          </div>
        </div>

        {wide && <FlyBrains names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} note={lt("brain.note")} />}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div className="hud pointer-events-none max-w-[45%]">
            <span className="t-foot">{status}</span>
            <span className="t-cap">{lt("keys")}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {g.status === "won" && <button className="btn-primary text-xs" onClick={() => start(difficulty)}>{lt("new")}</button>}
            {g.status === "active" && (
              <div className="seg">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} disabled={!canWrite} className="num" onClick={() => enter(n)}>{n}</button>)}
                <button disabled={!canWrite || !sel || g.current[sel.row][sel.col] === 0} onClick={() => enter(0)}>{lt("clear")}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!wide && <FlyBrains variant="strip" names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} note={lt("brain.note")} />}
      <p className="t-foot px-1">{lt("caption")}</p>
    </div>
  );
}
