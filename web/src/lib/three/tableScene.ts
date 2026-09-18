/**
 * A table in first person, shared by every game room. You sit at the south
 * side; three creatures sit on stools at the other three, wearing the body
 * the visitor picked. The room around the table is one of two found sets:
 * the tea house (Poly Haven chinese_tea_table and stools under the garden
 * probe) or the saloon (round_wooden_table_01, bar stools, barrels and a
 * lantern under the cowboy_town_saloon probe). Games put their own things
 * on the table and lay them out from their state; this class owns the
 * renderer, lights, furniture, seats, creatures, camera presets and picking.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadBackdrop, loadEnvironment, type Probe } from "./env";
import { loadBody, type Body, type BodyKind } from "./body";

export interface Preset { pos: [number, number, number]; look: [number, number, number]; fov: number }

export interface TableOptions {
  body: BodyKind;
  set: "tea" | "saloon";
  /** Table cloth: shape, size in metres, and the found texture to use. */
  mat?: { shape: "square" | "round"; size: number; texture: "velvet" | "cloth"; color: number };
  /** Something for the creatures to wear. */
  hat?: "cowboy";
  /** Camera presets, positions relative to the table top (y is added to it). */
  presets: Record<string, Preset>;
  view: string;
  /** Seats that get a creature (1 east, 2 north, 3 west). */
  seated?: number[];
}

export interface Placed { pos: THREE.Vector3; quat: THREE.Quaternion }

const SETS = {
  tea: { probe: "garden" as Probe, tableTop: 0.4986 * 1.35, stoolTop: 0.63, stoolOut: 0.68, exposure: 0.95, lamp: 0xffd9a8, lampPower: 12, backdrop: 0.5, backRot: Math.PI },
  saloon: { probe: "saloon" as Probe, tableTop: 1.004, stoolTop: 0.96, stoolOut: 0.78, exposure: 0.9, lamp: 0xffc178, lampPower: 16, backdrop: 0.16, backRot: Math.PI * 0.5 },
};

export const CREATURE_SCALE = 0.22;    // a 22 cm creature. Real flies are 3 mm.

export interface Creature { seat: number; body: Body; reach: number }

