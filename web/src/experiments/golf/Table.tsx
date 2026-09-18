"use client";

/**
 * Putting on the tea table. The green is the velvet texture dyed grass
 * green inside a rim of Poly Haven wood, with wooden blocks to bank off;
 * a black cup, a little flag. Your ball is white, the fly's is yellow,
 * and they pass through each other, as markers would. A putt is rolled
 * to rest by the engine and then played back, so the fly can read its
 * lines in the same physics before it putts.
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
import { applyPutt, BALL_R, createGame, CUP_R, GREEN, HOLES, MAX_STROKES, nextHole, simulate, speedFor, type GameState, type Putt } from "./engine";
import { getBestLines } from "./bot";

const ME = 0, FLY = 2;
const SEATS = TABLE_SEATS.filter((s) => s.seat === FLY);
const GREEN_H = 0.012, RIM = 0.025, RIM_H = 0.028;

type View = "seat" | "top";
const PRESETS: Record<View, Preset> = {
  seat: { pos: [0, 0.46, 0.62], look: [0, 0.02, -0.04], fov: 52 },
  top: { pos: [0, 0.86, 0.03], look: [0, 0.02, -0.02], fov: 38 },
};

class Store {
  game: GameState | null = null;
  putt: { result: Putt; player: 0 | 1; t: number } | null = null;
  target: [number, number] | null = null;
  actor: number | null = null;
  version = 0;
  bump(actor: number | null = null) { this.actor = actor; this.version++; }
  set(game: GameState) { this.game = game; }
  play(result: Putt, player: 0 | 1, actor: number) { this.putt = { result, player, t: 0 }; this.bump(actor); }
  settle() { this.putt = null; }
  setTarget(t: [number, number] | null) { this.target = t; }
}

function GolfView({ store, view, body, onPutt, onSettled, className }: { store: Store; view: View; body: BodyKind; onPutt: () => void; onSettled: () => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const puttRef = useRef(onPutt); const settledRef = useRef(onSettled); const viewRef = useRef(view);
  useEffect(() => { puttRef.current = onPutt; }, [onPutt]);
  useEffect(() => { settledRef.current = onSettled; }, [onSettled]);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ts = new TableScene(el, {
      body, set: "tea", presets: PRESETS, view: viewRef.current, seated: [FLY],
      mat: { shape: "square", size: 0.96, texture: "velvet", color: 0x2c4a2e },
    });
    const { scene, tableTop, renderer, camera } = ts;
    const group = new THREE.Group();
    scene.add(group);
    const TOP = tableTop + 0.0075 + GREEN_H;                    // the felt's surface
    const BALL_Y = TOP + BALL_R;

    const loader = new THREE.TextureLoader();
    const vel = (f: string) => { const t = loader.load(`/assets/tex/velour_velvet/${f}`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); return t; };
    const grass = new THREE.MeshStandardMaterial({ color: 0x3f8f3c, normalMap: vel("nor_gl.jpg"), roughnessMap: vel("rough.jpg"), roughness: 1 });
    const woodMap = loader.load("/assets/tex/wood_table_001/diffuse.jpg"); woodMap.colorSpace = THREE.SRGBColorSpace;
    const wood = new THREE.MeshStandardMaterial({ map: woodMap, normalMap: loader.load("/assets/tex/wood_table_001/nor_gl.jpg"), color: 0xa87a4a, roughness: 0.55 });
    const green = new THREE.Mesh(new THREE.BoxGeometry(GREEN, GREEN_H, GREEN), grass);
    green.position.y = tableTop + 0.0075 + GREEN_H / 2; green.receiveShadow = true; group.add(green);
    for (const [x, z, w, d] of [[-(GREEN / 2 + RIM / 2), 0, RIM, GREEN + RIM * 2], [GREEN / 2 + RIM / 2, 0, RIM, GREEN + RIM * 2], [0, -(GREEN / 2 + RIM / 2), GREEN, RIM], [0, GREEN / 2 + RIM / 2, GREEN, RIM]]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w, RIM_H, d), wood);
      r.position.set(x, tableTop + 0.0075 + RIM_H / 2, z); r.castShadow = true; r.receiveShadow = true; group.add(r);
    }
    const blocks: THREE.Mesh[] = [];
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R, CUP_R, 0.01, 32), new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1 }));
    cup.position.y = TOP - 0.0045; group.add(cup);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0014, 0.13, 8), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.4 }));
    pole.position.y = 0.065;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.022), new THREE.MeshStandardMaterial({ color: 0xd3382b, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(0.018, 0.115, 0);
    const pin = new THREE.Group(); pin.add(pole, flag); pin.position.y = TOP; group.add(pin);

    const balls = [
      new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 28, 18), new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.35 })),
      new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 28, 18), new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.35 })),
    ];
    for (const b of balls) { b.castShadow = true; b.receiveShadow = true; group.add(b); }

    // Aiming: a line to where the ball should stop.
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.5 }));
    group.add(line);
    const mark = dot(0.012, 0xf0b25a, 0.7); group.add(mark);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP);
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
    const aimAt = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hit)) return;
      const h = GREEN / 2 - BALL_R;
      store.setTarget([Math.max(-h, Math.min(h, hit.x)), Math.max(-h, Math.min(h, hit.z))]);
    };
    const onMove = (e: PointerEvent) => aimAt(e.clientX, e.clientY);
    const onClick = (e: MouseEvent) => { aimAt(e.clientX, e.clientY); puttRef.current(); };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onMove);
    renderer.domElement.addEventListener("click", onClick);

    let seen = -1, shownHole = -1;
    const axis = new THREE.Vector3(), tmp = new THREE.Vector3(), prev = new THREE.Vector3(NaN, 0, NaN);
    const layoutHole = (g: GameState) => {
      const h = HOLES[g.hole];
      for (const b of blocks) { group.remove(b); b.geometry.dispose(); }
      blocks.length = 0;
      for (const b of h.blocks) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, RIM_H, b.d), wood);
        m.position.set(b.x, tableTop + 0.0075 + RIM_H / 2 + GREEN_H * 0.5, b.z); m.castShadow = true; m.receiveShadow = true;
        group.add(m); blocks.push(m);
      }
      cup.position.x = h.cup[0]; cup.position.z = h.cup[1];
      pin.position.x = h.cup[0]; pin.position.z = h.cup[1];
    };
    ts.onFrame = (dt) => {
      ts.view = viewRef.current;
      const g = store.game;
      if (!g) return;
      if (store.version !== seen) { seen = store.version; if (store.actor !== null) ts.reach(store.actor); }
      if (g.hole !== shownHole) { shownHole = g.hole; layoutHole(g); }
      const p = store.putt;
      for (let i = 0; i < 2; i++) {
        const b = balls[i];
        if (p && p.player === i) {
          p.t += dt;
          const path = p.result.path;
          const k = Math.min(path.length / 2 - 1, Math.floor(p.t * 60));
          const x = path[k * 2], z = path[k * 2 + 1];
          if (!Number.isNaN(prev.x)) {
            const dx = x - prev.x, dz = z - prev.z, d = Math.hypot(dx, dz);
            if (d > 1e-6) { axis.set(dz / d, 0, -dx / d); b.rotateOnWorldAxis(axis, d / BALL_R); }
          }
          prev.set(x, 0, z);
          const sunk = p.result.holed && k >= path.length / 2 - 1;
          b.position.set(x, sunk ? BALL_Y - 0.012 : BALL_Y, z);
          b.visible = true;
          if (p.t >= p.result.duration + 0.5) { store.settle(); prev.x = NaN; settledRef.current(); }
        } else {
          const at = g.balls[i];
          b.visible = !g.holed[i] || g.status === "active";
          tmp.set(at[0], g.holed[i] ? BALL_Y - 0.012 : BALL_Y, at[1]);
          b.position.lerp(tmp, Math.min(1, dt * 8));
        }
      }
      // The flag leans out of the way when a ball is near the cup.
      pin.rotation.z = Math.min(0.5, pin.rotation.z + (Math.hypot(balls[0].position.x - cup.position.x, balls[0].position.z - cup.position.z) < 0.06 || Math.hypot(balls[1].position.x - cup.position.x, balls[1].position.z - cup.position.z) < 0.06 ? 0.03 : -0.03));
      pin.rotation.z = Math.max(0, pin.rotation.z);
      const mine = g.status === "active" && g.turn === 0 && !p && store.target;
      line.visible = mark.visible = !!mine;
      if (mine && store.target) {
        const [bx, bz] = g.balls[0];
        const pts = lineGeo.attributes.position as THREE.BufferAttribute;
        pts.setXYZ(0, bx, BALL_Y, bz); pts.setXYZ(1, store.target[0], BALL_Y, store.target[1]); pts.needsUpdate = true;
        mark.position.set(store.target[0], TOP + 0.0008, store.target[1]);
      }
    };
    (window as unknown as { __gflyGolf?: unknown }).__gflyGolf = {
      state: () => store.game, aim: (x: number, z: number) => store.setTarget([x, z]), putt: () => puttRef.current(),
      point: (x: number, z: number) => ts.toScreen(new THREE.Vector3(x, TOP, z)),
    };

    return () => {
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      lineGeo.dispose();
      ts.dispose();
    };
  }, [store, body]);

  return <div ref={host} className={className} />;
}

export function GolfTable() {
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();
  const store = useMemo(() => new Store(), []);
  const [game, setGame] = useState<GameState | null>(null);
  const [rolling, setRolling] = useState(false);
  const [view, setView] = useState<View>("seat");
  const [brains, setBrains] = useState(false);
  const brainsApi = useRef<BrainsApi | null>(null);
  const onApi = useCallback((a: BrainsApi | null) => { brainsApi.current = a; }, []);
  const labels = useRef(new Map<number, string>());
  const timer = useRef<number | null>(null);
  const pending = useRef<{ result: Putt; player: 0 | 1; code: number | null } | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const start = useCallback(() => { const g = createGame(); store.set(g); setGame(g); store.bump(); }, [store]);

  const putt = useCallback((result: Putt, player: 0 | 1, code: number | null) => {
    const g = store.game;
    if (!g || g.status !== "active" || store.putt) return;
    pending.current = { result, player, code };
    setRolling(true);
    store.play(result, player, player === 0 ? ME : FLY);
  }, [store]);

  const puttMine = useCallback(() => {
    const g = store.game, t = store.target;
    if (!g || g.turn !== 0 || rolling || !t) return;
    const [bx, bz] = g.balls[0];
    const d = Math.hypot(t[0] - bx, t[1] - bz);
    if (d < 0.01) return;
    putt(simulate(HOLES[g.hole], [bx, bz], Math.atan2(t[0] - bx, -(t[1] - bz)), speedFor(d)), 0, null);
  }, [store, rolling, putt]);

  const settled = useCallback(() => {
    const p = pending.current, g = store.game;
    pending.current = null;
    if (!p || !g) return;
    const next = applyPutt(g, p.player, p.result);
    store.set(next); setGame(next); store.bump();
    setRolling(false);
    if (p.player === 1 && p.code !== null) {
      const before = Math.hypot(g.balls[1][0] - HOLES[g.hole].cup[0], g.balls[1][1] - HOLES[g.hole].cup[1]);
      const after = next.last?.dist ?? before;
      if (p.result.holed || after < before * 0.4) brainTeach(brainsApi.current, FLY, [p.code], 1);
      else if (after > before * 0.9) brainTeach(brainsApi.current, FLY, [p.code], -1);
    }
  }, [store]);

  // The fly's putt.
  useEffect(() => {
    if (!game || game.status !== "active" || game.turn !== 1 || rolling) return;
    let cancelled = false;
    const run = async () => {
      const cands = getBestLines(game, 1, 3);
      const code = (l: (typeof cands)[number]) => { const k = codeOf(`golf:${l.label}`); labels.current.set(k, l.label); return k; };
      const r = await brainChoose(brainsApi.current, FLY, cands.map((l) => ({ item: l, code: code(l) })), "like");
      if (cancelled) return;
      const chosen = r?.item ?? cands[0];
      // The read was exact; the stroke is not.
      putt(simulate(HOLES[game.hole], game.balls[1], chosen.angle + (Math.random() - 0.5) * 0.05, chosen.speed * (0.94 + Math.random() * 0.12)), 1, r ? code(chosen) : null);
    };
    timer.current = window.setTimeout(() => { timer.current = null; run().catch((e) => console.error(e)); }, 900);
    return () => { cancelled = true; if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  }, [game, rolling, putt]);

  if (!game) return <Lobby title={lt("lobby.title")} body={lt("lobby.body")} action={lt("lobby.sit")} onStart={start} />;

  const names = [lt("you"), NAMES[1], NAMES[2], NAMES[3]];
  const active = game.status === "active" ? (game.turn === 0 ? ME : FLY) : null;
  const hole = HOLES[game.hole];
  const status = game.status === "over"
    ? (game.totals[0] < game.totals[1] ? lt("youWin", { a: game.totals[0], b: game.totals[1] }) : game.totals[1] < game.totals[0] ? lt("flyWins", { name: NAMES[FLY], a: game.totals[0], b: game.totals[1] }) : lt("tie", { a: game.totals[0] }))
    : rolling ? lt("rolling") : game.status === "hole" ? lt("hole", { n: game.hole + 1 }) : game.turn === 0 ? lt("turn.you") : lt("turn.fly", { name: NAMES[FLY] });
  const last = game.last;
  const lastText = !last ? lt("aim")
    : last.holed ? lt("last.in")
    : game.strokes[last.player] >= MAX_STROKES ? lt("pickup", { n: MAX_STROKES })
    : last.dist < 0.05 ? lt("last.close", { n: Math.round(last.dist * 100) }) : lt("last.far", { n: Math.round(last.dist * 100) });
  const labelOf = (c: number) => labels.current.get(c) ?? "";
  const canPutt = game.status === "active" && game.turn === 0 && !rolling;

  return (
    <div className="space-y-2">
      <div className={TABLE_FRAME}>
        <GolfView store={store} view={view} body={bodyKind} onPutt={puttMine} onSettled={settled} className="glass-inner h-full w-full" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="hud">
            <span className="t-cap">{lt("hole", { n: game.hole + 1 })} · {lt("par", { n: hole.par })}</span>
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
              {([ME, FLY] as const).map((s) => {
                const p = s === ME ? 0 : 1;
                return (
                  <span key={s} className={`flex items-baseline gap-2 ${active === s ? "text-label" : "text-label-2"}`}>
                    {active === s && <span className="live-dot" />}
                    <span className="t-foot">{names[s]} · {lt("strokes", { n: game.strokes[p] })}</span>
                    <span className="t-cap">{lt("total")} {game.totals[p] + (game.status === "active" ? game.strokes[p] : 0)}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {wide && <FlyBrains names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} seats={SEATS} note={lt("brain.note")} />}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div className="hud pointer-events-none max-w-[55%]"><span className="t-foot">{lastText}</span></div>
          <div className="flex items-center gap-2">
            {game.status === "over" ? <button className="btn-primary text-xs" onClick={start}>{lt("new")}</button>
              : game.status === "hole" ? <button className="btn-primary text-xs" onClick={() => { const n = nextHole(game); store.set(n); setGame(n); store.bump(); }}>{lt("next")}</button>
              : <button className="btn-primary text-xs" disabled={!canPutt} onClick={puttMine}>{lt("putt")}</button>}
          </div>
        </div>
      </div>

      {!wide && <FlyBrains variant="strip" names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} seats={SEATS} note={lt("brain.note")} />}
      <p className="t-foot px-1">{lt("caption")}</p>
    </div>
  );
}
