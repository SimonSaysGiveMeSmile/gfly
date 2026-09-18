/**
 * Loaders for the compiled anatomy: the official MaleCNS neuropil shells
 * (tools/build_brain_mesh.py). The fly lives in flyRig.ts.
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
