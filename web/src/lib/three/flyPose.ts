/**
 * Procedural motion for the articulated fly. Nothing here is learned or
 * simulated; it is the choreography a real fly's motor system would produce
 * for the commands the brain sends: a tripod walking gait, wingbeats, a
 * standing fidget. Joint directions are read off the rig's own axes so the
 * same code drives the left and right sides without hand-tuned signs.
 */
import * as THREE from "three";
import type { FlyRig, RigJoint } from "./flyRig";

export type FlyMode = "rest" | "walk" | "fly" | "idle";

interface Leg {
  id: string;
  swing: RigJoint; swingSign: number;
  /** Knee: +fold brings the foot in under the body, +up raises it. */
  femur: RigJoint; femurLift: number; femurUp: number;
  tibia: RigJoint; tibiaLift: number;
  /** Tripod phase, 0 or PI. */
  offset: number;
  left: boolean;
}

const LEG_IDS: [string, boolean, number][] = [
  ["T1_left", true, 0], ["T2_left", true, Math.PI], ["T3_left", true, 0],
  ["T1_right", false, Math.PI], ["T2_right", false, 0], ["T3_right", false, Math.PI],
];

const sign = (v: number) => (v < 0 ? -1 : 1);
/**
 * Wing poses, left-side joint values (the right is mirrored). The rest pose
 * folds the wings back over the abdomen; the beat is a stroke about a plane
 * out to the side. Found by measuring the rig, see tools/notes in the repo.
 */
let FOLD_YAW = 1.2, FOLD_PITCH = -0.52, FOLD_ROLL = 0.7;
let STROKE_MEAN = -0.1, STROKE_AMP = 1.0, PITCH_MEAN = -0.07, PITCH_AMP = 0.7, ROLL_MEAN = -0.2;
export function setWingPoses(p: Partial<Record<"foldYaw" | "foldPitch" | "foldRoll" | "strokeMean" | "strokeAmp" | "pitchMean" | "pitchAmp" | "rollMean", number>>) {
  FOLD_YAW = p.foldYaw ?? FOLD_YAW; FOLD_PITCH = p.foldPitch ?? FOLD_PITCH; FOLD_ROLL = p.foldRoll ?? FOLD_ROLL;
  STROKE_MEAN = p.strokeMean ?? STROKE_MEAN; STROKE_AMP = p.strokeAmp ?? STROKE_AMP;
  PITCH_MEAN = p.pitchMean ?? PITCH_MEAN; PITCH_AMP = p.pitchAmp ?? PITCH_AMP; ROLL_MEAN = p.rollMean ?? ROLL_MEAN;
}
const v = new THREE.Vector3(), w = new THREE.Vector3();

export class FlyAnimator {
  mode: FlyMode = "rest";
  /** Walking effort 0..1 and turn -1..1 (positive = left). */
  speed = 0;
  turn = 0;
  /** Manual joint values that win over the choreography. */
  readonly overrides = new Map<string, number>();
  /** Visual wingbeat frequency, Hz. Real flies beat at 200 Hz; that is a blur. */
  wingHz = 16;

  private t = 0;
  private gait = 0;
  private wing = 0;
  private open = 0;             // wings unfolded 0..1
  private readonly legs: Leg[] = [];
  private readonly target = new Map<string, number>();
  private readonly mirror = new Map<string, number>();
  private readonly wingFwd: Record<"left" | "right", number> = { left: 1, right: 1 };
  private fidgetSeed = Math.random() * 100;