export class TableScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Seat frames: 0 south (you), 1 east, 2 north, 3 west. Local -z faces the centre. */
  readonly seats: THREE.Group[];
  readonly tableTop: number;
  readonly creatures: Creature[] = [];
  /** Objects the visitor can point at; each carries userData.pickId. */
  pickables: THREE.Object3D[] = [];
  onPick: (id: number) => void = () => {};
  onHover: (id: number | null) => void = () => {};
  /** Called every frame before rendering. */
  onFrame: (dt: number) => void = () => {};
  view: string;
  private hovered: number | null = null;
  private disposed = false;
  private raf = 0;
  private readonly ro: ResizeObserver;
  private readonly camRig = new THREE.Group();
  private readonly camLookLocal: THREE.Vector3;
  private readonly baseQuat: THREE.Quaternion;
  private readonly mouse = new THREE.Vector2();
  private readonly mouseSmooth = new THREE.Vector2();
  private readonly presets: Record<string, Preset>;
  private readonly listeners: [string, (e: never) => void][] = [];
  private hat: THREE.Object3D | null = null;

  constructor(readonly el: HTMLElement, readonly opts: TableOptions) {
    const set = SETS[opts.set];
    this.tableTop = set.tableTop;
    this.presets = opts.presets;
    this.view = opts.view;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = set.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = this.scene;
    scene.background = new THREE.Color(0x0d0b09);
    loadEnvironment(renderer, set.probe).then((env) => { if (!this.disposed) { scene.environment = env; scene.environmentIntensity = 0.8; } }).catch(() => {});
    loadBackdrop(set.probe).then((t) => { if (!this.disposed) { scene.background = t; scene.backgroundBlurriness = 0.5; scene.backgroundIntensity = set.backdrop; scene.backgroundRotation.y = set.backRot; } }).catch(() => {});

    this.seats = [0, 1, 2, 3].map((s) => { const g = new THREE.Group(); g.rotation.y = s * Math.PI / 2; scene.add(g); return g; });

    // Camera: eye level for a creature standing on its stool.
    const p0 = this.presets[this.view];
    const camera = new THREE.PerspectiveCamera(p0.fov, 1, 0.02, 40);
    this.camera = camera;
    this.seats[0].add(this.camRig);
    this.camRig.position.set(p0.pos[0], this.tableTop + p0.pos[1], p0.pos[2]);
    this.camRig.add(camera);
    this.camLookLocal = new THREE.Vector3(p0.look[0], this.tableTop + p0.look[1], p0.look[2]);
    const look = new THREE.Vector3();
    this.seats[0].localToWorld(look.copy(this.camLookLocal));
    camera.lookAt(look);
    this.baseQuat = camera.quaternion.clone();

    // Light: a warm lamp over the table, the probe for everything else.
    const lamp = new THREE.SpotLight(set.lamp, set.lampPower, 5, Math.PI * 0.28, 0.65, 1.3);
    lamp.position.set(0.15, this.tableTop + 1.43, 0.1);
    lamp.target.position.set(0, this.tableTop, 0);
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
    scene.add(new THREE.HemisphereLight(opts.set === "saloon" ? 0xc9a47a : 0x8fa3c9, 0x2a1d12, 0.35));

    // Floor: dark boards.
    const texLoader = new THREE.TextureLoader();
    const wood = {
      map: texLoader.load("/assets/tex/wood_table_001/diffuse.jpg"),
      normalMap: texLoader.load("/assets/tex/wood_table_001/nor_gl.jpg"),
      roughnessMap: texLoader.load("/assets/tex/wood_table_001/rough.jpg"),
    };
    for (const t of Object.values(wood)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); }
    wood.map.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ ...wood, color: opts.set === "saloon" ? 0x5a4632 : 0x6b5a48, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // The cloth on the table.
    if (opts.mat) {
      const m = opts.mat;
      const dir = m.texture === "velvet" ? "velour_velvet" : "book_pattern";
      const cloth = {
        map: texLoader.load(`/assets/tex/${dir}/diffuse.jpg`),
        normalMap: texLoader.load(`/assets/tex/${dir}/nor_gl.jpg`),
        roughnessMap: texLoader.load(`/assets/tex/${dir}/rough.jpg`),
      };
      for (const t of Object.values(cloth)) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); }
      cloth.map.colorSpace = THREE.SRGBColorSpace;
      const geo = m.shape === "square" ? new THREE.BoxGeometry(m.size, 0.006, m.size) : new THREE.CylinderGeometry(m.size / 2, m.size / 2, 0.006, 64);
      const mat = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ ...cloth, color: m.color, roughness: 0.97 }));
      mat.position.y = this.tableTop + 0.003;
      mat.receiveShadow = true;
      scene.add(mat);
      const edge = new THREE.Mesh(
        m.shape === "square" ? new THREE.BoxGeometry(m.size + 0.04, 0.012, m.size + 0.04) : new THREE.CylinderGeometry(m.size / 2 + 0.02, m.size / 2 + 0.02, 0.012, 64),
        new THREE.MeshStandardMaterial({ color: 0x2b211a, roughness: 0.5, metalness: 0.05 }),
      );
      edge.position.y = this.tableTop - 0.001;
      scene.add(edge);
    }

    // Furniture from Poly Haven.
    const gltf = new GLTFLoader();
    const prep = (o: THREE.Object3D) => o.traverse((mm) => { if ((mm as THREE.Mesh).isMesh) { mm.castShadow = true; mm.receiveShadow = true; } });
    const add = (url: string, fn: (o: THREE.Object3D) => void) =>
      gltf.loadAsync(url).then((g) => { if (this.disposed) return; prep(g.scene); fn(g.scene); }).catch((e) => console.error(e));
    const seated = opts.seated ?? [1, 2, 3];
    if (opts.set === "tea") {
      add("/assets/models/chinese_tea_table/chinese_tea_table.gltf", (o) => { o.scale.setScalar(1.35); scene.add(o); });
      add("/assets/models/chinese_stool/chinese_stool.gltf", (o) => {
        for (const s of seated) { const st = o.clone(); st.position.set(0, 0, s === 2 ? 0.74 : 0.68); this.seats[s].add(st); }
      });
      add("/assets/models/chinese_armchair/chinese_armchair.gltf", (o) => { o.position.set(-2.4, 0, -2.6); o.rotation.y = Math.PI * 0.3; scene.add(o); });
    } else {
      add("/assets/models/round_wooden_table_01/round_wooden_table_01.gltf", (o) => scene.add(o));
      add("/assets/models/bar_chair_round_01/bar_chair_round_01.gltf", (o) => {
        // Tall stools: the seat has to clear a metre-high table for a 22 cm creature to be seen over it.
        for (const s of seated) { const st = o.clone(); st.position.set(0, 0, 0.82); st.rotation.y = Math.PI; st.scale.set(1.15, set.stoolTop / 0.75, 1.15); this.seats[s].add(st); }
      });
      add("/assets/models/wine_barrel_01/wine_barrel_01.gltf", (o) => {
        const a = o.clone(); a.position.set(-2.2, 0, -2.4); scene.add(a);
        const b = o.clone(); b.position.set(-2.9, 0, -2.0); b.rotation.y = 0.7; scene.add(b);
        const c = o.clone(); c.position.set(2.6, 0, -2.3); scene.add(c);
      });
      add("/assets/models/wine_bottles_01/wine_bottles_01.gltf", (o) => { o.position.set(-2.5, 0.872, -2.35); o.rotation.y = 0.4; scene.add(o); });
      add("/assets/models/vintage_oil_lamp/vintage_oil_lamp.gltf", (o) => {
        o.position.set(2.6, 0.872, -2.3); scene.add(o);
        const glow = new THREE.PointLight(0xffb060, 3, 4, 2); glow.position.set(2.6, 0.872 + 0.5, -2.3); scene.add(glow);
      });
      add("/assets/models/wooden_lantern_01/wooden_lantern_01.gltf", (o) => {
        // Off to one side so it lights the table without hiding whoever sits across from you.
        o.position.set(-0.42, this.tableTop, -0.3); o.scale.setScalar(0.55); scene.add(o);
        const glow = new THREE.PointLight(0xffb060, 2.5, 3, 2); glow.position.set(-0.42, this.tableTop + 0.18, -0.3); scene.add(glow);
      });
    }

    // The creatures, on their stools, facing the table.
    const hatReady = opts.hat ? gltf.loadAsync("/assets/models/cowboy_hat/cowboy_hat_02.glb").then((g) => { prep(g.scene); return g.scene; }) : Promise.resolve(null);
    Promise.all([Promise.all(seated.map(() => loadBody(opts.body))), hatReady]).then(([bodies, hat]) => {
      if (this.disposed) { bodies.forEach((b) => b.dispose()); return; }
      this.hat = hat;
      seated.forEach((s, i) => {
        const body = bodies[i];
        body.setShadow(true);
        body.root.scale.setScalar(CREATURE_SCALE);
        body.root.position.set(0, set.stoolTop - body.footY * CREATURE_SCALE, s === 2 ? set.stoolOut + 0.04 : set.stoolOut - 0.02);
        body.root.rotation.y = Math.PI / 2;            // +x forward -> -z, toward the table
        this.seats[s].add(body.root);
        body.mode = "idle";
        if (hat) {
          const h = hat.clone();
          h.scale.setScalar(0.30);
          h.rotation.y = Math.PI / 2;                   // brim's long axis along the body
          h.position.y = -0.02;
          body.head.add(h);
        }
        this.creatures.push({ seat: s, body, reach: 0 });
      });
    }).catch((e) => console.error(e));

    // Pointing. A mouse lifts by hovering and picks with a click; a finger
    // has no hover, so the first tap selects and a second tap on the same
    // thing picks it.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hitAt = (x: number, y: number): number | null => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(this.pickables, true)[0];
      if (!hit) return null;
      let o: THREE.Object3D | null = hit.object;
      while (o && o.userData.pickId === undefined) o = o.parent;
      return o ? (o.userData.pickId as number) : null;
    };
    const setHover = (id: number | null) => {
      if (id === this.hovered) return;
      this.hovered = id;
      this.onHover(id);
      renderer.domElement.style.cursor = id !== null ? "pointer" : "default";
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = renderer.domElement.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      setHover(hitAt(e.clientX, e.clientY));
    };
    const onLeave = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; this.mouse.set(0, 0); setHover(null); };
    const onClick = (e: MouseEvent) => {
      const id = hitAt(e.clientX, e.clientY);
      if (id === null) { setHover(null); return; }
      if (id === this.hovered) this.onPick(id); else setHover(id);
    };
    this.on("pointermove", onMove); this.on("pointerleave", onLeave); this.on("click", onClick);
    renderer.domElement.style.touchAction = "none";

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    this.ro = new ResizeObserver(resize);
    this.ro.observe(el);
    resize();

    let last = performance.now();
    const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), yawQ = new THREE.Quaternion(), pitchQ = new THREE.Quaternion();
    const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3(), camLook = new THREE.Vector3();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000); last = now;

      this.onFrame(dt);

      // The creatures fidget; the one who just played reaches over the table.
      for (const c of this.creatures) {
        if (c.reach > 0) c.reach = Math.max(0, c.reach - dt * 1.1);
        c.body.reach(c.reach);
        c.body.update(dt);
      }

      // Glide between camera presets. Narrow screens open the vertical
      // field so what is in front of you still fits across.
      const preset = this.presets[this.view] ?? p0;
      const forAspect = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(78) / 2) / camera.aspect)) * 180 / Math.PI;
      wantPos.set(preset.pos[0], this.tableTop + preset.pos[1], preset.pos[2]);
      wantLook.set(preset.look[0], this.tableTop + preset.look[1], preset.look[2]);
      const wantFov = Math.min(105, Math.max(preset.fov, forAspect));
      const ck = Math.min(1, dt * 4);
      if (this.camRig.position.distanceToSquared(wantPos) > 1e-8 || Math.abs(camera.fov - wantFov) > 0.01) {
        this.camRig.position.lerp(wantPos, ck);
        this.camLookLocal.lerp(wantLook, ck);
        camera.fov += (wantFov - camera.fov) * ck;
        camera.updateProjectionMatrix();
        this.seats[0].localToWorld(camLook.copy(this.camLookLocal));
        camera.quaternion.copy(this.baseQuat);
        camera.lookAt(camLook);
        this.baseQuat.copy(camera.quaternion);
      }

      // A little parallax with the mouse, like leaning in.
      this.mouseSmooth.lerp(this.mouse, Math.min(1, dt * 5));
      yawQ.setFromAxisAngle(tmpV.set(0, 1, 0), -this.mouseSmooth.x * 0.10);
      pitchQ.setFromAxisAngle(tmpV.set(1, 0, 0), this.mouseSmooth.y * 0.06);
      camera.quaternion.copy(tmpQ.copy(this.baseQuat).premultiply(pitchQ).premultiply(yawQ));

      renderer.render(scene, camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private on<K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) {
    this.renderer.domElement.addEventListener(type, fn);
    this.listeners.push([type, fn as (e: never) => void]);
  }

  /** World placement for something in a seat's frame. */
  place(seat: number, local: THREE.Vector3, rot: THREE.Quaternion): Placed {
    const g = this.seats[seat];
    return { pos: local.clone().applyQuaternion(g.quaternion).add(g.position), quat: g.quaternion.clone().multiply(rot) };
  }

  /** Screen position of a world point, for checks from outside. */
  toScreen(world: THREE.Vector3): { x: number; y: number } {
    const v = world.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  reach(seat: number) { const c = this.creatures.find((x) => x.seat === seat); if (c) c.reach = 1; }

  clearHover() { this.hovered = null; this.onHover(null); }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const [t, fn] of this.listeners) this.renderer.domElement.removeEventListener(t, fn as EventListener);
    for (const c of this.creatures) { c.body.root.removeFromParent(); c.body.dispose(); }
    this.hat?.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); (m.material as THREE.Material | undefined)?.dispose?.(); });
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
    });
    this.renderer.dispose();
    this.el.removeChild(this.renderer.domElement);
  }
}
