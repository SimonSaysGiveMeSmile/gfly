/**
 * The body pack. Every experiment puts a creature in the world through this
 * one interface, so the fruit fly can be swapped for a friendlier animal
 * without the rooms knowing. The fly is the flybody rig with its own gait;
 * the animals are found, rigged glTF models driven by their own clips. Both
 * expose a list of joints a person can move by hand.
 *
 * Frame: the root faces +x, y is up, and the body is about one unit long.
 */
import * as THREE from "three";
import { FlyRig, LIMBS, loadFlyRigData } from "./flyRig";
import { FlyAnimator, type FlyMode } from "./flyPose";

export type BodyKind = "fly" | "dog" | "cat" | "bird";
export type BodyMode = FlyMode;

export interface BodyJoint { name: string; range: [number, number]; limb: string }
export interface BodyLimb { id: string; labelKey: string }

export interface Body {
  readonly kind: BodyKind;
  readonly root: THREE.Object3D;
  readonly limbs: BodyLimb[];
  readonly joints: BodyJoint[];
  /** Manual joint values that win over the choreography. */
  readonly overrides: Map<string, number>;
  mode: BodyMode;
  /** Walking effort 0..1 and turn -1..1 (positive = left). */
  speed: number;
  turn: number;
  /** Lowest point of the feet, in root units (negative), so it can stand on a floor. */
  readonly footY: number;
  /** Height of the head, in root units. */
  readonly headY: number;
  /** Can this body fly? Ground animals stay down and run instead. */
  readonly canFly: boolean;
  /** Rides on the head: x forward, y up, root units. Hats go here. */
  readonly head: THREE.Object3D;
  /** Reach a front limb across the table, u in 0..1. */
  reach(u: number): void;
  setShadow(cast: boolean): void;
  setVisible(v: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

/* ---- the fly ------------------------------------------------------------ */

class FlyBody implements Body {
  readonly kind = "fly" as const;
  readonly root: THREE.Object3D;
  readonly limbs: BodyLimb[];
  readonly joints: BodyJoint[];
  readonly overrides = new Map<string, number>();
  mode: BodyMode = "idle";
  speed = 0;
  turn = 0;
  readonly footY: number;
  readonly headY: number;
  readonly canFly = true;
  readonly head: THREE.Object3D;
  private readonly anim: FlyAnimator;
  private reachU = 0;

  constructor(readonly rig: FlyRig) {
    this.root = rig.root;
    this.anim = new FlyAnimator(rig);
    this.limbs = LIMBS.map((l) => ({ id: l.id, labelKey: `limb.${l.id}` }));
    this.joints = rig.jointList.map((j) => ({ name: j.name, range: j.range, limb: LIMBS.find((l) => l.match(j.name))?.id ?? "other" }));
    let low = 0;
    for (const [n, p] of rig.restPositions) if (n.startsWith("claw")) low = Math.min(low, p.z);
    this.footY = low;
    this.headY = rig.restPositions.get("head")?.z ?? 0.2;
    // The head bone is in MuJoCo's frame (x forward, z up); turn it so y is up.
    this.head = new THREE.Object3D();
    this.head.rotation.x = Math.PI / 2;
    this.head.position.set(0.02, 0, 0.12);
    (rig.bodies.get("head") ?? rig.root).add(this.head);
  }
  reach(u: number) { this.reachU = u; }
  setShadow(cast: boolean) { this.rig.mesh.castShadow = cast; }
  setVisible(v: boolean) { this.rig.mesh.visible = v; }
  update(dt: number) {
    const a = this.anim;
    a.mode = this.mode; a.speed = this.speed; a.turn = this.turn;
    a.overrides.clear();
    if (this.reachU > 0) {
      const u = Math.sin(this.reachU * Math.PI);
      a.overrides.set("coxa_twist_T1_left", 0.55 * u);
      a.overrides.set("femur_T1_left", -0.9 * u);
      a.overrides.set("tibia_T1_left", 0.5 * u);
      a.overrides.set("head", 0.25 * u);
    }
    for (const [k, v] of this.overrides) a.overrides.set(k, v);
    a.update(dt);
  }
  dispose() { this.rig.dispose(); }
}

/* ---- loading ------------------------------------------------------------ */

/** Which bodies exist, for menus. Labels are i18n keys. */
export const BODIES: { id: BodyKind; labelKey: string }[] = [
  { id: "fly", labelKey: "body.fly" },
  { id: "dog", labelKey: "body.dog" },
  { id: "cat", labelKey: "body.cat" },
  { id: "bird", labelKey: "body.bird" },
];

/** A fresh body of the given kind. Each call is its own instance; the mesh data is shared. */
export async function loadBody(kind: BodyKind): Promise<Body> {
  if (kind === "fly") return new FlyBody(new FlyRig(await loadFlyRigData()));
  const { loadAnimalBody } = await import("./animalBody");
  return loadAnimalBody(kind);
}
