"use client";

/**
 * Hold'em at the saloon table. You are the south seat; three flies in
 * cowboy hats take the others. The cards are the CC0 English-pattern deck
 * from Wikimedia Commons drawn onto card-sized slabs; the chips are Poly
 * Haven's poker_chips. Everything on the felt is laid out from the game
 * state and eases into place, so deals and reveals animate.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TableScene, type Preset } from "@/lib/three/tableScene";
import type { BodyKind } from "@/lib/three/body";
import { useLocalT } from "@/lib/i18n";
import { useMedia } from "@/lib/useMedia";
import { useBodyKind } from "@/lib/sim/body";
import { FlyBrains, type BrainsApi } from "../shared/FlyBrains";
import { brainChoose, brainTeach, codeOf } from "../shared/brainPlay";
import { Lobby, NAMES, TABLE_FRAME } from "../shared/Lobby";
import { ease, imageTexture } from "../shared/tableAssets";
import { dict, type PokerKey } from "./dict";
import { applyAction, createGame, evaluateHand, getLegalActions, type Card, type GameState } from "./engine";
import { getBestActions } from "./bot";

const ME = 0;
const CARD_W = 0.068, CARD_H = 0.095, CARD_T = 0.0016;
const SUIT = { hearts: "H", diamonds: "D", clubs: "C", spades: "S" } as const;
const cardKey = (c: Card) => `${c.rank}${SUIT[c.suit]}`;

type View = "seat" | "top";
const PRESETS: Record<View, Preset> = {
  seat: { pos: [0, 0.42, 0.98], look: [0, -0.02, -0.12], fov: 62 },
  top: { pos: [0, 0.95, 0.3], look: [0, 0, -0.02], fov: 52 },
};

/** Which fly said what this hand, for the lesson at showdown. */
type Said = Record<number, number[]>;

class Store {
  game: GameState | null = null;
  hand = 0;
  actor: number | null = null;
  version = 0;
  bump(actor: number | null = null) { this.actor = actor; this.version++; }
  deal(game: GameState) { this.game = game; this.hand++; }
}

const FACE_UP = new THREE.Quaternion();
const FACE_DOWN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);

function PokerView({ store, view, body, className }: { store: Store; view: View; body: BodyKind; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ts = new TableScene(el, {
      body, set: "saloon", hat: "cowboy", presets: PRESETS, view: viewRef.current,
      mat: { shape: "round", size: 1.16, texture: "velvet", color: 0x2f5a3a },
    });
    const { scene, tableTop, renderer } = ts;
    let disposed = false;
    const group = new THREE.Group();
    scene.add(group);

    // The deck: one geometry, a back everyone shares, faces made as they are needed.
    const geo = new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H);
    const edge = new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.8 });
    const back = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    imageTexture("/assets/cards/back.svg", 360, 540, renderer).then((t) => { if (disposed) { t.dispose(); return; } back.map = t; back.needsUpdate = true; }).catch((e) => console.error(e));
    const faces = new Map<string, THREE.MeshStandardMaterial>();
    const face = (c: Card): THREE.MeshStandardMaterial => {
      const k = cardKey(c);
      let m = faces.get(k);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
        faces.set(k, m);
        imageTexture(`/assets/cards/${k}.svg`, 360, 540, renderer, (ctx) => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 360, 540); })
          .then((t) => { if (disposed) { t.dispose(); return; } m!.map = t; m!.needsUpdate = true; }).catch((e) => console.error(e));
      }
      return m;
    };
    // Box groups: +x -x +y(face) -y(back) +z -z.
    const cardMesh = (c: Card) => {
      const m = new THREE.Mesh(geo, [edge, edge, face(c), back, edge, edge]);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    };

    // Chips: the Poly Haven pile, one per seat scaled to its stack.
    const chips: THREE.Object3D[] = [];
    let pile: THREE.Object3D | null = null;
    new GLTFLoader().loadAsync("/assets/models/poker_chips/poker_chips.glb").then((g) => {
      if (disposed) return;
      g.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(g.scene);
      const size = box.getSize(new THREE.Vector3());
      g.scene.position.sub(box.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, size.y / 2, 0));
      pile = new THREE.Group().add(g.scene);
      pile.scale.setScalar(0.11 / Math.max(size.x, size.z));
      for (let s = 0; s < 4; s++) {
        const p = pile.clone();
        const at = ts.place(s, new THREE.Vector3(-0.19, tableTop + 0.0075, 0.36), new THREE.Quaternion());
        p.position.copy(at.pos); p.quaternion.copy(at.quat);
        group.add(p); chips.push(p);
      }
      seen = -1;
    }).catch((e) => console.error(e));

    const meshes = new Map<string, THREE.Mesh>();          // by card
    const targets = new Map<THREE.Object3D, { pos: THREE.Vector3; quat: THREE.Quaternion }>();
    let seen = -1;
    let lastHand = -1;

    const layout = (game: GameState) => {
      if (store.hand !== lastHand) {                       // a new deal: sweep the old cards away
        lastHand = store.hand;
        for (const m of meshes.values()) { group.remove(m); }
        meshes.clear();
      }
      targets.clear();
      const y = tableTop + 0.0075;                          // on top of the felt
      const put = (c: Card, seat: number, local: THREE.Vector3, up: boolean, dy = 0) => {
        const k = cardKey(c);
        let m = meshes.get(k);
        const placed = ts.place(seat, local.clone().setY(y + dy), up ? FACE_UP : FACE_DOWN);
        if (!m) {
          m = cardMesh(c);
          const from = ts.place(seat, new THREE.Vector3(0, y + 0.02, 0), FACE_DOWN);   // dealt from the middle
          m.position.copy(from.pos); m.quaternion.copy(from.quat);
          group.add(m); meshes.set(k, m);
        }
        targets.set(m, placed);
      };
      const over = game.phase === "showdown" || game.phase === "over";
      for (const p of game.players) {
        const s = p.seat;
        const up = s === ME || (over && !p.folded);
        const tuck = p.folded ? 0.06 : 0;                  // a folded hand is pushed toward the middle, face down
        p.hand.forEach((c, i) => put(c, s, new THREE.Vector3((i - 0.5) * (CARD_W + 0.006) + (s === ME ? 0 : 0), 0, 0.33 - tuck), up && !p.folded, i * CARD_T));
      }
      game.community.forEach((c, i) => put(c, 0, new THREE.Vector3((i - 2) * (CARD_W + 0.008), 0, 0.15), true));   // in front of the lantern
      for (let s = 0; s < 4; s++) {
        const c = chips[s];
        if (!c) continue;
        const stack = game.players[s].chips;
        c.visible = stack > 0;
        if (pile) c.scale.setScalar(pile.scale.x * (0.55 + 0.45 * Math.min(1, stack / 1500)));
      }
    };

    ts.onFrame = (dt) => {
      ts.view = viewRef.current;
      if (store.game && store.version !== seen) {
        seen = store.version;
        layout(store.game);
        if (store.actor !== null) ts.reach(store.actor);
      }
      ease([...meshes.values()].map((m) => [m, targets.get(m)]), dt, 7);
    };
    // Where things are on screen, for checks from outside (tests, the console).
    (window as unknown as { __gflyPoker?: unknown }).__gflyPoker = {
      creatures: () => ts.creatures.map((c) => ({ seat: c.seat, ...ts.toScreen(c.body.root.getWorldPosition(new THREE.Vector3())) })),
      state: () => store.game && { hand: store.hand, phase: store.game.phase, status: store.game.status, current: store.game.currentPlayer, pot: store.game.pot, winner: store.game.winner, chips: store.game.players.map((p) => p.chips) },
    };

    return () => {
      disposed = true;
      for (const m of faces.values()) { m.map?.dispose(); m.dispose(); }
      ts.dispose();
    };
  }, [store, body]);

  return <div ref={host} className={className} />;
}

