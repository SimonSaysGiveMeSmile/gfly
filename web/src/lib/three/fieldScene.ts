/**
 * Outdoors, at the creature's own scale. The garden light probe is the sky
 * and the light; a sun throws shadows; the ground is a lawn. One creature
 * stands on it, walks where the game sends it and reaches when it plays.
 * The camera is the visitor's eyes: a rig the room can anchor and turn, so
 * a room can stand you behind your ball or at your baseline. Games put
 * their own things on the ground; this class owns the renderer, lights,
 * lawn, creature, camera presets and picking, like TableScene does for
 * the rooms with a table.
 */
import * as THREE from "three";
import { loadBackdrop, loadEnvironment } from "./env";
import { loadBody, type Body, type BodyKind } from "./body";
import type { Preset } from "./tableScene";

export const CREATURE_SCALE = 0.22;            // a 22 cm creature, the same one that sits at the tables
export const WALK = 0.9;                       // metres per second on the ground, a brisk human pace at this scale

export interface FieldOptions {
  body: BodyKind;
  /** Camera presets, local to the rig (y from the ground). */
  presets: Record<string, Preset>;
  view: string;
  /** Where the creature starts and which way it faces (yaw about y; 0 faces −z). */
  creature: { pos: [number, number, number]; yaw: number };
  lawn?: number;
}

export interface Creature { body: Body; goal: THREE.Vector3; yaw: number; faceYaw: number; reach: number }

