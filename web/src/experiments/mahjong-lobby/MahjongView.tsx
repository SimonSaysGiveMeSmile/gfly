"use client";

/**
 * The table in first person. You sit at the south side; three flies sit on
 * stools at the other three. Everything on the table is placed from the game
 * state each time it changes and eases into position, so draws, discards
 * and calls animate for free.
 *
 * Found assets only: the flies are the flybody rig, the furniture and light
 * come from Poly Haven (CC0), the tile faces from riichi-mahjong-tiles (CC0).
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FlyRig, loadFlyRigData } from "@/lib/three/flyRig";
import { FlyAnimator } from "@/lib/three/flyPose";
import { loadBackdrop, loadEnvironment } from "@/lib/three/env";
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

const TABLE_SCALE = 1.35;              // the tea table, grown to a card table
const TABLE_TOP = 0.4986 * TABLE_SCALE; // its top, metres
const STOOL_TOP = 0.63;
const FLY_SCALE = 0.22;                // a 22 cm fly. Real ones are 3 mm.
const GAP = 0.0025;
const HAND_Z = 0.45, WALL_Z = 0.31, DISCARD_Z = 0.20, MELD_X = 0.22;

interface Placed { pos: THREE.Vector3; quat: THREE.Quaternion; }

export type TableView = "seat" | "desk";

/** Camera presets in the south seat's frame: where the eye is, what it looks at. */
const PRESETS: Record<TableView, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
  seat: { pos: [0, TABLE_TOP + 0.33, 0.78], look: [0, TABLE_TOP - 0.03, -0.02], fov: 60 },
  desk: { pos: [0, TABLE_TOP + 0.52, 0.62], look: [0, TABLE_TOP, 0.22], fov: 52 },
};

