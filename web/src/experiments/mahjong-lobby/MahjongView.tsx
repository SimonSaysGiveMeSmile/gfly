"use client";

/**
 * The mahjong table in first person, on the shared table scene. Everything
 * on the table is placed from the game state each time it changes and eases
 * into position, so draws, discards and calls animate for free.
 *
 * Found assets only: the tile faces are riichi-mahjong-tiles (CC0); the
 * room, furniture and creatures come from the table scene.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { TableScene, type Placed, type Preset } from "@/lib/three/tableScene";
import type { BodyKind } from "@/lib/three/body";
import { loadTileSet, TILE_D, TILE_H, TILE_W } from "./tiles";
import type { Game, Tile } from "./engine";

/** Table state handed to the scene without going through React renders. */
export class TableStore {
  game: Game | null = null;
  version = 0;
  /** Seat that just acted, for the reach animation. */
  actor: number | null = null;
  set(game: Game, actor: number | null = null) { this.game = game; this.actor = actor; this.version++; }
}

const GAP = 0.0025;
const HAND_Z = 0.45, WALL_Z = 0.31, DISCARD_Z = 0.20, MELD_X = 0.22;

export type TableView = "seat" | "desk";

/** Camera presets in the south seat's frame, heights relative to the table top. */
export const PRESETS: Record<TableView, Preset> = {
  seat: { pos: [0, 0.33, 0.78], look: [0, -0.03, -0.02], fov: 60 },
  desk: { pos: [0, 0.48, 0.56], look: [0, 0, 0.22], fov: 44 },
};

