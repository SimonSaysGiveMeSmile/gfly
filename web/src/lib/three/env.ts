/**
 * Image-based lighting from Poly Haven light probes (CC0, fetched by
 * tools/fetch_assets.py). One prefiltered environment per probe per renderer,
 * shared by every scene that asks for it.
 */
import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export type Probe = "studio" | "garden";

const URLS: Record<Probe, string> = {
  studio: "/assets/hdri/studio_small_09_1k.hdr",
  garden: "/assets/hdri/chinese_garden_1k.hdr",
};

const hdrCache = new Map<Probe, Promise<THREE.DataTexture>>();
const envCache = new WeakMap<THREE.WebGLRenderer, Map<Probe, Promise<THREE.Texture>>>();

function loadHdr(probe: Probe) {
  let p = hdrCache.get(probe);
  if (!p) {
    p = new RGBELoader().loadAsync(URLS[probe]);
    hdrCache.set(probe, p);
  }
  return p;
}

/** A PMREM-filtered environment map for `renderer`. Safe to call repeatedly. */
export function loadEnvironment(renderer: THREE.WebGLRenderer, probe: Probe): Promise<THREE.Texture> {
  let perRenderer = envCache.get(renderer);
  if (!perRenderer) { perRenderer = new Map(); envCache.set(renderer, perRenderer); }
  let p = perRenderer.get(probe);
  if (!p) {
    p = loadHdr(probe).then((hdr) => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const env = pmrem.fromEquirectangular(hdr).texture;
      pmrem.dispose();
      return env;
    });
    perRenderer.set(probe, p);
  }
  return p;
}

/** The raw equirectangular probe, for use as a visible background. */
export function loadBackdrop(probe: Probe): Promise<THREE.DataTexture> {
  return loadHdr(probe).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; return t; });
}
