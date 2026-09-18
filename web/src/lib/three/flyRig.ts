/**
 * The articulated fly: flybody's kinematic tree rebuilt as a three.js
 * skeleton (tools/build_fly_rig.py). One skinned mesh per fly, 68 bones, 102
 * hinge joints you can set by name. Several flies can share one geometry.
 */
import * as THREE from "three";
import { fetchBlock } from "@/lib/sim/format";

interface JointDef { name: string; axis: [number, number, number]; range: [number, number] }
interface BodyDef { name: string; parent: number; pos: [number, number, number]; quat: [number, number, number, number]; joints: JointDef[] }
interface RigHeader { scale: number; materials: { name: string; rgba: [number, number, number, number] }[]; bodies: BodyDef[] }

export interface FlyRigData {
  header: RigHeader;
  /** Bind-pose geometry with skinIndex/skinWeight, colour and alpha attributes. */
  geometry: THREE.BufferGeometry;
}

export interface RigJoint {
  name: string;
  body: string;
  /** Axis in the joint's own frame. */
  axis: THREE.Vector3;
  /** Axis in the fly's frame (x forward, y left, z up) at rest. */
  restAxis: THREE.Vector3;
  range: [number, number];
  node: THREE.Object3D;
  value: number;
}

let cache: Promise<FlyRigData> | null = null;

export function loadFlyRigData(url = "/fly/fly-rig.bin.gz"): Promise<FlyRigData> {
  if (!cache) cache = fetchRig(url).catch((e) => { cache = null; throw e; });
  return cache;
}

async function fetchRig(url: string): Promise<FlyRigData> {
  const buf = await fetchBlock(url);
  const got = new TextDecoder().decode(new Uint8Array(buf, 0, 8));
  if (got !== "GFLYR001") throw new Error(`bad rig file: ${got}`);
  let o = 8;
  const hlen = new Uint32Array(buf, o, 1)[0]; o += 4;
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, o, hlen))) as RigHeader;
  o += hlen + ((4 - (hlen % 4)) % 4);
  const [nv, nf] = new Uint32Array(buf, o, 2); o += 8;
  const pos = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const nrm = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const mat = new Uint8Array(buf, o, nv); o += nv + ((4 - (nv % 4)) % 4);
  const bone = new Uint8Array(buf, o, nv); o += nv + ((4 - (nv % 4)) % 4);
  const idx = new Uint32Array(buf, o, nf * 3);

  const col = new Float32Array(nv * 3), alpha = new Float32Array(nv);
  const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) {
    const [r, g, b, a] = header.materials[mat[i]]?.rgba ?? [0.6, 0.4, 0.2, 1];
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; alpha[i] = a;
    skinIndex[i * 4] = bone[i]; skinWeight[i * 4] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  g.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
  g.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return { header, geometry: g };
}

/** Standard fly material: vertex colours, membrane alpha in its own attribute. */
export function makeFlyMaterial(opts: { roughness?: number; emissive?: number } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: opts.roughness ?? 0.55, metalness: 0.05, transparent: true,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
  });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float alpha; varying float vAlpha;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlpha = alpha;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vAlpha;")
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );");
  };
  return mat;
}

/** Bodies whose joints belong together on screen. */
export const LIMBS: { id: string; label: string; match: (joint: string) => boolean }[] = [
  { id: "head", label: "Head", match: (j) => /^head/.test(j) },
  { id: "proboscis", label: "Proboscis", match: (j) => /^(rostrum|haustellum|labrum)/.test(j) },
  { id: "antennae", label: "Antennae", match: (j) => /^antenna/.test(j) },
  { id: "wingL", label: "Left wing", match: (j) => /^wing_.*_left$/.test(j) },
  { id: "wingR", label: "Right wing", match: (j) => /^wing_.*_right$/.test(j) },
  { id: "halteres", label: "Halteres", match: (j) => /^haltere/.test(j) },
  { id: "abdomen", label: "Abdomen", match: (j) => /^abdomen/.test(j) },
  { id: "legT1L", label: "Front left leg", match: (j) => /_T1_left$/.test(j) },
  { id: "legT1R", label: "Front right leg", match: (j) => /_T1_right$/.test(j) },
  { id: "legT2L", label: "Middle left leg", match: (j) => /_T2_left$/.test(j) },
  { id: "legT2R", label: "Middle right leg", match: (j) => /_T2_right$/.test(j) },
  { id: "legT3L", label: "Hind left leg", match: (j) => /_T3_left$/.test(j) },
  { id: "legT3R", label: "Hind right leg", match: (j) => /_T3_right$/.test(j) },
];

