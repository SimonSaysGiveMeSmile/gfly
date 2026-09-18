/**
 * Small helpers the game rooms share for putting found art on the table:
 * SVG faces drawn into canvas textures, a plain highlight disc, and an
 * invisible pick plane per square. Nothing here is drawn by hand; the
 * pictures come from the CC0 / public-domain files under /assets.
 */
import * as THREE from "three";

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`could not load ${src}`));
    im.src = src;
  });
}

/** An SVG (or any image) as a texture, drawn at `w` x `h` pixels. */
export async function imageTexture(src: string, w: number, h: number, renderer: THREE.WebGLRenderer, under?: (ctx: CanvasRenderingContext2D) => void): Promise<THREE.CanvasTexture> {
  const im = await loadImage(src);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  under?.(ctx);
  ctx.drawImage(im, 0, 0, w, h);
  return canvasTexture(c, renderer);
}

export function canvasTexture(c: HTMLCanvasElement, renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** A flat ring laid on a square: the selected piece, or a square it can go to. */
export function ring(outer: number, color: number, opacity = 0.85): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(outer * 0.62, outer, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

/** A flat dot on a square the selected piece can move to. */
export function dot(r: number, color: number, opacity = 0.7): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

/** An invisible plane the visitor can point at; carries userData.pickId. */
export function pickPlane(w: number, h: number, pickId: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ visible: false }));
  m.rotation.x = -Math.PI / 2;
  m.userData.pickId = pickId;
  return m;
}

/** Ease every object in `meshes` toward its target each frame. */
export function ease(meshes: Iterable<[THREE.Object3D, { pos: THREE.Vector3; quat: THREE.Quaternion } | undefined]>, dt: number, speed = 9) {
  const k = Math.min(1, dt * speed);
  for (const [m, tg] of meshes) {
    if (!tg) { m.visible = false; continue; }
    m.visible = true;
    m.position.lerp(tg.pos, k);
    m.quaternion.slerp(tg.quat, k);
  }
}

export const FLAT = new THREE.Quaternion();