  constructor(readonly rig: FlyRig) {
    for (const [id, left, offset] of LEG_IDS) {
      const coxa = rig.restPositions.get(`coxa_${id}`)!, femur = rig.restPositions.get(`femur_${id}`)!;
      const tibia = rig.restPositions.get(`tibia_${id}`)!, tarsus = rig.restPositions.get(`tarsus_${id}`)!;
      const claw = rig.restPositions.get(`claw_${id}`)!;
      // Of the coxa's three hinges, the one closest to vertical swings the
      // leg fore and aft. Its sign follows from which way the tip moves.
      const coxaJoints = rig.jointList.filter((j) => j.body === `coxa_${id}`);
      const swing = coxaJoints.reduce((a, b) => (Math.abs(b.restAxis.z) > Math.abs(a.restAxis.z) ? b : a));
      v.subVectors(tibia, coxa); w.crossVectors(swing.restAxis, v);
      const swingSign = sign(w.x);
      const fj = rig.joints.get(`femur_${id}`)!, tj = rig.joints.get(`tibia_${id}`)!;
      // "Lift" is the direction that folds the leg towards the body: the
      // knee brings the foot in under the thorax, the shin folds back on
      // the thigh. Both come from which way the far end moves.
      v.subVectors(tarsus, femur); w.crossVectors(fj.restAxis, v);
      const femurUp = sign(w.z);
      const femurLift = sign(w.dot(v.copy(tarsus).negate()));
      v.subVectors(claw, tibia); w.crossVectors(tj.restAxis, v);
      const tibiaLift = sign(w.dot(v.subVectors(coxa, claw)));
      this.legs.push({ id, swing, swingSign, femur: fj, femurLift, femurUp, tibia: tj, tibiaLift, offset, left });
    }
    // Mirror rule. Reflecting a rotation (theta about a) across the body's
    // midplane gives (-theta about M a). So if the right twin's axis is
    // -M a, the same angle poses both sides symmetrically; if it is +M a,
    // the angle flips.
    for (const j of rig.jointList) {
      if (!j.name.endsWith("_left")) continue;
      const r = rig.joints.get(j.name.replace(/_left$/, "_right"));
      if (!r) continue;
      const d = j.restAxis.x * r.restAxis.x - j.restAxis.y * r.restAxis.y + j.restAxis.z * r.restAxis.z;
      this.mirror.set(r.name, -sign(d));
    }
    // A left wing sweeps forward by turning clockwise seen from above.
    for (const side of ["left", "right"] as const) {
      const yaw = rig.joints.get(`wing_yaw_${side}`)!;
      this.wingFwd[side] = (side === "left" ? -1 : 1) * sign(yaw.restAxis.z);
    }
  }

  /** Symmetric pose helper: value for the left joint, mirrored to the right. */
  private pair(leftName: string, value: number) {
    this.target.set(leftName, value);
    const rn = leftName.replace(/_left$/, "_right");
    this.target.set(rn, value * (this.mirror.get(rn) ?? 1));
  }