export function MahjongView({ store, me, view, onPick, onHover, className }: {
  store: TableStore;
  me: number;
  view: TableView;
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
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0b09);
    loadEnvironment(renderer, "garden").then((env) => { if (!disposed) { scene.environment = env; scene.environmentIntensity = 0.8; } }).catch(() => {});
    loadBackdrop("garden").then((t) => { if (!disposed) { scene.background = t; scene.backgroundBlurriness = 0.5; scene.backgroundIntensity = 0.5; scene.backgroundRotation.y = Math.PI; } }).catch(() => {});

    // Seat frames: 0 south (you), 1 east, 2 north, 3 west. Local -z faces the centre.
    const seats = [0, 1, 2, 3].map((s) => {
      const g = new THREE.Group();
      g.rotation.y = s * Math.PI / 2;
      scene.add(g);
      return g;
    });

    // Camera: eye level for a fly standing on its stool.
    const camera = new THREE.PerspectiveCamera(PRESETS.seat.fov, 1, 0.02, 40);
    const camRig = new THREE.Group();
    seats[0].add(camRig);
    camRig.position.set(...PRESETS.seat.pos);
    camRig.add(camera);
    const camLookLocal = new THREE.Vector3(...PRESETS.seat.look);
    const camLook = new THREE.Vector3(), wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
    let wantFov = PRESETS.seat.fov;
    seats[0].localToWorld(camLook.copy(camLookLocal));
    camera.lookAt(camLook);
    const baseQuat = camera.quaternion.clone();
    const mouse = new THREE.Vector2(0, 0), mouseSmooth = new THREE.Vector2(0, 0);

    // Light: a warm lamp over the table, the garden probe for everything else.
    const lamp = new THREE.SpotLight(0xffd9a8, 12, 5, Math.PI * 0.28, 0.65, 1.3);
    lamp.position.set(0.15, 2.1, 0.1);
    lamp.target.position.set(0, TABLE_TOP, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.bias = -0.0004;
    lamp.shadow.radius = 4;
    scene.add(lamp, lamp.target);
    const lampBody = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.12, 40, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide, emissive: 0xffb070, emissiveIntensity: 0.15 }),
    );
    lampBody.position.copy(lamp.position).add(new THREE.Vector3(0, -0.02, 0));
    lampBody.scale.setScalar(1.3);
    scene.add(lampBody);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.2), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    cord.position.copy(lamp.position).add(new THREE.Vector3(0, 0.6, 0));
    scene.add(cord);
    scene.add(new THREE.HemisphereLight(0x8fa3c9, 0x2a1d12, 0.35));

    // Floor: dark boards under the table.
    const texLoader = new THREE.TextureLoader();
    const wood = {
      map: texLoader.load("/assets/tex/wood_table_001/diffuse.jpg"),
      normalMap: texLoader.load("/assets/tex/wood_table_001/nor_gl.jpg"),
      roughnessMap: texLoader.load("/assets/tex/wood_table_001/rough.jpg"),
    };
    for (const t of Object.values(wood)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); }
    wood.map.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ ...wood, color: 0x6b5a48, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // The mat: velvet from Poly Haven, on the tea table.
    const velvet = {
      map: texLoader.load("/assets/tex/velour_velvet/diffuse.jpg"),
      normalMap: texLoader.load("/assets/tex/velour_velvet/nor_gl.jpg"),
      roughnessMap: texLoader.load("/assets/tex/velour_velvet/rough.jpg"),
    };
    for (const t of Object.values(velvet)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); }
    velvet.map.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.Mesh(
      new THREE.BoxGeometry(0.96, 0.006, 0.96),
      new THREE.MeshStandardMaterial({ ...velvet, color: 0x8c8c8c, roughness: 0.97 }),
    );
    mat.position.y = TABLE_TOP + 0.003;
    mat.receiveShadow = true;
    scene.add(mat);
    const matEdge = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.012, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x2b211a, roughness: 0.5, metalness: 0.05 }),
    );
    matEdge.position.y = TABLE_TOP - 0.001;
    scene.add(matEdge);

    // Furniture from Poly Haven.
    const gltf = new GLTFLoader();
    const prep = (o: THREE.Object3D) => o.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    gltf.loadAsync("/assets/models/chinese_tea_table/chinese_tea_table.gltf").then((g) => {
      if (disposed) return;
      prep(g.scene); g.scene.scale.setScalar(TABLE_SCALE); scene.add(g.scene);
    }).catch((e) => console.error(e));
    gltf.loadAsync("/assets/models/chinese_stool/chinese_stool.gltf").then((g) => {
      if (disposed) return;
      prep(g.scene);
      for (const s of [1, 2, 3]) {
        const st = g.scene.clone();
        st.position.set(0, 0, s === 2 ? 0.74 : 0.68);
        seats[s].add(st);
      }
    }).catch((e) => console.error(e));
    gltf.loadAsync("/assets/models/chinese_armchair/chinese_armchair.gltf").then((g) => {
      if (disposed) return;
      prep(g.scene);
      g.scene.position.set(-2.4, 0, -2.6);
      g.scene.rotation.y = Math.PI * 0.3;
      scene.add(g.scene);
    }).catch((e) => console.error(e));

    // The other three flies, on their stools, facing the table.
    const flies: { rig: FlyRig; anim: FlyAnimator; seat: number; reach: number }[] = [];
    loadFlyRigData().then((data) => {
      if (disposed) return;
      for (const s of [1, 2, 3]) {
        const rig = new FlyRig(data);
        rig.mesh.castShadow = true;
        rig.root.scale.setScalar(FLY_SCALE);
        let low = 0;
        for (const [n, p] of rig.restPositions) if (n.startsWith("claw")) low = Math.min(low, p.z);
        rig.root.position.set(0, STOOL_TOP - low * FLY_SCALE, s === 2 ? 0.72 : 0.66);
        rig.root.rotation.y = Math.PI / 2;               // +x forward -> -z, toward the table
        seats[s].add(rig.root);
        const anim = new FlyAnimator(rig);
        anim.mode = "idle";
        flies.push({ rig, anim, seat: s, reach: 0 });
      }
    }).catch((e) => console.error(e));

    // Tiles.
    const meshes = new Map<number, THREE.Mesh>();
    const targets = new Map<number, Placed>();
    const lifted = new Set<number>();
    let tileSet: Awaited<ReturnType<typeof loadTileSet>> | null = null;
    const tileGroup = new THREE.Group();
    scene.add(tileGroup);
    loadTileSet(renderer).then((ts) => {
      if (disposed) { ts.dispose(); return; }
      tileSet = ts;
      seen = -1;                                          // force a layout pass
    }).catch((e) => console.error(e));

    const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();
    const FLAT_UP = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));   // face up, top toward centre
    const FLAT_DOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const STAND = new THREE.Quaternion();                                                        // face toward the owner
    const place = (id: number, seat: number, local: THREE.Vector3, rot: THREE.Quaternion) => {
      const g = seats[seat];
      const pos = local.clone().applyQuaternion(g.quaternion).add(g.position);
      const quat = g.quaternion.clone().multiply(rot);
      targets.set(id, { pos, quat });
    };

    /** Lay every tile out from the game state. */
    const layout = (game: Game) => {
      targets.clear();
      const y0 = TABLE_TOP + 0.006;
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
        m.userData.tileId = t.id;
        const tg = targets.get(t.id);
        if (tg) { m.position.copy(tg.pos); m.quaternion.copy(tg.quat); }
        tileGroup.add(m);
        meshes.set(t.id, m);
      }
    };

    // Hover and pick on your own hand.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let hovered: number | null = null;
    const myHandMeshes = (): THREE.Mesh[] => {
      const g = store.game; if (!g) return [];
      return g.players[me].hand.map((t) => meshes.get(t.id)).filter((m): m is THREE.Mesh => !!m);
    };
    const hitAt = (clientX: number, clientY: number): number | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(myHandMeshes(), false)[0];
      return hit ? (hit.object.userData.tileId as number) : null;
    };
    const setHover = (id: number | null) => {
      if (id === hovered) return;
      hovered = id;
      lifted.clear();
      if (id !== null) lifted.add(id);
      if (store.game) layout(store.game);
      hoverRef.current(id);
      renderer.domElement.style.cursor = id !== null ? "pointer" : "default";
    };
    // A mouse lifts a tile by hovering and throws it with a click. A finger
    // has no hover: the first tap lifts, a second tap on the same tile throws.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      setHover(hitAt(e.clientX, e.clientY));
    };
    const onLeave = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; mouse.set(0, 0); setHover(null); };
    const onClick = (e: MouseEvent) => {
      const id = hitAt(e.clientX, e.clientY);
      if (id === null) { setHover(null); return; }
      if (id === hovered) pickRef.current(id); else setHover(id);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.style.touchAction = "none";
    // Where my tiles are on screen, for checks from outside (tests, the console).
    (window as unknown as { __gflyMj?: unknown }).__gflyMj = {
      handScreen: () => myHandMeshes().map((m) => {
        const v = m.getWorldPosition(new THREE.Vector3()).project(camera);
        const r = renderer.domElement.getBoundingClientRect();
        return { id: m.userData.tileId as number, x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      }),
    };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let seen = -1;
    let raf = 0, last = performance.now();
    const yawQ = new THREE.Quaternion(), pitchQ = new THREE.Quaternion();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000); last = now;

      if (store.game && store.version !== seen) {
        seen = store.version;
        layout(store.game);
        ensureMeshes(store.game);
        if (store.actor !== null) { const f = flies.find((x) => x.seat === store.actor); if (f) f.reach = 1; }
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

      // The flies fidget; the one who just played reaches over the table.
      for (const f of flies) {
        f.anim.overrides.clear();
        if (f.reach > 0) {
          f.reach = Math.max(0, f.reach - dt * 1.1);
          const u = Math.sin(f.reach * Math.PI);
          f.anim.overrides.set("coxa_twist_T1_left", 0.55 * u);
          f.anim.overrides.set("femur_T1_left", -0.9 * u);
          f.anim.overrides.set("tibia_T1_left", 0.5 * u);
          f.anim.overrides.set("head", 0.25 * u);
        }
        f.anim.update(dt);
      }

      // Glide between the seat view and the close look at the desk.
      // Narrow screens open the vertical field so the hand still fits across.
      const preset = PRESETS[viewRef.current];
      const forAspect = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(78) / 2) / camera.aspect)) * 180 / Math.PI;
      wantPos.set(...preset.pos); wantLook.set(...preset.look); wantFov = Math.min(105, Math.max(preset.fov, forAspect));
      const ck = Math.min(1, dt * 4);
      if (camRig.position.distanceToSquared(wantPos) > 1e-8 || Math.abs(camera.fov - wantFov) > 0.01) {
        camRig.position.lerp(wantPos, ck);
        camLookLocal.lerp(wantLook, ck);
        camera.fov += (wantFov - camera.fov) * ck;
        camera.updateProjectionMatrix();
        seats[0].localToWorld(camLook.copy(camLookLocal));
        camera.quaternion.copy(baseQuat);           // lookAt from a clean orientation
        camera.lookAt(camLook);
        baseQuat.copy(camera.quaternion);
      }

      // A little parallax with the mouse, like leaning in.
      mouseSmooth.lerp(mouse, Math.min(1, dt * 5));
      yawQ.setFromAxisAngle(tmpV.set(0, 1, 0), -mouseSmooth.x * 0.10);
      pitchQ.setFromAxisAngle(tmpV.set(1, 0, 0), mouseSmooth.y * 0.06);
      camera.quaternion.copy(tmpQ.copy(baseQuat).premultiply(pitchQ).premultiply(yawQ));

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      renderer.domElement.removeEventListener("click", onClick);
      for (const f of flies) f.rig.dispose();
      for (const t of [...Object.values(wood), ...Object.values(velvet)]) t.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!meshes.has(m.userData?.tileId) && !flies.some((f) => f.rig.mesh === m)) {
          m.geometry?.dispose?.();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
        }
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [store, me]);

  return <div ref={host} className={className} />;
}