export class FieldScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** The camera rig: move and turn it to stand the visitor somewhere. Presets are local to it. */
  readonly rig = new THREE.Group();
  creature: Creature | null = null;
  pickables: THREE.Object3D[] = [];
  onPick: (id: number) => void = () => {};
  onHover: (id: number | null) => void = () => {};
  onFrame: (dt: number) => void = () => {};
  view: string;
  private hovered: number | null = null;
  private disposed = false;
  private raf = 0;
  private readonly ro: ResizeObserver;
  private readonly camLookLocal: THREE.Vector3;
  private readonly baseQuat: THREE.Quaternion;
  private readonly mouse = new THREE.Vector2();
  private readonly mouseSmooth = new THREE.Vector2();
  private readonly presets: Record<string, Preset>;
  private readonly listeners: [string, (e: never) => void][] = [];

  constructor(readonly el: HTMLElement, readonly opts: FieldOptions) {
    this.presets = opts.presets;
    this.view = opts.view;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = this.scene;
    scene.background = new THREE.Color(0x9fb8c8);
    scene.fog = new THREE.Fog(0x9db8a6, 5, 45);            // the far lawn fades into the garden's green
    loadEnvironment(renderer, "garden").then((env) => { if (!this.disposed) { scene.environment = env; scene.environmentIntensity = 0.9; } }).catch(() => {});
    loadBackdrop("garden").then((t) => { if (!this.disposed) { scene.background = t; scene.backgroundBlurriness = 0.08; scene.backgroundIntensity = 1.0; } }).catch(() => {});

    // Camera on its rig.
    const p0 = this.presets[this.view];
    const camera = new THREE.PerspectiveCamera(p0.fov, 1, 0.01, 60);
    this.camera = camera;
    scene.add(this.rig);
    const camPos = new THREE.Group();
    camPos.position.set(p0.pos[0], p0.pos[1], p0.pos[2]);
    this.rig.add(camPos);
    camPos.add(camera);
    this.camHolder = camPos;
    this.camLookLocal = new THREE.Vector3(p0.look[0], p0.look[1], p0.look[2]);
    const look = new THREE.Vector3();
    this.rig.localToWorld(look.copy(this.camLookLocal));
    camera.lookAt(look);
    this.baseQuat = camera.quaternion.clone();

    // The sun, and the sky's fill.
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.position.set(3, 6, 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -3; sun.shadow.camera.right = 3; sun.shadow.camera.top = 3; sun.shadow.camera.bottom = -3;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 20;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.sun = sun;
    scene.add(new THREE.HemisphereLight(0xbfd6ea, 0x3f5a2e, 0.55));

    // The lawn: a plain green with the velvet's nap for grain. Nothing here is drawn by hand.
    const tex = new THREE.TextureLoader();
    const vel = (f: string, rep: number) => { const t = tex.load(`/assets/tex/velour_velvet/${f}`); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); return t; };
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ color: opts.lawn ?? 0x4f8a3a, normalMap: vel("nor_gl.jpg", 360), roughnessMap: vel("rough.jpg", 360), roughness: 1 }),
    );
    lawn.rotation.x = -Math.PI / 2;
    lawn.receiveShadow = true;
    scene.add(lawn);

    // The creature.
    loadBody(opts.body).then((body) => {
      if (this.disposed) { body.dispose(); return; }
      body.setShadow(true);
      body.root.scale.setScalar(CREATURE_SCALE);
      const [x, y, z] = opts.creature.pos;
      body.root.position.set(x, y - body.footY * CREATURE_SCALE, z);
      body.root.rotation.y = Math.PI / 2 + opts.creature.yaw;      // +x forward -> -z, then the yaw
      scene.add(body.root);
      body.mode = "idle";
      this.creature = { body, goal: new THREE.Vector3(x, y, z), yaw: opts.creature.yaw, faceYaw: opts.creature.yaw, reach: 0 };
    }).catch((e) => console.error(e));

    // Pointing: hover to lift, click to pick, like the tables.
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
    const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3(), camLook = new THREE.Vector3(), step = new THREE.Vector3();
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      this.onFrame(dt);

      // The creature walks to its goal, turns to face its way, and settles facing where it was told.
      const c = this.creature;
      if (c) {
        const b = c.body;
        step.set(c.goal.x - b.root.position.x, 0, c.goal.z - b.root.position.z);
        const d = step.length();
        if (d > 0.01) {
          const yaw = Math.atan2(-step.x, -step.z);
          c.yaw = turnToward(c.yaw, yaw, dt * 6);
          const m = Math.min(d, WALK * dt);
          b.root.position.x += (step.x / d) * m; b.root.position.z += (step.z / d) * m;
          b.mode = "walk"; b.speed = 1;
        } else {
          c.yaw = turnToward(c.yaw, c.faceYaw, dt * 5);
          b.mode = "idle"; b.speed = 0;
        }
        b.root.rotation.y = Math.PI / 2 + c.yaw;
        if (c.reach > 0) c.reach = Math.max(0, c.reach - dt * 1.1);
        b.reach(c.reach);
        b.update(dt);
      }

      // Glide between camera presets, local to the rig.
      const preset = this.presets[this.view] ?? p0;
      const forAspect = (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(78) / 2) / camera.aspect)) * 180 / Math.PI;
      wantPos.set(preset.pos[0], preset.pos[1], preset.pos[2]);
      wantLook.set(preset.look[0], preset.look[1], preset.look[2]);
      const wantFov = Math.min(105, Math.max(preset.fov, forAspect));
      const ck = Math.min(1, dt * 4);
      if (camPos.position.distanceToSquared(wantPos) > 1e-8 || this.camLookLocal.distanceToSquared(wantLook) > 1e-8 || Math.abs(camera.fov - wantFov) > 0.01 || this.rigMoved) {
        this.rigMoved = false;
        camPos.position.lerp(wantPos, ck);
        this.camLookLocal.lerp(wantLook, ck);
        camera.fov += (wantFov - camera.fov) * ck;
        camera.updateProjectionMatrix();
        this.rig.updateMatrixWorld();
        this.rig.localToWorld(camLook.copy(this.camLookLocal));
        camera.quaternion.copy(this.baseQuat);
        camera.lookAt(camLook);
        this.baseQuat.copy(camera.quaternion);
      }
      this.mouseSmooth.lerp(this.mouse, Math.min(1, dt * 5));
      yawQ.setFromAxisAngle(tmpV.set(0, 1, 0), -this.mouseSmooth.x * 0.08);
      pitchQ.setFromAxisAngle(tmpV.set(1, 0, 0), this.mouseSmooth.y * 0.05);
      camera.quaternion.copy(tmpQ.copy(this.baseQuat).premultiply(pitchQ).premultiply(yawQ));

      renderer.render(scene, camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private readonly camHolder: THREE.Group;
  private readonly sun: THREE.DirectionalLight;
  private rigMoved = false;

  private on<K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) {
    this.renderer.domElement.addEventListener(type, fn);
    this.listeners.push([type, fn as (e: never) => void]);
  }

  /** Stand the visitor at `pos` on the ground, turned `yaw` (0 looks down −z). Glides. */
  place(pos: THREE.Vector3, yaw: number) {
    this.rig.position.lerp(pos, 0.2);
    let d = yaw - this.rig.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.rig.rotation.y += d * 0.2;
    this.rigMoved = true;
  }
  placeNow(pos: THREE.Vector3, yaw: number) { this.rig.position.copy(pos); this.rig.rotation.y = yaw; this.rigMoved = true; }

  /** Keep the sun's shadow box over the action. */
  lightAt(x: number, z: number) { this.sun.position.set(x + 3, 6, z + 2); this.sun.target.position.set(x, 0, z); }

  /** Send the creature to walk to (x, z) and face `yaw` when it gets there. */
  send(x: number, z: number, faceYaw: number) { const c = this.creature; if (c) { c.goal.set(x, 0, z); c.faceYaw = faceYaw; } }
  reach() { if (this.creature) this.creature.reach = 1; }
  /** Where the creature is right now (x, z on the ground). */
  creatureAt(): THREE.Vector3 | null { return this.creature ? this.creature.body.root.position.clone() : null; }

  toScreen(world: THREE.Vector3): { x: number; y: number } {
    const v = world.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }
  clearHover() { this.hovered = null; this.onHover(null); }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const [t, fn] of this.listeners) this.renderer.domElement.removeEventListener(t, fn as EventListener);
    if (this.creature) { this.creature.body.root.removeFromParent(); this.creature.body.dispose(); }
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

function turnToward(a: number, b: number, k: number) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + Math.sign(d) * Math.min(Math.abs(d), k);
}
