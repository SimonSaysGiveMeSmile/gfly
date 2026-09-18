"use client";

/**
 * Tennis on the tea table. The court is the velvet texture dyed clay
 * with its lines painted in a canvas, a net of dark gauze across the
 * middle, and a yellow ball that flies in an arc from one runner to the
 * spot the hitter chose. You are the runner on the near baseline; one fly
 * on the north stool is the other. Each shot is decided by the engine and
 * then flown, so the fly can weigh its shots before it hits.
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
import { canvasTexture, dot, loadImage, ring } from "../shared/tableAssets";
import { dict } from "./dict";
import { callOf, CL, createGame, CW, hit, SERVICE, type Flight, type GameState, type HitResult, type Pace, type Pt } from "./engine";
import { getBestShots } from "./bot";

const ME = 0, FLY = 2;
const SEATS = TABLE_SEATS.filter((s) => s.seat === FLY);
const BALL_R = 0.009, NET_H = 0.036, PX = 1024;

type View = "seat" | "top";
const PRESETS: Record<View, Preset> = {
  seat: { pos: [0, 0.48, 0.74], look: [0, 0.02, -0.06], fov: 50 },
  top: { pos: [0, 0.92, 0.02], look: [0, 0.02, -0.02], fov: 40 },
};

class Store {
  game: GameState | null = null;
  flight: { flight: Flight; t: number } | null = null;
  target: Pt | null = null;
  pace: Pace = "firm";
  actor: number | null = null;
  version = 0;
  bump(actor: number | null = null) { this.actor = actor; this.version++; }
  set(game: GameState) { this.game = game; }
  fly(flight: Flight, actor: number) { this.flight = { flight, t: 0 }; this.bump(actor); }
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
    const ts = new TableScene(el, {
      body, set: "tea", presets: PRESETS, view: viewRef.current, seated: [FLY],
      mat: { shape: "square", size: 0.98, texture: "velvet", color: 0x8a4a34 },
    });
    const { scene, tableTop, renderer, camera } = ts;
    const group = new THREE.Group();
    scene.add(group);
    const TOP = tableTop + 0.0075;

    // The court, painted on the clay.
    const canvas = document.createElement("canvas");
    canvas.width = PX / 2; canvas.height = PX;
    const ctx = canvas.getContext("2d")!;
    const tex = canvasTexture(canvas, renderer);
    const paint = (velvet: HTMLImageElement | null) => {
      const w = canvas.width, h = canvas.height;
      if (velvet) { ctx.drawImage(velvet, 0, 0, w, h); ctx.fillStyle = "rgba(196,96,58,0.86)"; } else ctx.fillStyle = "#b8623a";
      ctx.fillRect(0, 0, w, h);
      // Court metres to pixels: the canvas covers CW + 0.12 across and CL + 0.12 along.
      const sx = w / (CW + 0.12), sz = h / (CL + 0.12);
      const X = (x: number) => (x + CW / 2 + 0.06) * sx, Z = (z: number) => (z + CL / 2 + 0.06) * sz;
      ctx.strokeStyle = "#f4efe6"; ctx.lineWidth = w * 0.012; ctx.lineCap = "butt";
      ctx.strokeRect(X(-CW / 2), Z(-CL / 2), CW * sx, CL * sz);
      for (const z of [-SERVICE, SERVICE]) { ctx.beginPath(); ctx.moveTo(X(-CW / 2), Z(z)); ctx.lineTo(X(CW / 2), Z(z)); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(X(0), Z(-SERVICE)); ctx.lineTo(X(0), Z(SERVICE)); ctx.stroke();
      for (const z of [-CL / 2, CL / 2]) { ctx.beginPath(); ctx.moveTo(X(0), Z(z)); ctx.lineTo(X(0), Z(z - Math.sign(z) * 0.02)); ctx.stroke(); }
      tex.needsUpdate = true;
    };
    paint(null);
    loadImage("/assets/tex/velour_velvet/diffuse.jpg").then((im) => paint(im)).catch((e) => console.error(e));
    const court = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.12, CL + 0.12), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    court.rotation.x = -Math.PI / 2; court.position.y = TOP + 0.0006; court.receiveShadow = true; group.add(court);

    // The net: posts, a band of gauze, the tape.
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.5, metalness: 0.3 });
    for (const x of [-(CW / 2 + 0.03), CW / 2 + 0.03]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, NET_H + 0.004, 10), postMat);
      p.position.set(x, TOP + (NET_H + 0.004) / 2, 0); p.castShadow = true; group.add(p);
    }
    const gauze = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.06, NET_H), new THREE.MeshStandardMaterial({ color: 0x1c1a18, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1 }));
    gauze.position.set(0, TOP + NET_H / 2, 0); group.add(gauze);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(CW + 0.06, 0.004, 0.002), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.8 }));
    tape.position.set(0, TOP + NET_H, 0); tape.castShadow = true; group.add(tape);

    // The ball and the runners' marks.
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ color: 0xd9e64a, roughness: 0.7 }));
    ball.castShadow = true; group.add(ball);
    const shadow = dot(BALL_R * 0.9, 0x000000, 0.35); group.add(shadow);
    const marks = [ring(0.02, 0x4d8dff, 0.85), ring(0.02, 0xf0b25a, 0.85)];
    for (const m of marks) { m.position.y = TOP + 0.001; group.add(m); }
    const aim = dot(0.011, 0xfff1d6, 0.7); group.add(aim);

    // Pointing at the far half.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP);
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hitP = new THREE.Vector3();
    const aimAt = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, hitP)) return;
      store.setTarget({ x: Math.max(-CW / 2 - 0.05, Math.min(CW / 2 + 0.05, hitP.x)), z: Math.max(-CL / 2 - 0.05, Math.min(-0.02, hitP.z)) });
    };
    const onMove = (e: PointerEvent) => aimAt(e.clientX, e.clientY);
    const onClick = (e: MouseEvent) => { aimAt(e.clientX, e.clientY); hitRef.current(); };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onMove);
    renderer.domElement.addEventListener("click", onClick);

    let seen = -1;
    const tmp = new THREE.Vector3();
    ts.onFrame = (dt) => {
      ts.view = viewRef.current;
      const g = store.game;
      if (!g) return;
      if (store.version !== seen) { seen = store.version; if (store.actor !== null) ts.reach(store.actor); }
      for (let i = 0; i < 2; i++) { const r = g.runners[i]; tmp.set(r.x, TOP + 0.001, r.z); marks[i].position.lerp(tmp, Math.min(1, dt * 6)); }
      const f = store.flight;
      if (f) {
        f.t += dt;
        const { from, to, time } = f.flight;
        const k = Math.min(1, f.t / time);
        const x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
        const apex = 0.05 + time * 0.06;
        const y = TOP + 0.03 * (1 - k) + apex * 4 * k * (1 - k) + BALL_R;
        ball.position.set(x, y, z);
        shadow.position.set(x, TOP + 0.0012, z);
        if (f.t >= time + 0.25) { store.land(); landedRef.current(); }
      } else {
        const b = g.ball;
        tmp.set(b.x, TOP + BALL_R, b.z);
        ball.position.lerp(tmp, Math.min(1, dt * 8));
        shadow.position.set(ball.position.x, TOP + 0.0012, ball.position.z);
      }
      const mine = g.status === "active" && g.turn === 0 && !f && store.target;
      aim.visible = !!mine;
      if (mine && store.target) aim.position.set(store.target.x, TOP + 0.0014, store.target.z);
    };
    (window as unknown as { __gflyTennis?: unknown }).__gflyTennis = {
      state: () => store.game, aim: (x: number, z: number) => store.setTarget({ x, z }), pace: (p: Pace) => store.setPace(p), hit: () => hitRef.current(),
      point: (x: number, z: number) => ts.toScreen(new THREE.Vector3(x, TOP, z)),
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
    store.fly(result.flight, by === 0 ? ME : FLY);
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

  // The fly's shot.
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
    timer.current = window.setTimeout(() => { timer.current = null; run().catch((e) => console.error(e)); }, 700);
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
