/**
 * The animal bodies: found, rigged glTF models with their own clips
 * (Quaternius' shiba inu and cat, Gobkit's blue jay; see assets/LICENSE.md),
 * dressed up as a Body so every room can seat one in place of the fly.
 *
 * Each model is loaded once and cloned per body. On load it is measured and
 * turned so that it fits the Body frame: about one unit long, facing +x,
 * feet at footY. The clips drive it: idle at rest, walk or run on the move;
 * the bird has no flying clip, so in the air it hovers on its idle pose.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { Body, BodyJoint, BodyKind, BodyLimb, BodyMode } from "./body";

type AnimalKind = Exclude<BodyKind, "fly">;

const FILES: Record<AnimalKind, string> = {
  dog: "/assets/animals/dog/shiba_inu.glb",
  cat: "/assets/animals/cat/cat.glb",
  bird: "/assets/animals/bird/blue_jay.glb",
};

const cache = new Map<AnimalKind, Promise<GLTF>>();
function loadModel(kind: AnimalKind): Promise<GLTF> {
  let p = cache.get(kind);
  if (!p) { p = new GLTFLoader().loadAsync(FILES[kind]); cache.set(kind, p); }
  return p;
}

/** The clip whose name ends in one of these words, ignoring armature prefixes. */
function findClip(clips: THREE.AnimationClip[], ...names: string[]): THREE.AnimationClip | null {
  for (const n of names) {
    const c = clips.find((c) => c.name.split("|").pop()!.toLowerCase() === n.toLowerCase());
    if (c) return c;
  }
  return null;
}

/** World-space bounds that follow the skin, not just the bind pose. */
function measure(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!(m as THREE.Mesh).isMesh) return;
    const b = new THREE.Box3();
    if (m.isSkinnedMesh) { m.computeBoundingBox(); b.copy(m.boundingBox!); }
    else { m.geometry.computeBoundingBox(); b.copy(m.geometry.boundingBox!); }
    box.union(b.applyMatrix4(m.matrixWorld));
  });
  return box;
}

class AnimalBody implements Body {
  readonly root = new THREE.Group();
  readonly limbs: BodyLimb[] = [];
  readonly joints: BodyJoint[] = [];
  readonly overrides = new Map<string, number>();
  mode: BodyMode = "idle";
  speed = 0;
  turn = 0;
  readonly footY: number;
  readonly headY: number;
  readonly canFly: boolean;
  readonly head = new THREE.Object3D();
  private readonly pose = new THREE.Group();     // tilts for a reach; the model turns inside it
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips: { idle: THREE.AnimationAction | null; walk: THREE.AnimationAction | null; run: THREE.AnimationAction | null };
  private current: THREE.AnimationAction | null = null;
  private readonly headBone: THREE.Object3D | null;
  private readonly headLift: number;
  private reachU = 0;
  private t = Math.random() * 10;

  constructor(readonly kind: AnimalKind, gltf: GLTF) {
    this.canFly = kind === "bird";
    const model = cloneSkeleton(gltf.scene);
    this.model = model;
    this.pose.add(model);
    this.root.add(this.pose);

    // Measure, then scale to one unit long, centre it, and face +x. The head
    // bone says which way is forward.
    const box = measure(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const s = 1 / Math.max(size.x, size.z, 1e-6);
    this.headBone = model.getObjectByName("Head") ?? model.getObjectByName("Mouth") ?? model.getObjectByName("Neck1") ?? null;
    let yaw = 0;
    if (this.headBone) {
      const h = this.headBone.getWorldPosition(new THREE.Vector3());
      yaw = Math.atan2(h.z - centre.z, h.x - centre.x);
    } else if (size.z > size.x) yaw = Math.PI / 2;
    model.position.set(-centre.x, -box.min.y, -centre.z);
    const turn = new THREE.Group();
    turn.rotation.y = yaw;
    turn.scale.setScalar(s);
    this.pose.remove(model); turn.add(model); this.pose.add(turn);
    this.footY = 0;
    this.headY = size.y * s;
    this.headLift = 0.06;
    this.root.add(this.head);

    this.mixer = new THREE.AnimationMixer(model);
    const clips = gltf.animations;
    const act = (c: THREE.AnimationClip | null) => (c ? this.mixer.clipAction(c) : null);
    this.clips = {
      idle: act(findClip(clips, "Idle", "idle", "Idle_2")),
      walk: act(findClip(clips, "Walk", "walk")),
      run: act(findClip(clips, "Run", "Gallop", "run")),
    };
    this.play(this.clips.idle);
    this.update(0);
  }

  private play(a: THREE.AnimationAction | null) {
    if (!a || a === this.current) return;
    a.reset().setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(a, 0.25, false);
    this.current = a;
  }

  reach(u: number) { this.reachU = u; }
  setShadow(cast: boolean) { this.model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = cast; m.receiveShadow = cast; } }); }
  setVisible(v: boolean) { this.root.visible = v; }

  update(dt: number) {
    this.t += dt;
    const moving = this.mode === "walk" || (this.mode === "fly" && !this.canFly);
    const want = moving ? (this.speed > 0.65 && this.clips.run ? this.clips.run : this.clips.walk ?? this.clips.run) : this.clips.idle;
    this.play(want);
    if (this.current && moving) this.current.setEffectiveTimeScale(0.6 + this.speed);
    else if (this.current) this.current.setEffectiveTimeScale(1);
    this.mixer.update(dt);

    // A bird in the air hovers and banks into its turns; on the ground the pose is level.
    const flying = this.mode === "fly" && this.canFly;
    const reach = Math.sin(this.reachU * Math.PI);
    this.pose.position.y = flying ? 0.05 * Math.sin(this.t * 6) : 0;
    this.pose.rotation.z = -0.35 * reach + (flying ? -0.15 : 0);
    this.pose.rotation.x = flying ? -0.4 * this.turn : 0;

    // The hat rides on the head, wherever the clip has put it.
    if (this.headBone) {
      this.root.worldToLocal(this.headBone.getWorldPosition(this.head.position));
      this.head.position.y += this.headLift;
    } else this.head.position.set(0.35, this.headY, 0);
  }

  dispose() { this.mixer.stopAllAction(); this.root.removeFromParent(); }
}

export async function loadAnimalBody(kind: BodyKind): Promise<Body> {
  if (kind === "fly") throw new Error("the fly is not an animal body");
  return new AnimalBody(kind, await loadModel(kind));
}