export class FlyRig {
  /** Put this in the scene. Its frame is three's: x forward, y up, z right. */
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bodies = new Map<string, THREE.Bone>();
  readonly joints = new Map<string, RigJoint>();
  readonly jointList: RigJoint[] = [];
  /** Rest-pose position of every body in the fly frame (x forward, y left, z up). */
  readonly restPositions = new Map<string, THREE.Vector3>();

  constructor(data: FlyRigData, material: THREE.Material = makeFlyMaterial()) {
    const { header, geometry } = data;
    // MuJoCo (x fwd, y left, z up) -> three (x fwd, y up, z right): -90 deg about x.
    const frame = new THREE.Group();
    frame.rotation.x = -Math.PI / 2;
    this.root.add(frame);

    const bones: THREE.Bone[] = [];
    const leaves: THREE.Object3D[] = [];
    header.bodies.forEach((b) => {
      const bone = new THREE.Bone();
      bone.name = b.name;
      bone.position.set(b.pos[0], b.pos[1], b.pos[2]);
      bone.quaternion.set(b.quat[1], b.quat[2], b.quat[3], b.quat[0]);
      if (b.parent >= 0) leaves[b.parent].add(bone);
      let leaf: THREE.Object3D = bone;
      for (const j of b.joints) {
        const node = new THREE.Bone();
        node.name = j.name;
        leaf.add(node);
        leaf = node;
        const joint: RigJoint = {
          name: j.name, body: b.name, axis: new THREE.Vector3(...j.axis), restAxis: new THREE.Vector3(),
          range: j.range, node, value: 0,
        };
        this.joints.set(j.name, joint);
        this.jointList.push(joint);
      }
      // The skinned vertices follow the body after all of its joints.
      bones.push(leaf as THREE.Bone);
      leaves.push(leaf);
      this.bodies.set(b.name, leaf as THREE.Bone);
    });

    // Before anything is placed in a scene the bone matrices are in the
    // fly's own frame. Record rest positions and joint axes there, for
    // controllers that want to know which way a hinge actually swings.
    bones[0].updateWorldMatrix(false, true);
    const q = new THREE.Quaternion();
    for (const j of this.jointList) {
      j.node.parent!.getWorldQuaternion(q);
      j.restAxis.copy(j.axis).applyQuaternion(q).normalize();
    }
    for (const [name, b] of this.bodies) this.restPositions.set(name, new THREE.Vector3().setFromMatrixPosition(b.matrixWorld));

    this.mesh = new THREE.SkinnedMesh(geometry, material);
    this.mesh.add(bones[0]);
    this.mesh.bind(new THREE.Skeleton(bones));
    this.mesh.frustumCulled = false;
    frame.add(this.mesh);
  }

  set(name: string, value: number) {
    const j = this.joints.get(name);
    if (!j) return;
    const v = Math.max(j.range[0], Math.min(j.range[1], value));
    if (v === j.value) return;
    j.value = v;
    j.node.quaternion.setFromAxisAngle(j.axis, v);
  }

  get(name: string) { return this.joints.get(name)?.value ?? 0; }

  reset() { for (const j of this.jointList) this.set(j.name, 0); }

  dispose() {
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.skeleton.dispose();
  }
}
