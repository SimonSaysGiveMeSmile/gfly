"use client";

/**
 * Eight-ball in the saloon. A small table sits on the round bar table:
 * a slab of Poly Haven wood for the rails, the velvet texture dyed green
 * for the felt, black mouths for the pockets, and sixteen balls whose
 * numbers are painted in a canvas. You shoot from the south side; one fly
 * in a hat shoots from the north stool. Every shot is simulated to rest
 * first, then played back, so the fly can try its shots in the same
 * physics before it takes one.
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
import { canvasTexture, ring } from "../shared/tableAssets";
import { dict } from "./dict";
import { createGame, groupOf, L, POCKET_R, POCKETS, R, resolve, simulate, W, type GameState, type ShotResult } from "./engine";
import { getBestShots } from "./bot";

const ME = 0, FLY = 2;
const SEATS = TABLE_SEATS.filter((s) => s.seat === FLY);
const RAIL = 0.03, BASE_H = 0.034, FELT_H = 0.012;
const COLORS = ["#f6f2e8", "#f2c200", "#1f4fd1", "#d3261e", "#5f2c9e", "#f07f14", "#1e8b3a", "#7a1e2e", "#111111"];
const colorOf = (id: number) => (id === 0 ? COLORS[0] : id === 8 ? COLORS[8] : COLORS[id > 8 ? id - 8 : id]);

type View = "seat" | "top";
const PRESETS: Record<View, Preset> = {
  seat: { pos: [0, 0.56, 0.80], look: [0, 0.03, -0.08], fov: 50 },
  top: { pos: [0, 0.98, 0.02], look: [0, 0.04, 0], fov: 40 },
};

class Store {
  game: GameState | null = null;
  shot: { result: ShotResult; t: number } | null = null;
  aim = 0;                 // radians, 0 straight away from you
  power = 0.55;            // 0..1
  actor: number | null = null;
  version = 0;
  bump(actor: number | null = null) { this.actor = actor; this.version++; }
  set(game: GameState) { this.game = game; }
  play(result: ShotResult, actor: number) { this.shot = { result, t: 0 }; this.bump(actor); }
  settle() { this.shot = null; }
  setAim(a: number) { this.aim = a; }
  setPower(p: number) { this.power = p; }
}

function ballTexture(id: number, renderer: THREE.WebGLRenderer) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const ctx = c.getContext("2d")!;
  const col = colorOf(id);
  ctx.fillStyle = id > 8 ? COLORS[0] : col;
  ctx.fillRect(0, 0, 256, 128);
  if (id > 8) { ctx.fillStyle = col; ctx.fillRect(0, 34, 256, 60); }
  if (id > 0) {
    for (const cx of [64, 192]) {
      ctx.fillStyle = "#f8f5ee"; ctx.beginPath(); ctx.arc(cx, 64, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#111"; ctx.font = "700 26px ui-sans-serif, system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(id), cx, 65);
    }
  }
  return canvasTexture(c, renderer);
}

function PoolView({ store, view, body, onShoot, onSettled, className }: { store: Store; view: View; body: BodyKind; onShoot: () => void; onSettled: () => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const shootRef = useRef(onShoot); const settledRef = useRef(onSettled); const viewRef = useRef(view);
  useEffect(() => { shootRef.current = onShoot; }, [onShoot]);
  useEffect(() => { settledRef.current = onSettled; }, [onSettled]);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ts = new TableScene(el, { body, set: "saloon", hat: "cowboy", presets: PRESETS, view: viewRef.current, seated: [FLY] });
    const { scene, tableTop, renderer, camera } = ts;
    const group = new THREE.Group();
    scene.add(group);
    const FELT_Y = tableTop + BASE_H + FELT_H;

    // The little table.
    const loader = new THREE.TextureLoader();
    const woodMap = loader.load("/assets/tex/wood_table_001/diffuse.jpg"); woodMap.colorSpace = THREE.SRGBColorSpace;
    const wood = new THREE.MeshStandardMaterial({ map: woodMap, normalMap: loader.load("/assets/tex/wood_table_001/nor_gl.jpg"), color: 0x6b4a2e, roughness: 0.55 });
    const vel = (f: string) => { const t = loader.load(`/assets/tex/velour_velvet/${f}`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 4); return t; };
    const felt = new THREE.MeshStandardMaterial({ color: 0x2a7a3c, normalMap: vel("nor_gl.jpg"), roughnessMap: vel("rough.jpg"), roughness: 1 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + RAIL * 2 + 0.03, BASE_H, L + RAIL * 2 + 0.03), wood);
    base.position.y = tableTop + BASE_H / 2; base.castShadow = true; base.receiveShadow = true; group.add(base);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W + RAIL * 2, FELT_H, L + RAIL * 2), felt);
    bed.position.y = tableTop + BASE_H + FELT_H / 2; bed.receiveShadow = true; group.add(bed);
    for (const [x, z, w, d] of [[-(W / 2 + RAIL / 2), 0, RAIL, L + RAIL * 2], [W / 2 + RAIL / 2, 0, RAIL, L + RAIL * 2], [0, -(L / 2 + RAIL / 2), W, RAIL], [0, L / 2 + RAIL / 2, W, RAIL]]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.018, d), wood);
      r.position.set(x, FELT_Y + 0.009, z); r.castShadow = true; r.receiveShadow = true; group.add(r);
    }
    const mouth = new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1 });
    for (const [x, z] of POCKETS) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(POCKET_R, POCKET_R, 0.02, 32), mouth);
      m.position.set(x, FELT_Y + 0.0095 - 0.006, z); group.add(m);
    }

    // The balls.
    const geo = new THREE.SphereGeometry(R, 32, 20);
    const balls: THREE.Mesh[] = [];
    for (let id = 0; id < 16; id++) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ballTexture(id, renderer), roughness: 0.18, metalness: 0.02 }));
      m.castShadow = true; m.receiveShadow = true;
      group.add(m); balls.push(m);
    }
    const BALL_Y = FELT_Y + R;

    // The cue, the aim line and the ghost ring.
    const cue = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0058, 0.5, 12), new THREE.MeshStandardMaterial({ map: woodMap, color: 0xc9a36a, roughness: 0.5 }));
    cue.rotation.x = Math.PI / 2; cue.castShadow = true;
    const cueRig = new THREE.Group(); cueRig.add(cue); group.add(cueRig);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.55 }));
    group.add(line);
    const ghost = ring(R * 1.05, 0xf0b25a, 0.8); group.add(ghost);

    // Pointing at the felt to aim; the table's own picking is not used.
    const feltPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BALL_Y);
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
    const aimAt = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(feltPlane, hit)) return;
      const g = store.game; if (!g) return;
      const c = g.balls[0];
      store.setAim(Math.atan2(hit.x - c.x, -(hit.z - c.z)));
    };
    const onMove = (e: PointerEvent) => aimAt(e.clientX, e.clientY);
    const onClick = (e: MouseEvent) => { aimAt(e.clientX, e.clientY); shootRef.current(); };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onMove);
    renderer.domElement.addEventListener("click", onClick);

    const tmp = new THREE.Vector3(), axis = new THREE.Vector3(), prev = balls.map(() => new THREE.Vector3(NaN, 0, NaN));
    const roll = (m: THREE.Mesh, i: number, x: number, z: number) => {
      const p = prev[i];
      if (!Number.isNaN(p.x)) {
        const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
        if (d > 1e-6) { axis.set(dz / d, 0, -dx / d); m.rotateOnWorldAxis(axis, d / R); }
      }
      p.set(x, 0, z);
      m.position.set(x, BALL_Y, z);
    };
    const showAim = (g: GameState) => {
      const mine = g.status === "active" && g.turn === 0 && !store.shot;
      cueRig.visible = line.visible = ghost.visible = mine;
      if (!mine) return;
      const c = g.balls[0];
      const dx = Math.sin(store.aim), dz = -Math.cos(store.aim);
      // Where the cue ball first meets another ball along this line, or the cushion.
      let best = 1.2;
      for (const b of g.balls) {
        if (!b.on || b.id === 0) continue;
        const rx = b.x - c.x, rz = b.z - c.z;
        const along = rx * dx + rz * dz;
        if (along <= 0) continue;
        const perp = Math.hypot(rx - dx * along, rz - dz * along);
        if (perp >= 2 * R) continue;
        const t = along - Math.sqrt(4 * R * R - perp * perp);
        if (t < best) best = t;
      }
      const tx = dx > 0 ? (W / 2 - R - c.x) / dx : dx < 0 ? (-W / 2 + R - c.x) / dx : Infinity;
      const tz = dz > 0 ? (L / 2 - R - c.z) / dz : dz < 0 ? (-L / 2 + R - c.z) / dz : Infinity;
      best = Math.max(0, Math.min(best, tx, tz));
      const pts = lineGeo.attributes.position as THREE.BufferAttribute;
      pts.setXYZ(0, c.x, BALL_Y, c.z); pts.setXYZ(1, c.x + dx * best, BALL_Y, c.z + dz * best); pts.needsUpdate = true;
      ghost.position.set(c.x + dx * best, BALL_Y - R + 0.0006, c.z + dz * best);
      cueRig.position.set(c.x, BALL_Y + 0.004, c.z);
      cueRig.rotation.y = -store.aim;
      cue.position.z = 0.25 + R + 0.02 + store.power * 0.08;      // pulled back with the power
    };

    let seen = -1;
    ts.onFrame = (dt) => {
      ts.view = viewRef.current;
      const g = store.game;
      if (!g) return;
      if (store.version !== seen) { seen = store.version; if (store.actor !== null) ts.reach(store.actor); }
      const shot = store.shot;
      if (shot) {
        shot.t += dt;
        const frames = shot.result.frames;
        const i = Math.min(frames.length - 1, Math.floor(shot.t * 60));
        const p = frames[i].p;
        for (let b = 0; b < 16; b++) {
          const x = p[b * 2], z = p[b * 2 + 1];
          if (Number.isNaN(x)) { balls[b].visible = false; prev[b].x = NaN; continue; }
          balls[b].visible = true; roll(balls[b], b, x, z);
        }
        if (i >= frames.length - 1) { store.settle(); settledRef.current(); }
      } else {
        for (const b of g.balls) {
          const m = balls[b.id];
          m.visible = b.on;
          if (b.on) { tmp.set(b.x, BALL_Y, b.z); if (m.position.distanceToSquared(tmp) > 1e-10) m.position.lerp(tmp, Math.min(1, dt * 10)); prev[b.id].set(m.position.x, 0, m.position.z); }
          else prev[b.id].x = NaN;
        }
      }
      showAim(g);
    };
    (window as unknown as { __gflyPool?: unknown }).__gflyPool = {
      state: () => store.game, aim: (a: number) => store.setAim(a), power: (p: number) => store.setPower(p), shoot: () => shootRef.current(),
      ball: (id: number) => { const b = store.game?.balls[id]; return b ? ts.toScreen(new THREE.Vector3(b.x, BALL_Y, b.z)) : null; },
    };

    return () => {
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      geo.dispose(); lineGeo.dispose();
      ts.dispose();
    };
  }, [store, body]);

  return <div ref={host} className={className} />;
}

export function PoolTable() {
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();
  const store = useMemo(() => new Store(), []);
  const [game, setGame] = useState<GameState | null>(null);
  const [rolling, setRolling] = useState(false);
  const [power, setPowerState] = useState(0.55);
  const [view, setView] = useState<View>("seat");
  const [brains, setBrains] = useState(false);
  const brainsApi = useRef<BrainsApi | null>(null);
  const onApi = useCallback((a: BrainsApi | null) => { brainsApi.current = a; }, []);
  const labels = useRef(new Map<number, string>());
  const timer = useRef<number | null>(null);
  const pending = useRef<{ result: ShotResult; by: number; code: number | null } | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const start = useCallback(() => { const g = createGame(); store.set(g); setGame(g); store.bump(); }, [store]);
  const setPower = useCallback((p: number) => { store.setPower(p); setPowerState(p); }, [store]);

  const fire = useCallback((angle: number, speed: number, by: number, code: number | null) => {
    const g = store.game;
    if (!g || g.status !== "active" || store.shot) return;
    const result = simulate(g.balls, angle, speed);
    pending.current = { result, by, code };
    setRolling(true);
    store.play(result, by);
  }, [store]);

  const shoot = useCallback(() => {
    const g = store.game;
    if (!g || g.turn !== 0 || rolling) return;
    fire(store.aim, 0.35 + store.power * 1.25, ME, null);
  }, [store, rolling, fire]);

  const settled = useCallback(() => {
    const p = pending.current, g = store.game;
    pending.current = null;
    if (!p || !g) return;
    const next = resolve(g, p.result);
    store.set(next); setGame(next); store.bump();
    setRolling(false);
    if (p.by === FLY && p.code !== null) {
      const good = next.last === "potted" || next.last === "win";
      const bad = next.last === "scratch" || next.last === "foul" || next.last === "lose";
      if (good || bad) brainTeach(brainsApi.current, FLY, [p.code], good ? 1 : -1);
    }
  }, [store]);

  // The fly's shot.
  useEffect(() => {
    if (!game || game.status !== "active" || game.turn !== 1 || rolling) return;
    let cancelled = false;
    const run = async () => {
      const cands = getBestShots(game, 3);
      if (cands.length === 0) return;
      const code = (s: (typeof cands)[number]) => { const k = codeOf(`pool:${s.target}:${s.pocket}`); labels.current.set(k, s.pocket < 0 ? `${s.target}` : `${s.target} → ${s.pocket + 1}`); return k; };
      const r = await brainChoose(brainsApi.current, FLY, cands.map((s) => ({ item: s, code: code(s) })), "like");
      if (cancelled) return;
      const chosen = r?.item ?? cands[0];
      // The plan was exact; the cue is not. A little off in line and pace, like anyone.
      fire(chosen.angle + (Math.random() - 0.5) * 0.03, chosen.speed * (0.92 + Math.random() * 0.16), FLY, r ? code(chosen) : null);
    };
    timer.current = window.setTimeout(() => { timer.current = null; run().catch((e) => console.error(e)); }, 900);
    return () => { cancelled = true; if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
  }, [game, rolling, fire]);

  if (!game) return <Lobby title={lt("lobby.title")} body={lt("lobby.body")} action={lt("lobby.sit")} onStart={start} />;

  const names = [lt("you"), NAMES[1], NAMES[2], NAMES[3]];
  const active = game.status === "active" ? (game.turn === 0 ? ME : FLY) : null;
  const left = (s: 0 | 1) => { const g = game.groups[s]; return g ? game.balls.filter((b) => b.on && groupOf(b.id) === g).length : null; };
  const groupName = (s: 0 | 1) => (game.groups[s] === "solid" ? lt("solids") : game.groups[s] === "stripe" ? lt("stripes") : lt("open"));
  const status = game.status === "over"
    ? (game.winner === 0 ? lt("youWin") : lt("flyWins", { name: NAMES[FLY] }))
    : rolling ? lt("rolling") : game.turn === 0 ? lt("turn.you") : lt("turn.fly", { name: NAMES[FLY] });
  const lastKey = game.last === "potted" ? "last.potted" : game.last === "scratch" ? "last.scratch" : game.last === "foul" ? "last.foul" : game.last === "miss" ? "last.miss" : null;
  const labelOf = (c: number) => labels.current.get(c) ?? "";
  const canShoot = game.status === "active" && game.turn === 0 && !rolling;

  return (
    <div className="space-y-2">
      <div className={TABLE_FRAME}>
        <PoolView store={store} view={view} body={bodyKind} onShoot={shoot} onSettled={settled} className="glass-inner h-full w-full" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="hud">
            <span className="t-cap">{lt("shoot")} {game.shots}</span>
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
                const side = s === ME ? 0 : 1, n = left(side);
                return (
                  <span key={s} className={`flex items-baseline gap-2 ${active === s ? "text-label" : "text-label-2"}`}>
                    {active === s && <span className="live-dot" />}
                    <span className="t-foot">{names[s]} · {groupName(side)}</span>
                    {n !== null && <span className="t-cap">{lt("left", { n })}</span>}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {wide && <FlyBrains names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} seats={SEATS} note={lt("brain.note")} />}

        <div className="absolute inset-x-0 bottom-0 flex flex-col items-stretch gap-2 p-3 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <div className="hud pointer-events-none sm:max-w-[50%]">
            <span className="t-foot">{lastKey ? lt(lastKey) : lt("aim")}</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            {game.status === "over" ? (
              <button className="btn-primary text-xs" onClick={start}>{lt("new")}</button>
            ) : (
              <>
                <label className="hud"><span className="t-cap">{lt("power")}</span>
                  <input type="range" min={0} max={100} value={Math.round(power * 100)} onChange={(e) => setPower(Number(e.target.value) / 100)} className="rng rng-on w-28" />
                </label>
                <button className="btn-primary text-xs" disabled={!canShoot} onClick={shoot}>{lt("shoot")}</button>
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
