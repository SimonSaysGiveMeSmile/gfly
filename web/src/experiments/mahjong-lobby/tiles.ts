/**
 * Tile materials. Faces are FluffyStuff's riichi-mahjong-tiles (CC0), drawn
 * onto the set's own ivory front; the back is the set's green back. One
 * geometry for every tile, one material array per kind.
 */
import * as THREE from "three";
import { KIND_NAMES } from "./engine";

/** Real tiles are 26 x 20 x 16 mm; these are a little larger for the eye. */
export const TILE_W = 0.027, TILE_H = 0.036, TILE_D = 0.018;

const SVG_W = 300, SVG_H = 400, SCALE = 2;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`could not load ${src}`));
    im.src = src;
  });
}

async function faceTexture(front: HTMLImageElement, glyph: HTMLImageElement | null, renderer: THREE.WebGLRenderer) {
  const c = document.createElement("canvas");
  c.width = SVG_W * SCALE; c.height = SVG_H * SCALE;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(front, 0, 0, c.width, c.height);
  if (glyph) ctx.drawImage(glyph, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export interface TileSet {
  geometry: THREE.BufferGeometry;
  /** Six materials per kind, in BoxGeometry group order: +x -x +y -y +z(face) -z(back). */
  materials: THREE.Material[][];
  dispose(): void;
}

let cache: Promise<TileSet> | null = null;

export function loadTileSet(renderer: THREE.WebGLRenderer): Promise<TileSet> {
  if (!cache) cache = build(renderer).catch((e) => { cache = null; throw e; });
  return cache;
}

async function build(renderer: THREE.WebGLRenderer): Promise<TileSet> {
  const [front, back, ...glyphs] = await Promise.all([
    loadImage("/mahjong/tiles/Front.svg"), loadImage("/mahjong/tiles/Back.svg"),
    ...KIND_NAMES.map((n) => loadImage(`/mahjong/tiles/${n}.svg`)),
  ]);
  const backTex = await faceTexture(back, null, renderer);
  const ivory = new THREE.MeshPhysicalMaterial({ color: 0xf1e9d8, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  // The set's back is a hot orange; toned down so it does not blow out under the lamp.
  const green = new THREE.MeshPhysicalMaterial({ map: backTex, color: 0xb98a78, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  const materials: THREE.Material[][] = [];
  for (let k = 0; k < KIND_NAMES.length; k++) {
    const tex = await faceTexture(front, glyphs[k], renderer);
    const face = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    materials.push([ivory, ivory, ivory, ivory, face, green]);
  }
  const geometry = new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D);
  return {
    geometry, materials,
    dispose() {
      geometry.dispose();
      ivory.dispose(); green.dispose(); backTex.dispose();
      for (const m of materials) { const f = m[4] as THREE.MeshPhysicalMaterial; f.map?.dispose(); f.dispose(); }
    },
  };
}
