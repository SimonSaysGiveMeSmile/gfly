import type { NeuronTable } from "./format";

export interface Manifest {
  dataset: string;
  license: string;
  source: string;
  neurons: number;
  columnCells: number;
  neuronFile: string;
  tiers: { threshold: number; file: string; edges: number; synapses: number; bytesGzip: number }[];
  types: string[];
  superclasses: string[];
  neurotransmitters: string[];
  ntSign: number[];
}

export const SIDE = { unknown: 0, left: 1, right: 2 } as const;

/** Indices of every neuron whose annotated type is exactly `name`. */
export function byType(nt: NeuronTable, m: Manifest, name: string): Uint32Array {
  const t = m.types.indexOf(name);
  if (t < 0) return new Uint32Array(0);
  const out: number[] = [];
  for (let i = 0; i < nt.n; i++) if (nt.type[i] === t) out.push(i);
  return Uint32Array.from(out);
}

/** Indices for several types at once. */
export function byTypes(nt: NeuronTable, m: Manifest, names: string[]): Uint32Array {
  const want = new Set<number>();
  for (const nm of names) {
    const t = m.types.indexOf(nm);
    if (t >= 0) want.add(t);
  }
  const out: number[] = [];
  for (let i = 0; i < nt.n; i++) if (want.has(nt.type[i])) out.push(i);
  return Uint32Array.from(out);
}

export function bySuperclass(nt: NeuronTable, m: Manifest, name: string): Uint32Array {
  const s = m.superclasses.indexOf(name);
  if (s < 0) return new Uint32Array(0);
  const out: number[] = [];
  for (let i = 0; i < nt.n; i++) if (nt.superclass[i] === s) out.push(i);
  return Uint32Array.from(out);
}

export function splitBySide(nt: NeuronTable, idx: ArrayLike<number>) {
  const left: number[] = [], right: number[] = [];
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    if (nt.side[i] === SIDE.left) left.push(i);
    else if (nt.side[i] === SIDE.right) right.push(i);
  }
  return { left: Uint32Array.from(left), right: Uint32Array.from(right) };
}

/**
 * The fly's image plane.
 *
 * Lamina monopolar cells carry the retinotopic column coordinates the release
 * ships as assignedOlHex1/2, one pair per ommatidium. Converting the hex axial
 * pair to a plane gives a per-eye array we can render a scene into: L1 takes
 * the ON channel, L2 the OFF channel, exactly as they do in the animal.
 */
export interface Retina {
  /** One entry per column. */
  columns: {
    /** Horizontal position within the eye, normalised -1..1 (front to back). */
    u: number;
    /** Vertical position within the eye, normalised -1..1 (down to up). */
    v: number;
    /** Neuron indices for the ON channel (L1) in this column. */
    on: number[];
    /** Neuron indices for the OFF channel (L2) in this column. */
    off: number[];
  }[];
  side: 1 | 2;
}

export function buildRetina(nt: NeuronTable, m: Manifest, side: 1 | 2): Retina {
  const l1 = m.types.indexOf("L1");
  const l2 = m.types.indexOf("L2");
  const cols = new Map<number, Retina["columns"][number]>();

  // Axial hex coordinates to a plane: the two column axes sit 60 degrees
  // apart, so the second contributes half a step across and a full step up.
  const place = (h1: number, h2: number) => {
    const x = h1 + h2 * 0.5;
    const y = h2 * 0.866;
    return { x, y };
  };

  for (let i = 0; i < nt.n; i++) {
    if (nt.side[i] !== side) continue;
    const isOn = nt.type[i] === l1;
    const isOff = nt.type[i] === l2;
    if (!isOn && !isOff) continue;
    const h1 = nt.hex1[i], h2 = nt.hex2[i];
    if (h1 < 0 || h2 < 0) continue;

    const key = h1 * 1000 + h2;
    let c = cols.get(key);
    if (!c) {
      const { x, y } = place(h1, h2);
      c = { u: x, v: y, on: [], off: [] };
      cols.set(key, c);
    }
    (isOn ? c.on : c.off).push(i);
  }

  // Normalise the plane to -1..1 on both axes so the caller can treat it as a
  // simple image regardless of how many columns were reconstructed.
  const list = [...cols.values()];
  if (list.length) {
    const us = list.map((c) => c.u), vs = list.map((c) => c.v);
    const u0 = Math.min(...us), u1 = Math.max(...us);
    const v0 = Math.min(...vs), v1 = Math.max(...vs);
    for (const c of list) {
      c.u = u1 > u0 ? ((c.u - u0) / (u1 - u0)) * 2 - 1 : 0;
      c.v = v1 > v0 ? ((c.v - v0) / (v1 - v0)) * 2 - 1 : 0;
    }
  }

  return { columns: list, side };
}

