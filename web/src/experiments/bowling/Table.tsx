"use client";

/**
 * Bowling in the saloon. A lane of Poly Haven wood runs down the bar
 * table with dark gutters either side, ten turned pins stand at the far
 * end, and the ball is wrapped in the red leather texture. You bowl from
 * the south side; one fly in a hat bowls from the north stool. A roll is
 * worked out to the end by the engine and then played back, pins toppling
 * on cue, so the fly can try its lines in the same physics first.
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
import { dot } from "../shared/tableAssets";
import { dict } from "./dict";
import { applyRoll, BALL_R, createGame, FOUL_Z, LANE_L, LANE_W, PIN_H, PIN_R, PINS, roll, scoreFrames, type GameState, type RollResult } from "./engine";
import { getBestLines } from "./bot";

const ME = 0, FLY = 2;
const SEATS = TABLE_SEATS.filter((s) => s.seat === FLY);
const BASE_H = 0.03;
type Hook = "left" | "straight" | "right";
const HOOK: Record<Hook, number> = { left: -0.06, straight: 0, right: 0.06 };

type View = "seat" | "top";
const PRESETS: Record<View, Preset> = {
  seat: { pos: [0, 0.52, 0.96], look: [0, 0.02, -0.08], fov: 46 },
  top: { pos: [0, 0.98, -0.02], look: [0, 0.03, -0.06], fov: 40 },
};

class Store {
  game: GameState | null = null;
  roll: { result: RollResult; t: number } | null = null;
  targetX = 0;
  hook: Hook = "straight";
  actor: number | null = null;
  version = 0;
  bump(actor: number | null = null) { this.actor = actor; this.version++; }
  set(game: GameState) { this.game = game; }
  play(result: RollResult, actor: number) { this.roll = { result, t: 0 }; this.bump(actor); }
  settle() { this.roll = null; }
  setTarget(x: number) { this.targetX = Math.max(-0.085, Math.min(0.085, x)); }
  setHook(h: Hook) { this.hook = h; }
}

export const startX = (targetX: number) => targetX * 0.35;

function BowlingView({ store, view, body, onRoll, onSettled, className }: { store: Store; view: View; body: BodyKind; onRoll: () => void; onSettled: () => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const rollRef = useRef(onRoll); const settledRef = useRef(onSettled); const viewRef = useRef(view);
  useEffect(() => { rollRef.current = onRoll; }, [onRoll]);
  useEffect(() => { settledRef.current = onSettled; }, [onSettled]);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ts = new TableScene(el, { body, set: "saloon", hat: "cowboy", presets: PRESETS, view: viewRef.current, seated: [FLY] });
    const { scene, tableTop, renderer, camera } = ts;
    const group = new THREE.Group();
    scene.add(group);
    const LANE_Y = tableTop + BASE_H;
    const BALL_Y = LANE_Y + BALL_R;

    // The lane.
    const loader = new THREE.TextureLoader();
    const tex = (f: string) => { const t = loader.load(`/assets/tex/wood_table_001/${f}`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 4); return t; };
    const laneMap = tex("diffuse.jpg"); laneMap.colorSpace = THREE.SRGBColorSpace;
    const lane = new THREE.MeshStandardMaterial({ map: laneMap, normalMap: tex("nor_gl.jpg"), roughnessMap: tex("rough.jpg"), color: 0xf0d3a0, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ map: laneMap, color: 0x3a2a1c, roughness: 0.7 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + 0.12, BASE_H, LANE_L + 0.1), dark);
    base.position.y = tableTop + BASE_H / 2; base.castShadow = true; base.receiveShadow = true; group.add(base);
    const boards = new THREE.Mesh(new THREE.BoxGeometry(LANE_W, 0.008, LANE_L + 0.06), lane);
    boards.position.y = LANE_Y - 0.004 + 0.004; boards.receiveShadow = true; group.add(boards);
    const gutterMat = new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.6, metalness: 0.2 });
    for (const sx of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, LANE_L + 0.06), gutterMat);
      g.position.set(sx * (LANE_W / 2 + 0.024), LANE_Y - 0.007, 0); group.add(g);
    }
    // The foul line and the arrows, faint.
    const foul = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, 0.004), new THREE.MeshBasicMaterial({ color: 0x2a1c12 }));
    foul.rotation.x = -Math.PI / 2; foul.position.set(0, LANE_Y + 0.0006, FOUL_Z); group.add(foul);

    // Pins: one turned profile, a pivot at each base so it can topple.
    const profile = [[0, 0], [0.55, 0], [0.95, 0.2], [1, 0.42], [0.82, 0.66], [0.5, 0.86], [0.52, 1.05], [0.6, 1.24], [0.42, 1.44], [0, 1.5]].map(([r, y]) => new THREE.Vector2(r * PIN_R, y * (PIN_H / 1.5)));
    const pinGeo = new THREE.LatheGeometry(profile, 28);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.35 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xc8202c, roughness: 0.4 });
    const pins: THREE.Group[] = [];
    for (let i = 0; i < 10; i++) {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(pinGeo, pinMat); m.castShadow = true; m.receiveShadow = true; pivot.add(m);
      for (const y of [0.9, 0.98]) { const band = new THREE.Mesh(new THREE.TorusGeometry(PIN_R * 0.53, PIN_R * 0.06, 8, 24), bandMat); band.rotation.x = Math.PI / 2; band.position.y = y * (PIN_H / 1.5); pivot.add(band); }
      pivot.position.set(PINS[i][0], LANE_Y, PINS[i][1]);
      group.add(pivot); pins.push(pivot);
    }

    // The ball.
    const leather = loader.load("/assets/tex/leather_red_02/diffuse.jpg"); leather.colorSpace = THREE.SRGBColorSpace;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), new THREE.MeshStandardMaterial({ map: leather, normalMap: loader.load("/assets/tex/leather_red_02/nor_gl.jpg"), color: 0xb03a3a, roughness: 0.25 }));
    ball.castShadow = true; ball.receiveShadow = true; ball.position.set(0, BALL_Y, FOUL_Z + 0.03); group.add(ball);

    // Aiming: a line from where the ball starts to where it should arrive.
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.5 }));
    group.add(line);
    const mark = dot(0.012, 0xf0b25a, 0.7); group.add(mark);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -LANE_Y);
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
    const aimAt = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hit)) store.setTarget(hit.x);
    };
    const onMove = (e: PointerEvent) => aimAt(e.clientX, e.clientY);
    const onClick = (e: MouseEvent) => { aimAt(e.clientX, e.clientY); rollRef.current(); };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onMove);
    renderer.domElement.addEventListener("click", onClick);

    const axis = new THREE.Vector3(), tmp = new THREE.Vector3(), prev = new THREE.Vector3(NaN, 0, NaN);
    const upright = new THREE.Quaternion(), fallQ = new THREE.Quaternion();
    let seen = -1, shown: GameState | null = null;
    const layoutPins = (g: GameState) => {
      for (let i = 0; i < 10; i++) { const p = pins[i]; p.visible = g.standing[i]; p.quaternion.copy(upright); p.position.set(PINS[i][0], LANE_Y, PINS[i][1]); }
    };
    ts.onFrame = (dt) => {
      ts.view = viewRef.current;
      const g = store.game;
      if (!g) return;
      if (store.version !== seen) { seen = store.version; if (store.actor !== null) ts.reach(store.actor); }
      const r = store.roll;
      if (r) {
        if (shown !== g) { shown = g; layoutPins(g); }
        r.t += dt;
        const path = r.result.path;
        const i = Math.min(path.length / 2 - 1, Math.floor(r.t * 60));
        const x = path[i * 2], z = path[i * 2 + 1];
        const inGutter = r.result.gutter && Math.abs(x) > LANE_W / 2;
        if (!Number.isNaN(prev.x)) {
          const dx = x - prev.x, dz = z - prev.z, d = Math.hypot(dx, dz);
          if (d > 1e-6) { axis.set(dz / d, 0, -dx / d); ball.rotateOnWorldAxis(axis, d / BALL_R); }
        }
        prev.set(x, 0, z);
        ball.position.set(x, inGutter ? BALL_Y - 0.01 : BALL_Y, z);
        for (const f of r.result.falls) {
          if (r.t < f.t) continue;
          const k = Math.min(1, (r.t - f.t) / 0.35);
          const e = 1 - (1 - k) * (1 - k);
          axis.set(f.dz, 0, -f.dx).normalize();
          pins[f.pin].quaternion.copy(fallQ.setFromAxisAngle(axis, e * Math.PI * 0.48));
          pins[f.pin].position.set(PINS[f.pin][0] + f.dx * e * 0.035, LANE_Y, PINS[f.pin][1] + f.dz * e * 0.035);
        }
        if (r.t >= r.result.duration + 0.7) { store.settle(); prev.x = NaN; settledRef.current(); }
      } else {
        if (shown !== g) { shown = g; layoutPins(g); }
        tmp.set(startX(store.targetX), BALL_Y, FOUL_Z + 0.03);
        ball.position.lerp(tmp, Math.min(1, dt * 6));
      }
      const mine = g.status === "active" && g.player === 0 && !r;
      line.visible = mark.visible = mine;
      if (mine) {
        const pts = lineGeo.attributes.position as THREE.BufferAttribute;
        pts.setXYZ(0, startX(store.targetX), BALL_Y, FOUL_Z); pts.setXYZ(1, store.targetX, BALL_Y, PINS[0][1]); pts.needsUpdate = true;
        mark.position.set(store.targetX, LANE_Y + 0.0008, PINS[0][1]);
      }
    };
    (window as unknown as { __gflyBowling?: unknown }).__gflyBowling = {
      state: () => store.game, aim: (x: number) => store.setTarget(x), hook: (h: Hook) => store.setHook(h), roll: () => rollRef.current(),
      pin: (i: number) => ts.toScreen(new THREE.Vector3(PINS[i][0], LANE_Y, PINS[i][1])),
    };

    return () => {
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      pinGeo.dispose(); lineGeo.dispose();
      ts.dispose();
    };
  }, [store, body]);

  return <div ref={host} className={className} />;
}

const mark = (f: number[], i: number, tenth: boolean) => {
  const v = f[i];
  if (v === undefined) return "";
  if (v === 10 && (i === 0 || tenth)) return "X";
  if (i > 0 && f[i - 1] !== 10 && f[i - 1] + v === 10) return "/";
  return v === 0 ? "–" : String(v);
};

export function BowlingTable() {
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();
  const store = useMemo(() => new Store(), []);
  const [game, setGame] = useState<GameState | null>(null);
  const [rolling, setRolling] = useState(false);
  const [hook, setHookState] = useState<Hook>("straight");
  const [view, setView] = useState<View>("seat");
  const [brains, setBrains] = useState(false);
  const brainsApi = useRef<BrainsApi | null>(null);
  const onApi = useCallback((a: BrainsApi | null) => { brainsApi.current = a; }, []);
  const labels = useRef(new Map<number, string>());
  const timer = useRef<number | null>(null);
  const pending = useRef<{ result: RollResult; by: number; code: number | null } | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const start = useCallback(() => { const g = createGame(); store.set(g); setGame(g); store.bump(); }, [store]);
  const setHook = useCallback((h: Hook) => { store.setHook(h); setHookState(h); }, [store]);

  const bowl = useCallback((result: RollResult, by: number, code: number | null) => {
    const g = store.game;
    if (!g || g.status !== "active" || store.roll) return;
    pending.current = { result, by, code };
    setRolling(true);
    store.play(result, by);
  }, [store]);

  const rollMine = useCallback(() => {
    const g = store.game;
    if (!g || g.player !== 0 || rolling) return;
    bowl(roll(g.standing, startX(store.targetX), store.targetX, HOOK[store.hook]), ME, null);
  }, [store, rolling, bowl]);

  const settled = useCallback(() => {
    const p = pending.current, g = store.game;
    pending.current = null;
    if (!p || !g) return;
    const next = applyRoll(g, p.result);
    store.set(next); setGame(next); store.bump();
    setRolling(false);
    if (p.by === FLY && p.code !== null && next.last) {
      const k = next.last.kind;
      if (k === "strike" || k === "spare" || next.last.pins >= 8) brainTeach(brainsApi.current, FLY, [p.code], 1);
      else if (next.last.pins < 6) brainTeach(brainsApi.current, FLY, [p.code], -1);
    }
  }, [store]);

  // The fly's ball.
  useEffect(() => {
    if (!game || game.status !== "active" || game.player !== 1 || rolling) return;
    let cancelled = false;
    const run = async () => {
      const cands = getBestLines(game, 3);
      if (cands.length === 0) return;
      const code = (l: (typeof cands)[number]) => { const k = codeOf(`bowl:${l.label}:${l.hook}`); labels.current.set(k, l.label); return k; };
      const r = await brainChoose(brainsApi.current, FLY, cands.map((l) => ({ item: l, code: code(l) })), "like");
      if (cancelled) return;
      const chosen = r?.item ?? cands[0];
      // The line was read in the simulator; the arm delivers it a little off, like anyone.
      bowl(roll(game.standing, chosen.x0, chosen.targetX + (Math.random() - 0.5) * 0.022, chosen.hook + (Math.random() - 0.5) * 0.05), FLY, r ? code(chosen) : null);
    };
    timer.current = window.setTimeout(() => { timer.current = null; run().catch((e) => console.error(e)); }, 900);
    return () => { cancelled = true; if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  }, [game, rolling, bowl]);

  if (!game) return <Lobby title={lt("lobby.title")} body={lt("lobby.body")} action={lt("lobby.sit")} onStart={start} />;

  const names = [lt("you"), NAMES[1], NAMES[2], NAMES[3]];
  const active = game.status === "active" ? (game.player === 0 ? ME : FLY) : null;
  const scores = [scoreFrames(game.frames[0]), scoreFrames(game.frames[1])];
  const totals = scores.map((s) => s.filter((v): v is number => v !== null).at(-1) ?? 0);
  const status = game.status === "over"
    ? (totals[0] > totals[1] ? lt("youWin", { a: totals[0], b: totals[1] }) : totals[1] > totals[0] ? lt("flyWins", { name: NAMES[FLY], a: totals[0], b: totals[1] }) : lt("tie", { a: totals[0] }))
    : rolling ? lt("rolling") : game.player === 0 ? lt("turn.you") : lt("turn.fly", { name: NAMES[FLY] });
  const last = game.last;
  const lastText = !last ? lt("aim") : last.kind === "strike" ? lt("last.strike") : last.kind === "spare" ? lt("last.spare") : last.kind === "gutter" ? lt("last.gutter") : lt("last.pins", { n: last.pins });
  const labelOf = (c: number) => labels.current.get(c) ?? "";
  const canRoll = game.status === "active" && game.player === 0 && !rolling;

  return (
    <div className="space-y-2">
      <div className={TABLE_FRAME}>
        <BowlingView store={store} view={view} body={bodyKind} onRoll={rollMine} onSettled={settled} className="glass-inner h-full w-full" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="hud">
            <span className="t-cap">{lt("frame", { n: Math.min(10, game.frame + 1) })}</span>
            <span className="t-foot num">{status}</span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="hud pointer-events-auto gap-1.5" style={{ flexDirection: "row" }}>
              <div className="seg seg-sm">
                {(["seat", "top"] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{lt(v === "seat" ? "view.seat" : "view.top")}</button>)}
              </div>
              <div className="seg seg-sm"><button aria-pressed={brains} onClick={() => setBrains(!brains)} title={lt("brains.title")}>{lt("brains")}</button></div>
            </div>
            <div className="hud items-end">
              {([ME, FLY] as const).map((s) => (
                <span key={s} className={`flex items-baseline gap-2 ${active === s ? "text-label" : "text-label-2"}`}>
                  {active === s && <span className="live-dot" />}
                  <span className="t-foot">{names[s]}</span>
                  <span className="num text-[15px] font-semibold">{totals[s === ME ? 0 : 1]}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {wide && <FlyBrains names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} seats={SEATS} note={lt("brain.note")} />}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div className="hud pointer-events-none max-w-[60%]">
            <span className="t-foot">{lastText}</span>
            {wide && (
              <table className="num mt-1 text-[11px] leading-tight">
                <tbody>
                  {([0, 1] as const).map((p) => (
                    <tr key={p}>
                      <td className="pr-2 text-label-2">{names[p === 0 ? ME : FLY]}</td>
                      {Array.from({ length: 10 }, (_, f) => {
                        const fr = game.frames[p][f] ?? [];
                        return <td key={f} className={`w-8 text-center ${f === game.frame && p === game.player && game.status === "active" ? "text-accent" : ""}`}>{[0, 1, 2].map((i) => mark(fr, i, f === 9)).join(" ")}<br /><span className="text-label-2">{scores[p][f] ?? ""}</span></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center gap-2">
            {game.status === "over" ? (
              <button className="btn-primary text-xs" onClick={start}>{lt("new")}</button>
            ) : (
              <>
                <div className="seg seg-sm">
                  {(["left", "straight", "right"] as const).map((h) => <button key={h} aria-pressed={hook === h} onClick={() => setHook(h)}>{lt(`hook.${h}`)}</button>)}
                </div>
                <button className="btn-primary text-xs" disabled={!canRoll} onClick={rollMine}>{lt("roll")}</button>
              </>
            )}
          </div>
        </div>
      </div>

      {!wide && <FlyBrains variant="strip" names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} seats={SEATS} note={lt("brain.note")} />}
      <p className="t-foot px-1">{lt("caption")}</p>
    </div>
  );
}