export function MahjongView({ store, me, view, body, onPick, onHover, className }: {
  store: TableStore;
  me: number;
  view: TableView;
  body: BodyKind;
  onPick: (tileId: number) => void;
  onHover: (tileId: number | null) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick); const hoverRef = useRef(onHover); const viewRef = useRef(view);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);
  useEffect(() => { hoverRef.current = onHover; }, [onHover]);
  useEffect(() => { viewRef.current = view; }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ts = new TableScene(el, {
      body, set: "tea", presets: PRESETS, view: viewRef.current,
      mat: { shape: "square", size: 0.96, texture: "velvet", color: 0x8c8c8c },
    });
    const { scene, tableTop } = ts;
    let disposed = false;

    // Tiles.
    const meshes = new Map<number, THREE.Mesh>();
    const targets = new Map<number, Placed>();
    const lifted = new Set<number>();
    let tileSet: Awaited<ReturnType<typeof loadTileSet>> | null = null;
    const tileGroup = new THREE.Group();
    scene.add(tileGroup);
    let seen = -1;
    loadTileSet(ts.renderer).then((set) => {
      if (disposed) { set.dispose(); return; }
      tileSet = set;
      seen = -1;                                          // force a layout pass
    }).catch((e) => console.error(e));

    const FLAT_UP = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));   // face up, top toward centre
    const FLAT_DOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const STAND = new THREE.Quaternion();                                                        // face toward the owner
    const place = (id: number, seat: number, local: THREE.Vector3, rot: THREE.Quaternion) => targets.set(id, ts.place(seat, local, rot));

    /** Lay every tile out from the game state. */
    const layout = (game: Game) => {
      targets.clear();
      const y0 = tableTop + 0.006;
      for (const p of game.players) {
        const s = p.seat;
        // Hand: standing, along the near edge; the drawn tile sits apart.
        const hand = p.hand;
        const n = hand.length;
        const pitch = TILE_W + GAP;
        const drawn = game.phase.kind === "discard" && game.phase.seat === s && n % 3 === 2 ? hand[n - 1] : null;
        const row = drawn ? hand.slice(0, -1) : hand;
        const sorted = [...row].sort((a, b) => a.kind - b.kind || a.id - b.id);
        const x0 = -((sorted.length - 1) * pitch) / 2;
        sorted.forEach((t, i) => {
          const lift = s === me && lifted.has(t.id) ? 0.012 : 0;
          place(t.id, s, new THREE.Vector3(x0 + i * pitch, y0 + TILE_H / 2 + lift, HAND_Z), STAND);
        });
        if (drawn) {
          const lift = s === me && lifted.has(drawn.id) ? 0.012 : 0;
          place(drawn.id, s, new THREE.Vector3(x0 + sorted.length * pitch + 0.014, y0 + TILE_H / 2 + lift, HAND_Z), STAND);
        }
        // Melds: flat, face up, off to the right.
        let mx = MELD_X;
        for (const m of p.melds) {
          for (const t of m.tiles) {
            place(t.id, s, new THREE.Vector3(mx + TILE_W / 2, y0 + TILE_D / 2, HAND_Z + 0.01), m.from === -1 && t === m.tiles[0] ? FLAT_DOWN : FLAT_UP);
            mx += pitch;
          }
          mx += 0.008;
        }
        // Discards: rows of six, flat, in front of the hand, growing toward the centre.
        p.discards.forEach((t, i) => {
          const r = Math.floor(i / 6), c = i % 6;
          place(t.id, s, new THREE.Vector3(-2.5 * pitch + c * pitch, y0 + TILE_D / 2, DISCARD_Z - r * (TILE_H + GAP)), FLAT_UP);
        });
      }
      // The wall: what is left, as stacks of two around the ring.
      const stacks = Math.ceil(game.wall.length / 2);
      const first = 68 - stacks;
      game.wall.forEach((t, i) => {
        const j = first + Math.floor(i / 2), level = 1 - (i % 2);
        const side = Math.floor(j / 17) % 4, k = j % 17;
        place(t.id, side, new THREE.Vector3(-8 * (TILE_W + GAP) + k * (TILE_W + GAP), y0 + TILE_D / 2 + level * TILE_D, WALL_Z), FLAT_DOWN);
      });
    };

    const ensureMeshes = (game: Game) => {
      if (!tileSet) return;
      const all: Tile[] = [...game.wall, ...game.players.flatMap((p) => [...p.hand, ...p.discards, ...p.melds.flatMap((m) => m.tiles)])];
      for (const t of all) {
        if (meshes.has(t.id)) continue;
        const m = new THREE.Mesh(tileSet.geometry, tileSet.materials[t.kind]);
        m.castShadow = true; m.receiveShadow = true;
        m.userData.pickId = t.id;
        const tg = targets.get(t.id);
        if (tg) { m.position.copy(tg.pos); m.quaternion.copy(tg.quat); }
        tileGroup.add(m);
        meshes.set(t.id, m);
      }
      ts.pickables = game.players[me].hand.map((t) => meshes.get(t.id)).filter((m): m is THREE.Mesh => !!m);
    };

    ts.onHover = (id) => {
      lifted.clear();
      if (id !== null) lifted.add(id);
      if (store.game) layout(store.game);
      hoverRef.current(id);
    };
    ts.onPick = (id) => pickRef.current(id);

    ts.onFrame = (dt) => {
      ts.view = viewRef.current;
      if (store.game && store.version !== seen) {
        seen = store.version;
        layout(store.game);
        ensureMeshes(store.game);
        if (store.actor !== null) ts.reach(store.actor);
      }
      // Tiles ease to their places.
      const k = Math.min(1, dt * 9);
      for (const [id, m] of meshes) {
        const tg = targets.get(id);
        if (!tg) { m.visible = false; continue; }
        m.visible = true;
        m.position.lerp(tg.pos, k);
        m.quaternion.slerp(tg.quat, k);
      }
    };

    // Where my tiles are on screen, for checks from outside (tests, the console).
    (window as unknown as { __gflyMj?: unknown }).__gflyMj = {
      handScreen: () => ts.pickables.map((m) => ({ id: m.userData.pickId as number, ...ts.toScreen(m.getWorldPosition(new THREE.Vector3())) })),
    };

    return () => {
      disposed = true;
      // The tile set is shared and cached; keep it out of the scene's sweep.
      tileGroup.removeFromParent();
      ts.dispose();
    };
  }, [store, me, body]);

  return <div ref={host} className={className} />;
}