/** Everything the baseline experiment needs to wire the body to the brain. */
/** The mushroom body, the fly's learning centre, split the way its biology is. */
export interface MushroomBody {
  /** Kenyon cells: the sparse code for whatever the fly is looking at. */
  kc: Uint32Array;
  /** Output neurons. Cholinergic ones drive approach, glutamatergic ones avoidance (Aso et al. 2014). */
  approach: Uint32Array;
  avoid: Uint32Array;
  /** Dopamine neurons: PAM signal reward, PPL1 punishment. */
  pam: Uint32Array;
  ppl1: Uint32Array;
}

export function buildMushroomBody(nt: NeuronTable, m: Manifest): MushroomBody {
  const typesWith = (re: RegExp) => m.types.filter((t) => re.test(t));
  const kc = byTypes(nt, m, typesWith(/^KC/));
  const mbon = byTypes(nt, m, typesWith(/^MBON/));
  const ach = m.neurotransmitters.findIndex((n) => /acetyl|^ach/i.test(n));
  const glu = m.neurotransmitters.findIndex((n) => /glut/i.test(n));
  const approach: number[] = [], avoid: number[] = [];
  for (const i of mbon) {
    if (nt.nt[i] === ach) approach.push(i);
    else if (nt.nt[i] === glu) avoid.push(i);
  }
  return {
    kc, approach: Uint32Array.from(approach), avoid: Uint32Array.from(avoid),
    pam: byTypes(nt, m, typesWith(/^PAM/)), ppl1: byTypes(nt, m, typesWith(/^PPL1/)),
  };
}

export interface CircuitMap {
  retinaL: Retina;
  retinaR: Retina;
  /** Looming detectors, split by eye. */
  lplc2: { left: Uint32Array; right: Uint32Array };
  /** The Giant Fibre pair - the escape command neurons. */
  giantFiber: Uint32Array;
  /** DNa02, the steering descending neuron, one per side. */
  steerL: Uint32Array;
  steerR: Uint32Array;
  /** All descending neurons, split by side, used as the motor read-out. */
  descendingL: Uint32Array;
  descendingR: Uint32Array;
  /** Direction-selective motion cells. */
  t4: Uint32Array;
  t5: Uint32Array;
  /** The heading compass. */
  epg: Uint32Array;
}

export function buildCircuitMap(nt: NeuronTable, m: Manifest): CircuitMap {
  const dn = bySuperclass(nt, m, "descending_neuron");
  const dnSides = splitBySide(nt, dn);
  const lplc2 = splitBySide(nt, byType(nt, m, "LPLC2"));
  const steer = splitBySide(nt, byType(nt, m, "DNa02"));

  return {
    retinaL: buildRetina(nt, m, SIDE.left),
    retinaR: buildRetina(nt, m, SIDE.right),
    lplc2,
    giantFiber: byType(nt, m, "DNp01"),
    steerL: steer.left,
    steerR: steer.right,
    descendingL: dnSides.left,
    descendingR: dnSides.right,
    t4: byTypes(nt, m, ["T4a", "T4b", "T4c", "T4d"]),
    t5: byTypes(nt, m, ["T5a", "T5b", "T5c", "T5d"]),
    epg: byType(nt, m, "EPG"),
  };
}

/**
 * What a neuron is for, in six plain words. Built from the release's
 * superclass labels so every soma can be coloured by job.
 */
export const FUNCTION_GROUPS = [
  { id: "vision", label: "Vision", color: "#5ac8fa" },
  { id: "central", label: "Central brain", color: "#bf5af2" },
  { id: "sensory", label: "Senses", color: "#30d158" },
  { id: "command", label: "Command lines", color: "#ff9f0a" },
  { id: "motor", label: "Motor and body", color: "#ff453a" },
  { id: "other", label: "Other", color: "#8e8e93" },
] as const;

const GROUP_OF: Record<string, number> = {
  visual_projection: 0, visual_centrifugal: 0, ol_intrinsic: 0, ol_sensory: 0, visual_projection_tbc: 0,
  cb_intrinsic: 1,
  cb_sensory: 2, cb_sensory_tbc: 2, sensory_descending: 2, sensory_ascending: 2, sensory_ascending_tbc: 2, vnc_sensory: 2, vnc_sensory_tbc: 2,
  descending_neuron: 3, efferent_descending: 3, ascending_neuron: 3, efferent_ascending: 3,
  vnc_intrinsic: 4, vnc_motor: 4, vnc_efferent: 4, cb_motor: 4, cb_efferent: 4, vnc_tbc: 4,
};

/** Function group index per superclass index. */
export function groupTable(m: Manifest): Uint8Array {
  return Uint8Array.from(m.superclasses, (name) => GROUP_OF[name] ?? 5);
}