export function PokerTable() {
  const { lt } = useLocalT(dict);
  const wide = useMedia("(min-width: 1024px)");
  const bodyKind = useBodyKind();
  const store = useMemo(() => new Store(), []);
  const [, setTick] = useState(0);
  const [game, setGame] = useState<GameState | null>(null);
  const [view, setView] = useState<View>("seat");
  const [brains, setBrains] = useState(false);
  const brainsApi = useRef<BrainsApi | null>(null);
  const onApi = useCallback((a: BrainsApi | null) => { brainsApi.current = a; }, []);
  const labels = useRef(new Map<number, string>());
  const said = useRef<Said>({});
  const taught = useRef(-1);
  const timer = useRef<number | null>(null);

  const bump = useCallback((actor: number | null = null) => { store.bump(actor); setTick((t) => t + 1); }, [store]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  /** A fresh deal. Chips and the button carry over from the last hand. */
  const deal = useCallback((prev: GameState | null) => {
    const g = createGame(4, 1000, prev ? { chips: prev.players.map((p) => p.chips), dealer: prev.dealer + 1 } : undefined);
    store.deal(g);
    said.current = {};
    setGame(g);
    bump();
  }, [store, bump]);

  const act = useCallback((seat: number, action: "fold" | "call" | "raise", amount = 0) => {
    const g = store.game;
    if (!g || g.status !== "active" || g.currentPlayer !== seat) return;
    applyAction(g, action, amount);
    bump(seat);
  }, [store, bump]);

  // The flies act in turn; at showdown their choices become lessons.
  const version = store.version;
  useEffect(() => {
    const g = store.game;
    if (!g) return;
    const api = brainsApi.current;
    if (g.status !== "active") {
      if (api && taught.current !== store.hand) {
        taught.current = store.hand;
        for (const [s, codes] of Object.entries(said.current)) {
          const seat = Number(s);
          if (seat === ME || codes.length === 0 || !api.ready(seat)) continue;
          brainTeach(api, seat, codes, seat === g.winner ? 1 : -1);
        }
      }
      return;
    }
    const seat = g.currentPlayer;
    if (seat === ME) return;
    let cancelled = false;
    const run = async () => {
      const cands = getBestActions(g, seat);
      if (cands.length === 0) { act(seat, "fold"); return; }
      if (!api?.ready(seat)) { act(seat, cands[0].action, cands[0].raiseAmount ?? 0); return; }
      const code = (a: (typeof cands)[number]) => { const c = codeOf(`${a.action}${a.raiseAmount ?? ""}`); labels.current.set(c, a.action); return c; };
      const r = await brainChoose(api, seat, cands.map((c) => ({ item: c, code: code(c) })), "like");
      if (cancelled || store.game !== g || g.currentPlayer !== seat) return;
      const chosen = r?.item ?? cands[0];
      if (r) (said.current[seat] ??= []).push(code(chosen));
      act(seat, chosen.action, chosen.raiseAmount ?? 0);
    };
    timer.current = window.setTimeout(() => { timer.current = null; run().catch(() => act(seat, "fold")); }, 900);
    return () => { cancelled = true; if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  if (!game) return <Lobby title={lt("lobby.title")} body={lt("lobby.body")} action={lt("lobby.sit")} onStart={() => deal(null)} />;

  const g = store.game!;
  const me = g.players[ME];
  const legal = g.status === "active" && g.currentPlayer === ME ? getLegalActions(g) : [];
  const toCall = Math.max(0, g.currentBet - me.bet);
  const over = g.status !== "active";
  const names = [lt("you"), NAMES[1], NAMES[2], NAMES[3]];
  const active = over ? null : g.currentPlayer;
  const status = over
    ? (g.winner === ME ? lt("youWin", { n: g.pot }) : lt("flyWins", { name: names[g.winner ?? 1], n: g.pot }))
    : g.currentPlayer === ME ? lt("turn.you") : lt("turn.fly", { name: names[g.currentPlayer] });
  const strength = g.community.length >= 3 ? lt(`hand.${evaluateHand(me.hand, g.community).rank}` as PokerKey) : "";
  const labelOf = (c: number) => { const a = labels.current.get(c); return a ? lt(a as "fold" | "call" | "raise", { n: "" }).trim() : ""; };
  const raises = [0.25, 0.5, 1].map((f) => Math.max(1, Math.round(me.chips * f / 5) * 5)).filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="space-y-2">
      <div className={TABLE_FRAME}>
        <PokerView store={store} view={view} body={bodyKind} className="glass-inner h-full w-full" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="hud">
            <span className="t-cap">{lt("hand", { n: store.hand })} · {lt(`phase.${g.phase}` as PokerKey)}</span>
            <span className="num t-foot">{lt("pot")} {g.pot}</span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="hud pointer-events-auto gap-1.5" style={{ flexDirection: "row" }}>
              <div className="seg seg-sm">
                {(["seat", "top"] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{lt(v === "seat" ? "view.seat" : "view.top")}</button>)}
              </div>
              <div className="seg seg-sm"><button aria-pressed={brains} onClick={() => setBrains(!brains)} title={lt("brains.title")}>{lt("brains")}</button></div>
            </div>
            <div className="hud items-end">
              {g.players.map((p) => (
                <span key={p.seat} className={`flex items-baseline gap-2 ${active === p.seat ? "text-label" : p.folded ? "text-label-3" : "text-label-2"}`}>
                  {active === p.seat && <span className="live-dot" />}
                  <span className={`t-foot ${p.folded ? "line-through" : ""}`}>{names[p.seat]}</span>
                  <span className="num t-foot">{p.chips}</span>
                  {p.bet > 0 && <span className="num t-cap text-orange">+{p.bet}</span>}
                </span>
              ))}
            </div>
          </div>
        </div>

        {wide && <FlyBrains names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} note={lt("brain.note")} />}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
          <div className="hud pointer-events-none max-w-[55%]">
            <span className="t-foot">{status}</span>
            <span className="t-cap">{strength}{strength && toCall > 0 && !over ? " · " : ""}{toCall > 0 && !over ? `${toCall} ${lt("toCall")}` : ""}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {over && <button className="btn-primary text-xs" onClick={() => deal(g)}>{lt("next")}</button>}
            {over && <button className="btn text-xs" onClick={() => deal(null)}>{lt("new")}</button>}
            {legal.includes("fold") && toCall > 0 && <button className="btn text-xs" onClick={() => act(ME, "fold")}>{lt("fold")}</button>}
            {legal.includes("call") && <button className="btn-primary text-xs" onClick={() => act(ME, "call")}>{toCall > 0 ? lt("call", { n: Math.min(toCall, me.chips) }) : lt("check")}</button>}
            {legal.includes("raise") && raises.map((r) => (
              <button key={r} className="btn-on text-xs" onClick={() => act(ME, "raise", Math.min(r, me.chips - toCall))}>{r >= me.chips - toCall ? lt("allIn") : lt("raise", { n: r })}</button>
            ))}
          </div>
        </div>
      </div>

      {!wide && <FlyBrains variant="strip" names={names} labelOf={labelOf} enabled={brains} onApi={onApi} active={active} note={lt("brain.note")} />}
      <p className="t-foot px-1">{lt("caption")}</p>
    </div>
  );
}
