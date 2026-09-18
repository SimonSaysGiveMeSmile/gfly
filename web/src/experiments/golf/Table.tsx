"use client";

/**
 * Putting in the garden. The green is a height field of short grass with
 * a darker fringe, a cup and a flag; your ball is white, the fly's is
 * yellow, and they pass through each other as marked balls would. The
 * camera stands behind your ball looking at the cup; the fly stands by its
 * own ball and walks up to putt. A putt is rolled to rest by the engine
 * and then played back, so the fly can read its lines in the same physics.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { FieldScene } from "@/lib/three/fieldScene";
import type { Preset } from "@/lib/three/tableScene";
import type { BodyKind } from "@/lib/three/body";
import { useLocalT } from "@/lib/i18n";
import { useMedia } from "@/lib/useMedia";
import { useBodyKind } from "@/lib/sim/body";
import { FlyBrains, TABLE_SEATS, type BrainsApi } from "../shared/FlyBrains";
import { brainChoose, brainTeach, codeOf } from "../shared/brainPlay";
import { Lobby, NAMES, TABLE_FRAME } from "../shared/Lobby";
import { dot } from "../shared/tableAssets";
import { dict } from "./dict";
import { applyPutt, BALL_R, createGame, CUP_R, FRINGE_R, GREEN_R, height, HOLES, MAX_STROKES, nextHole, simulate, speedFor, type GameState, type Hole, type Putt } from "./engine";
import { getBestLines } from "./bot";

const ME = 0, FLY = 2;
const SEATS = TABLE_SEATS.filter((s) => s.seat === FLY);
const ORIGIN = new THREE.Vector3();

type View = "seat" | "top";
const PRESETS: Record<View, Preset> = {
  seat: { pos: [0, 0.2, 0.34], look: [0, 0.0, -0.7], fov: 55 },
  top: { pos: [0, 3.4, 1.0], look: [0, 0, -0.1], fov: 50 },
};

class Store {
  game: GameState | null = null;
  putt: { result: Putt; player: 0 | 1; t: number } | null = null;
  target: [number, number] | null = null;
  actor: number | null = null;
  version = 0;
  bump(actor: number | null = null) { this.actor = actor; this.version++; }
  set(game: GameState) { this.game = game; }
  play(result: Putt, player: 0 | 1) { this.putt = { result, player, t: 0 }; this.bump(player === 0 ? ME : FLY); }
  settle() { this.putt = null; }
  setTarget(t: [number, number] | null) { this.target = t; }
}

const yawToward = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(-(tx - fx), -(tz - fz));

function GolfView({ store, view, body, onPutt, onSettled, className }: { store: Store; view: View; body: BodyKind; onPutt: () => void; onSettled: () => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const puttRef = useRef(onPutt); const settledRef = useRef(onSettled); const viewRef = useRef(view);
  useEffect(() => { puttRef.current = onPutt; }, [onPutt]);
  useEffect(() => { settledRef.current = onSettled; }, [onSettled]);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const t0 = HOLES[0].tee;
    const ts = new FieldScene(el, { body, presets: PRESETS, view: viewRef.current, creature: { pos: [t0[0] + 0.15, 0, t0[1] + 0.05], yaw: 0 } });
    const { scene, renderer, camera } = ts;
    const group = new THREE.Group();
    scene.add(group);

    // The green: a height field coloured by radius, short grass in, fringe, then the lawn.
    const SIZE = 5.6, SEG = 140;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const loader = new THREE.TextureLoader();
    const vel = (f: string) => { const t = loader.load(`/assets/tex/velour_velvet/${f}`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); return t; };
    const green = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, normalMap: vel("nor_gl.jpg"), normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: vel("rough.jpg"), roughness: 1 }));
    green.receiveShadow = true; green.position.y = 0.001; group.add(green);
    const cIn = new THREE.Color(0x5aa346), cFr = new THREE.Color(0x3f7d30), cOut = new THREE.Color(0x4f8a3a);
    const shape = (h: Hole) => {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const r = Math.hypot(x, z);
        pos.setY(i, r < FRINGE_R + 0.4 ? height(h, x, z) * Math.max(0, Math.min(1, (FRINGE_R + 0.4 - r) / 0.4)) : 0);
        const c = r < GREEN_R ? cIn : r < FRINGE_R ? cFr : cOut;
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      pos.needsUpdate = true; (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      geo.computeVertexNormals();
    };

    // Cup and flag.
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(CUP_R, CUP_R, 0.02, 32), new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1 }));
    group.add(cup);
    const rim = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 0.003, 32), new THREE.MeshBasicMaterial({ color: 0xf4f4f0, side: THREE.DoubleSide }));
    rim.rotation.x = -Math.PI / 2; group.add(rim);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.28, 8), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.4 }));
    pole.position.y = 0.14;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.045), new THREE.MeshStandardMaterial({ color: 0xd3382b, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(0.035, 0.255, 0);
    const pin = new THREE.Group(); pin.add(pole, flag); group.add(pin);

    const balls = [
      new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.35 })),
      new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.35 })),
    ];
    for (const b of balls) { b.castShadow = true; b.receiveShadow = true; group.add(b); }

    // Aiming: a line on the grass to where the ball would stop on the flat.
    const N = 24;
    const lineGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: N }, () => new THREE.Vector3()));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.6 }));
    group.add(line);
    const mark = dot(0.016, 0xf0b25a, 0.8); group.add(mark);
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const aimAt = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(green)[0];
      if (!hit) return;
      store.setTarget([hit.point.x, hit.point.z]);
    };
    const onMove = (e: PointerEvent) => aimAt(e.clientX, e.clientY);
    const onClick = (e: MouseEvent) => { aimAt(e.clientX, e.clientY); puttRef.current(); };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onMove);
    renderer.domElement.addEventListener("click", onClick);

    let seen = -1, shownHole = -1, sentFor: GameState | null = null;
    const axis = new THREE.Vector3(), tmp = new THREE.Vector3(), prev = new THREE.Vector3(NaN, 0, NaN), stand = new THREE.Vector3();
    const layoutHole = (g: GameState) => {
      const h = HOLES[g.hole];
      shape(h);
      const cy = height(h, h.cup[0], h.cup[1]);
      cup.position.set(h.cup[0], cy - 0.009, h.cup[1]);
      rim.position.set(h.cup[0], cy + 0.0015, h.cup[1]);
      pin.position.set(h.cup[0], cy, h.cup[1]);
      ts.lightAt((h.cup[0] + h.tee[0]) / 2, (h.cup[1] + h.tee[1]) / 2);
    };
    const yOf = (g: GameState, x: number, z: number) => height(HOLES[g.hole], x, z);
    ts.onFrame = (dt) => {
      ts.view = viewRef.current;
      const g = store.game;
      if (!g) return;
      if (store.version !== seen) { seen = store.version; }
      if (g.hole !== shownHole) { shownHole = g.hole; layoutHole(g); }
      const h = HOLES[g.hole];
      const p = store.putt;
      // The fly stands by its ball, off the line, and steps to it for its putt.
      if (sentFor !== g || (p && p.player === 1 && p.t === 0)) {
        sentFor = g;
        const [fx, fz] = g.balls[1];
        const toCup = yawToward(fx, fz, h.cup[0], h.cup[1]);
        // Beside its ball to putt; otherwise well off to the side, out of your line.
        if (g.status === "active" && g.turn === 1 && !g.holed[1]) { ts.send(fx + 0.09 * Math.cos(toCup), fz - 0.09 * Math.sin(toCup), toCup + Math.PI / 2); }
        else { ts.send(fx + 0.6 * Math.cos(toCup) - 0.25 * Math.sin(toCup), fz - 0.6 * Math.sin(toCup) - 0.25 * Math.cos(toCup), toCup); }
      }
      if (p && p.player === 1 && p.t === 0) ts.reach();
      for (let i = 0; i < 2; i++) {
        const b = balls[i];
        if (p && p.player === i) {
          p.t += dt;
          const path = p.result.path;
          const k = Math.min(path.length / 2 - 1, Math.floor(p.t * 60));
          const x = path[k * 2], z = path[k * 2 + 1];
          if (!Number.isNaN(prev.x)) { const dx = x - prev.x, dz = z - prev.z, d = Math.hypot(dx, dz); if (d > 1e-6) { axis.set(dz / d, 0, -dx / d); b.rotateOnWorldAxis(axis, d / BALL_R); } }
          prev.set(x, 0, z);
          const sunk = p.result.holed && k >= path.length / 2 - 1;
          b.position.set(x, yOf(g, x, z) + (sunk ? -0.012 : BALL_R), z);
          b.visible = true;
          if (p.t >= p.result.duration + 0.5) { store.settle(); prev.x = NaN; settledRef.current(); }
        } else {
          const at = g.balls[i];
          b.visible = !g.holed[i] || g.status === "active";
          tmp.set(at[0], yOf(g, at[0], at[1]) + (g.holed[i] ? -0.012 : BALL_R), at[1]);
          b.position.lerp(tmp, Math.min(1, dt * 8));
        }
      }
      // You stand behind your ball, looking at the cup.
      const [bx, bz] = g.balls[0];
      if (viewRef.current === "top") ts.place(ORIGIN, 0);
      else { stand.set(bx, yOf(g, bx, bz), bz); ts.place(stand, yawToward(bx, bz, h.cup[0], h.cup[1])); }
      const mine = g.status === "active" && g.turn === 0 && !p && store.target;
      line.visible = mark.visible = !!mine;
      if (mine && store.target) {
        const [tx, tz] = store.target;
        const pts = lineGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < N; i++) { const u = i / (N - 1), x = bx + (tx - bx) * u, z = bz + (tz - bz) * u; pts.setXYZ(i, x, yOf(g, x, z) + 0.004, z); }
        pts.needsUpdate = true;
        mark.position.set(tx, yOf(g, tx, tz) + 0.004, tz);
      }
    };
    (window as unknown as { __gflyGolf?: unknown }).__gflyGolf = {
      state: () => store.game, aim: (x: number, z: number) => store.setTarget([x, z]), putt: () => puttRef.current(),
      point: (x: number, z: number) => { const g = store.game; return ts.toScreen(new THREE.Vector3(x, g ? height(HOLES[g.hole], x, z) : 0, z)); },
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
    store.play(result, player);
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
      putt(simulate(HOLES[game.hole], game.balls[1], chosen.angle + (Math.random() - 0.5) * 0.04, chosen.speed * (0.95 + Math.random() * 0.1)), 1, r ? code(chosen) : null);
    };
    timer.current = window.setTimeout(() => { timer.current = null; run().catch((e) => console.error(e)); }, 1500);
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
            <div className="hud pointer-events-auto gap-1.5" style={{ flexDirection: "row" }}>
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
