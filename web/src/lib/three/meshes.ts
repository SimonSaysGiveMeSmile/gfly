/**
 * Loaders for the compiled anatomy: the official MaleCNS neuropil shells
 * (tools/build_brain_mesh.py) and the flybody fly (tools/build_fly_mesh.py).
 * Every array is a zero-copy view over the gunzipped buffer.
 */
import * as THREE from "three";
import { fetchBlock } from "@/lib/sim/format";

function magic(buf: ArrayBuffer, want: string) {
  const got = new TextDecoder().decode(new Uint8Array(buf, 0, 8));
  if (got !== want) throw new Error(`bad mesh file: expected ${want}, got ${got}`);
}

/** A neuropil shell, vertices in 8 nm voxels like the soma table. */
export async function loadShell(url: string): Promise<THREE.BufferGeometry> {
  const buf = await fetchBlock(url);
  magic(buf, "GFLYM001");
  const [nv, nf] = new Uint32Array(buf, 8, 2);
  let o = 16;
  const pos = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const nrm = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const idx = new Uint32Array(buf, o, nf * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

export interface FlyMesh {
  geometry: THREE.BufferGeometry;
  /** RGBA per material index. */
  materials: [number, number, number, number][];
}

/** The fly body, unit-length, MuJoCo axes (x forward, y left, z up). */
export async function loadFly(url: string): Promise<FlyMesh> {
  const buf = await fetchBlock(url);
  magic(buf, "GFLYF001");
  const [nv, nf, nm] = new Uint32Array(buf, 8, 3);
  let o = 20;
  const materials: FlyMesh["materials"] = [];
  for (let i = 0; i < nm; i++) {
    const c = new Float32Array(buf, o, 4); o += 16;
    materials.push([c[0], c[1], c[2], c[3]]);
  }
  const pos = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const nrm = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const mat = new Uint8Array(buf, o, nv); o += nv;
  o += (4 - (nv % 4)) % 4;
  const idx = new Uint32Array(buf, o, nf * 3);

  // Convert MuJoCo (x forward, y left, z up) to three (x forward, y up, z right).
  const p2 = new Float32Array(nv * 3), n2 = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    p2[i * 3] = pos[i * 3];     p2[i * 3 + 1] = pos[i * 3 + 2];  p2[i * 3 + 2] = -pos[i * 3 + 1];
    n2[i * 3] = nrm[i * 3];     n2[i * 3 + 1] = nrm[i * 3 + 2];  n2[i * 3 + 2] = -nrm[i * 3 + 1];
  }
  // Bake material colour into a vertex colour so one draw call renders the
  // whole fly; the membrane alpha is carried in a separate attribute.
  const col = new Float32Array(nv * 3), alpha = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    const [r, g, b, a] = materials[mat[i]] ?? [0.6, 0.4, 0.2, 1];
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; alpha[i] = a;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p2, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(n2, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return { geometry: g, materials };
}