  update(dt: number) {
    dt = Math.min(0.1, dt);
    this.t += dt;
    const tg = this.target;
    tg.clear();

    const flying = this.mode === "fly";
    this.open += ((flying ? 1 : 0) - this.open) * Math.min(1, dt * 12);
    if (this.open > 0.001) this.wing += dt * this.wingHz * Math.PI * 2;

    // ---- wings and halteres --------------------------------------------
    // At rest the wings lie folded back over the abdomen. Flight unfolds
    // them and beats them about a stroke plane out to the side.
    const o = this.open, p = this.wing;
    const stroke = Math.sin(p), rot = Math.cos(p);
    {
      const f = this.wingFwd.left;
      this.pair("wing_yaw_left", (-f * FOLD_YAW) * (1 - o) + f * (STROKE_MEAN + STROKE_AMP * stroke) * o);
      this.pair("wing_pitch_left", FOLD_PITCH * (1 - o) + (PITCH_MEAN + PITCH_AMP * rot) * o);
      this.pair("wing_roll_left", FOLD_ROLL * (1 - o) + (ROLL_MEAN + 0.2 * Math.sin(2 * p)) * o);
      // Bank into turns: the outside wing takes a slightly bigger stroke.
      if (o > 0.001 && this.turn !== 0) {
        const outside = this.turn > 0 ? "wing_yaw_right" : "wing_yaw_left";
        tg.set(outside, tg.get(outside)! * (1 + 0.15 * Math.abs(this.turn)));
      }
    }
    if (o > 0.001) this.pair("haltere_left", 0.18 * Math.sin(p + Math.PI));

    // ---- legs -----------------------------------------------------------
    if (flying) {
      // Tucked: femur up, tibia folded, front legs forward.
      for (const L of this.legs) {
        const fwd = L.id.startsWith("T1") ? 0.45 : L.id.startsWith("T3") ? -0.4 : 0;
        tg.set(L.swing.name, L.swingSign * fwd * this.open);
        tg.set(L.femur.name, L.femurLift * 1.0 * this.open);
        tg.set(L.tibia.name, L.tibiaLift * 0.9 * this.open);
      }
    } else if (this.mode === "walk" && this.speed > 0.02) {
      const s = Math.min(1, this.speed);
      const hz = 1.5 + 7 * s;
      this.gait += dt * hz * Math.PI * 2;
      const amp = 0.22 + 0.22 * s, lift = 0.35 + 0.25 * s, duty = 0.58;
      for (const L of this.legs) {
        // The inside legs of a turn take shorter steps.
        const inside = (L.left && this.turn > 0) || (!L.left && this.turn < 0);
        const a = amp * (inside ? 1 - 0.6 * Math.abs(this.turn) : 1 + 0.15 * Math.abs(this.turn));
        let ph = (this.gait + L.offset) % (Math.PI * 2);
        if (ph < 0) ph += Math.PI * 2;
        const u = ph / (Math.PI * 2);
        let swing: number, up: number;
        if (u < duty) { const k = u / duty; swing = a * (1 - 2 * k); up = 0; }
        else { const k = (u - duty) / (1 - duty); swing = a * (2 * k - 1); up = Math.sin(k * Math.PI) * lift; }
        tg.set(L.swing.name, L.swingSign * swing);
        tg.set(L.femur.name, L.femurUp * up * 0.6);
        tg.set(L.tibia.name, L.tibiaLift * up * 0.8);
      }
      // Antennae point into the walk, the abdomen bobs with the gait.
      this.pair("antenna_left", 0.15 * s);
      tg.set("abdomen", 0.04 * Math.sin(this.gait * 2));
    } else {
      // Standing. Small fidgets so it reads as alive.
      const t = this.t + this.fidgetSeed;
      this.pair("antenna_abduct_left", 0.12 * Math.sin(t * 1.3) + 0.06 * Math.sin(t * 4.7));
      tg.set("antenna_abduct_right", 0.12 * Math.sin(t * 1.1 + 2) * (this.mirror.get("antenna_abduct_right") ?? 1));
      tg.set("head_twist", 0.12 * Math.sin(t * 0.7));
      tg.set("head_abduct", 0.05 * Math.sin(t * 0.9 + 1));
      for (let i = 1; i <= 4; i++) tg.set(i === 1 ? "abdomen" : `abdomen_${i}`, 0.03 * Math.sin(t * 6.5 + i * 0.3));
      if (this.mode === "idle") {
        // A slow foreleg lift and shake, the start of a grooming bout.
        const cyc = t % 9;
        if (cyc > 6.5 && cyc < 8.2) {
          const k = (cyc - 6.5) / 1.7;
          const L = this.legs[0];
          const up = Math.sin(k * Math.PI);
          tg.set(L.swing.name, L.swingSign * 0.5 * up);
          tg.set(L.femur.name, L.femurUp * (0.7 * up + 0.12 * Math.sin(t * 40) * up));
          tg.set(L.tibia.name, L.tibiaLift * 1.1 * up);
        }
      }
    }

    for (const [k, val] of this.overrides) tg.set(k, val);

    // Wings snap to their target (they are supposed to be a blur); every other
    // joint eases so the pose never pops.
    const ease = Math.min(1, dt * 22);
    for (const j of this.rig.jointList) {
      const want = tg.get(j.name) ?? 0;
      const isWing = j.name.startsWith("wing_") || j.name.startsWith("haltere");
      const next = isWing ? want : j.value + (want - j.value) * ease;
      this.rig.set(j.name, next);
    }
  }
}
