"use client";

/**
 * Tennis in the garden. A hard court painted in a canvas lies on the lawn
 * with a net of dark gauze; you stand on the near baseline and the camera
 * is your eyes, one fly stands on the far one and runs for the ball. The
 * engine flies every ball under gravity before it is drawn, so the fly can
 * weigh its shots in the same physics before it hits.
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
import { canvasTexture, dot } from "../shared/tableAssets";
import { dict } from "./dict";
import { BALL_R, callOf, CL, createGame, CW, CW2, hit, homeZ, NET_H, SERVICE, serveBox, type Flight, type GameState, type HitResult, type Pace, type Pt } from "./engine";
import { getBestShots } from "./bot";

const ME = 0, FLY = 2;
const SEATS = TABLE_SEATS.filter((s) => s.seat === FLY);
const ORIGIN = new THREE.Vector3();

type View = "seat" | "top";
const PRESETS: Record<View, Preset> = {
  seat: { pos: [0, 0.21, 0.3], look: [0, 0.03, -1.6], fov: 58 },
  top: { pos: [0, 3.2, 1.2], look: [0, 0, -0.1], fov: 50 },
};

class Store {
  game: GameState | null = null;
  flight: { flight: Flight; t: number; by: 0 | 1 } | null = null;
  target: Pt | null = null;
  pace: Pace = "firm";
  actor: number | null = null;
  version = 0;
  bump(actor: number | null = null) { this.actor = actor; this.version++; }
  set(game: GameState) { this.game = game; }
  fly(flight: Flight, by: 0 | 1) { this.flight = { flight, t: 0, by }; this.bump(by === 0 ? ME : FLY); }
  land() { this.flight = null; }
  setTarget(t: Pt | null) { this.target = t; }
  setPace(p: Pace) { this.pace = p; }
}

function TennisView({ store, view, body, onHit, onLanded, className }: { store: Store; view: View; body: BodyKind; onHit: () => void; onLanded: () => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const hitRef = useRef(onHit); const landedRef = useRef(onLanded); const viewRef = useRef(view);
  useEffect(() => { hitRef.current = onHit; }, [onHit]);
  useEffect(() => { landedRef.current = onLanded; }, [onLanded]);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ts = new FieldScene(el, { body, presets: PRESETS, view: viewRef.current, creature: { pos: [0, 0, homeZ(1)], yaw: Math.PI } });
    const { scene, renderer, camera } = ts;
    const group = new THREE.Group();
    scene.add(group);

    // The court: an acrylic hard court with its lines, painted in a canvas.
    const PW = 1024, PH = 2048;
    const canvas = document.createElement("canvas");
    canvas.width = PW; canvas.height = PH;
    const ctx = canvas.getContext("2d")!;
    const MW = CW2 + 0.9, ML = CL + 1.4;                       // the painted slab, with run-off
    const sx = PW / MW, sz = PH / ML;
    const X = (x: number) => (x + MW / 2) * sx, Z = (z: number) => (z + ML / 2) * sz;
    ctx.fillStyle = "#2f6f4a"; ctx.fillRect(0, 0, PW, PH);            // run-off
    ctx.fillStyle = "#2a5aa6"; ctx.fillRect(X(-CW2 / 2), Z(-CL / 2), CW2 * sx, CL * sz);   // the court
    ctx.strokeStyle = "#f4f4f0"; ctx.lineWidth = 0.05 * sx; ctx.lineCap = "butt";
    ctx.strokeRect(X(-CW2 / 2), Z(-CL / 2), CW2 * sx, CL * sz);
    for (const x of [-CW / 2, CW / 2]) { ctx.beginPath(); ctx.moveTo(X(x), Z(-CL / 2)); ctx.lineTo(X(x), Z(CL / 2)); ctx.stroke(); }
    for (const z of [-SERVICE, SERVICE]) { ctx.beginPath(); ctx.moveTo(X(-CW / 2), Z(z)); ctx.lineTo(X(CW / 2), Z(z)); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(X(0), Z(-SERVICE)); ctx.lineTo(X(0), Z(SERVICE)); ctx.stroke();
    for (const z of [-CL / 2, CL / 2]) { ctx.beginPath(); ctx.moveTo(X(0), Z(z)); ctx.lineTo(X(0), Z(z - Math.sign(z) * 0.06)); ctx.stroke(); }
    const tex = canvasTexture(canvas, renderer);
    const court = new THREE.Mesh(new THREE.PlaneGeometry(MW, ML), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    court.rotation.x = -Math.PI / 2; court.position.y = 0.002; court.receiveShadow = true; group.add(court);

    // The net.
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.4 });
    for (const x of [-(CW2 / 2 + 0.11), CW2 / 2 + 0.11]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, NET_H + 0.02, 12), postMat);
      p.position.set(x, (NET_H + 0.02) / 2, 0); p.castShadow = true; group.add(p);
    }
    const gauze = new THREE.Mesh(new THREE.PlaneGeometry(CW2 + 0.22, NET_H), new THREE.MeshStandardMaterial({ color: 0x141414, transparent: true, opacity: 0.6, side: THREE.DoubleSide, roughness: 1 }));
    gauze.position.set(0, NET_H / 2, 0); gauze.castShadow = true; group.add(gauze);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(CW2 + 0.22, 0.012, 0.006), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8 }));
    tape.position.set(0, NET_H, 0); group.add(tape);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.012, NET_H, 0.004), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.8 }));
    strap.position.set(0, NET_H / 2, 0); group.add(strap);

    // The ball, its shadow, the aim mark.
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshStandardMaterial({ color: 0xdfe84a, roughness: 0.75 }));
    ball.castShadow = true; group.add(ball);
    const shadow = dot(BALL_R * 1.1, 0x000000, 0.4); group.add(shadow);
    const aim = dot(0.03, 0xfff1d6, 0.7); group.add(aim);
    const box = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.1, depthWrite: false }));
    box.rotation.x = -Math.PI / 2; box.position.y = 0.004; group.add(box);

    // Pointing at the far half.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hitP = new THREE.Vector3();
    const aimAt = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hitP)) return;
      store.setTarget({ x: Math.max(-CW2 / 2 - 0.3, Math.min(CW2 / 2 + 0.3, hitP.x)), z: Math.max(-CL / 2 - 0.4, Math.min(-0.05, hitP.z)) });
    };
    const onMove = (e: PointerEvent) => aimAt(e.clientX, e.clientY);
    const onClick = (e: MouseEvent) => { aimAt(e.clientX, e.clientY); hitRef.current(); };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onMove);
    renderer.domElement.addEventListener("click", onClick);

    let seen = -1, sentFor: GameState | null = null, reached = false;
    const you = new THREE.Vector3(), tmp = new THREE.Vector3();
    ts.onFrame = (dt) => {
      ts.view = viewRef.current;
      const g = store.game;
      if (!g) return;
      if (store.version !== seen) { seen = store.version; }
      const f = store.flight;
      // The fly runs to where the state says it plays from; during a flight that is the meeting point.
      if (sentFor !== g) { sentFor = g; ts.send(g.runners[1].x, g.runners[1].z, Math.PI); reached = false; if (store.actor === FLY) ts.reach(); }
      if (f) {
        f.t += dt;
        const { path, meet } = f.flight;
        const n = path.length / 3;
        const i = Math.min(n - 1, Math.floor(f.t * 60));
        ball.position.set(path[i * 3], path[i * 3 + 1], path[i * 3 + 2]);
        shadow.position.set(path[i * 3], 0.003, path[i * 3 + 2]);
        if (meet >= 0 && i >= meet - 6 && !reached) { reached = true; if (f.by === 0) ts.reach(); }
        if (f.t >= (n - 1) / 60 + 0.15) { store.land(); landedRef.current(); }
      } else {
        const b = g.ballAt;
        tmp.set(b.x, b.y, b.z);
        ball.position.lerp(tmp, Math.min(1, dt * 8));
        shadow.position.set(ball.position.x, 0.003, ball.position.z);
      }
      // You are the camera: at your runner's spot on the baseline, looking down the court.
      you.set(g.runners[0].x, 0, g.runners[0].z + 0.02);
      ts.place(viewRef.current === "top" ? ORIGIN : you, 0);
      const mine = g.status === "active" && g.turn === 0 && !f && store.target;
      aim.visible = !!mine;
      if (mine && store.target) aim.position.set(store.target.x, 0.005, store.target.z);
      box.visible = g.status === "active" && g.serving && g.turn === 0 && !f;
      if (box.visible) { const bx = serveBox(g); box.scale.set(bx.x1 - bx.x0, bx.z1 - bx.z0, 1); box.position.set((bx.x0 + bx.x1) / 2, 0.004, (bx.z0 + bx.z1) / 2); }
    };
    (window as unknown as { __gflyTennis?: unknown }).__gflyTennis = {
      state: () => store.game, aim: (x: number, z: number) => store.setTarget({ x, z }), pace: (p: Pace) => store.setPace(p), hit: () => hitRef.current(),
      point: (x: number, z: number) => ts.toScreen(new THREE.Vector3(x, 0, z)),
    };

    return () => {
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      tex.dispose();
      ts.dispose();
    };
  }, [store, body]);

  return <div ref={host} className={className} />;
}

export function TennisTable() {
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();
  const store = useMemo(() => new Store(), []);
  const [game, setGame] = useState<GameState | null>(null);
  const [flying, setFlying] = useState(false);
  const [pace, setPaceState] = useState<Pace>("firm");
  const [view, setView] = useState<View>("seat");
  const [brains, setBrains] = useState(false);
  const brainsApi = useRef<BrainsApi | null>(null);
  const onApi = useCallback((a: BrainsApi | null) => { brainsApi.current = a; }, []);
  const labels = useRef(new Map<number, string>());
  const timer = useRef<number | null>(null);
  const pending = useRef<{ result: HitResult; by: 0 | 1; code: number | null } | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const start = useCallback(() => { const g = createGame(); store.set(g); setGame(g); store.bump(); }, [store]);
  const setPace = useCallback((p: Pace) => { store.setPace(p); setPaceState(p); }, [store]);

  const strike = useCallback((target: Pt, p: Pace, by: 0 | 1, code: number | null) => {
    const g = store.game;
    if (!g || g.status !== "active" || g.turn !== by || store.flight) return;
    const result = hit(g, target, p);
    pending.current = { result, by, code };
    setFlying(true);
    // The runners move as soon as the ball is struck, so the fly runs during the flight.
    store.set({ ...g, runners: result.state.runners, rally: result.state.rally });
    store.fly(result.flight, by);
  }, [store]);

  const hitMine = useCallback(() => {
    const g = store.game, t = store.target;
    if (!g || g.turn !== 0 || flying || !t) return;
    strike(t, store.pace, 0, null);
  }, [store, flying, strike]);

  const landed = useCallback(() => {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    const next = p.result.state;
    store.set(next); setGame(next); store.bump();
    setFlying(false);
    if (p.by === 1 && p.code !== null) {
      const o = p.result.outcome;
      if (o === "winner") brainTeach(brainsApi.current, FLY, [p.code], 1);
      else if (o === "out" || o === "net" || o === "double") brainTeach(brainsApi.current, FLY, [p.code], -1);
    }
  }, [store]);

  useEffect(() => {
    if (!game || game.status !== "active" || game.turn !== 1 || flying) return;
    let cancelled = false;
    const run = async () => {
      const cands = getBestShots(game, 1, 3);
      const code = (s: (typeof cands)[number]) => { const k = codeOf(`tennis:${s.label}:${s.pace}`); labels.current.set(k, s.label); return k; };
      const r = await brainChoose(brainsApi.current, FLY, cands.map((s) => ({ item: s, code: code(s) })), "like");
      if (cancelled) return;
      const chosen = r?.item ?? cands[0];
      strike(chosen.target, chosen.pace, 1, r ? code(chosen) : null);
    };
    timer.current = window.setTimeout(() => { timer.current = null; run().catch((e) => console.error(e)); }, 650);
    return () => { cancelled = true; if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  }, [game, flying, strike]);

  if (!game) return <Lobby title={lt("lobby.title")} body={lt("lobby.body")} action={lt("lobby.sit")} onStart={start} />;

  const names = [lt("you"), NAMES[1], NAMES[2], NAMES[3]];
  const active = game.status === "active" ? (game.turn === 0 ? ME : FLY) : null;
  const status = game.status === "over"
    ? (game.games[0] > game.games[1] ? lt("youWin", { a: game.games[0], b: game.games[1] }) : lt("flyWins", { name: NAMES[FLY], a: game.games[0], b: game.games[1] }))
    : flying ? lt("flying") : game.turn === 0 ? (game.serving ? (game.secondServe ? lt("second") : lt("serve")) : lt("turn.you")) : lt("turn.fly", { name: NAMES[FLY] });
  const lastKey = ({ winner: "last.winner", out: "last.out", net: "last.net", fault: "last.fault", double: "last.double", point: "last.point" } as const)[game.last as "winner" | "out" | "net" | "fault" | "double" | "point"];
  const lastText = lastKey && game.last !== "in" && game.last !== "none" ? lt(lastKey) : game.serving && game.turn === 0 ? lt("aim.serve") : lt("aim");
  const labelOf = (c: number) => labels.current.get(c) ?? "";
  const canHit = game.status === "active" && game.turn === 0 && !flying;

  return (
    <div className="space-y-2">
      <div className={TABLE_FRAME}>
        <TennisView store={store} view={view} body={bodyKind} onHit={hitMine} onLanded={landed} className="glass-inner h-full w-full" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="hud">
            <span className="t-cap">{lt("games", { a: game.games[0], b: game.games[1] })}</span>
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
                    <span className="t-foot">{names[s]}{game.server === p ? " ·" : ""}</span>
                    <span className="num text-[15px] font-semibold">{callOf(game.points, p)}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {wide && <FlyBrains names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} seats={SEATS} note={lt("brain.note")} />}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div className="hud pointer-events-none max-w-[50%]"><span className="t-foot">{lastText}</span></div>
          <div className="flex items-center gap-2">
            {game.status === "over" ? <button className="btn-primary text-xs" onClick={start}>{lt("new")}</button> : (
              <>
                <div className="seg seg-sm">
                  {(["soft", "firm", "hard"] as const).map((p) => <button key={p} aria-pressed={pace === p} onClick={() => setPace(p)}>{lt(`pace.${p}`)}</button>)}
                </div>
                <button className="btn-primary text-xs" disabled={!canHit} onClick={hitMine}>{lt("hit")}</button>
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
