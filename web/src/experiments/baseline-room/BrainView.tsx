"use client";

/**
 * The brain, live. Every neuron with a reconstructed cell body is a point at
 * its true position inside the official MaleCNS neuropil shell, and it lights
 * up when it fires. Nothing here is illustrative: the shell is Janelia's own
 * ROI mesh, the positions are the release's soma coordinates, and the
 * activity is the simulation's spike train.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadShell } from "@/lib/three/meshes";
import type { FrameBus } from "./bus";

// Brain bbox in 8 nm voxels: x 2.2k-93.8k, y 4.6k-54.8k, z 7.9k-52k. The VNC
// continues to z 134.6k. Centre on the brain, scale so it is ~2.3 units wide.
const CX = 48000, CY = 30000, CZ = 30000, S = 40000;

const INFERNO = `
vec3 inferno(float t) {
  const vec3 c0 = vec3(0.0002189403, 0.0016510046, -0.0194943213);
  const vec3 c1 = vec3(0.1065134194, 0.5639564368, 3.9327123889);
  const vec3 c2 = vec3(11.6024930825, -3.9728364280, -15.9423044496);
  const vec3 c3 = vec3(-41.7039563149, 17.4363633540, 44.3541389330);
  const vec3 c4 = vec3(77.1629156831, -33.4023570428, -81.8073002000);
  const vec3 c5 = vec3(-71.3194669290, 32.6260706921, 73.2093482530);
  const vec3 c6 = vec3(25.1311105960, -12.2426670600, -23.0703644400);
  return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6)))));
}`;

const POINT_VERT = `
attribute float activity;
varying float vA;
uniform float uScale;
void main() {
  vA = activity;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * (1.0 + 2.5 * vA) / -mv.z;
}`;

const POINT_FRAG = INFERNO + `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.1, d);
  // At rest a neuron is a faint violet speck; 139k of them add up to the
  // brain's shape without washing it out. A spike goes through the inferno
  // ramp and carries almost all of the light.
  vec3 rest = vec3(0.09, 0.04, 0.17);
  vec3 c = mix(rest, inferno(0.2 + 0.8 * vA), smoothstep(0.0, 0.35, vA));
  float a = soft * (0.03 + 0.8 * vA);
  gl_FragColor = vec4(c * a, a);
}`;

const SHELL_VERT = `
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const SHELL_FRAG = `
varying vec3 vN; varying vec3 vV;
uniform vec3 uColor;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  gl_FragColor = vec4(uColor, 0.02 + 0.30 * f);
}`;

export function BrainView({ bus, className }: { bus: FrameBus; className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
    camera.position.set(0.4, 0.9, 3.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enablePan = false;
    controls.minDistance = 1.2;
    controls.maxDistance = 9;

    const group = new THREE.Group();
    scene.add(group);

    const toScene = (g: THREE.BufferGeometry) => {
      const p = g.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        p.setXYZ(i, (p.getX(i) - CX) / S, -(p.getY(i) - CY) / S, -(p.getZ(i) - CZ) / S);
      }
      const n = g.getAttribute("normal") as THREE.BufferAttribute;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i), -n.getY(i), -n.getZ(i));
      p.needsUpdate = true; n.needsUpdate = true;
      return g;
    };

    const shellMat = (hex: number) => new THREE.ShaderMaterial({
      vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG,
      uniforms: { uColor: { value: new THREE.Color(hex) } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    Promise.all([loadShell("/brain/brain-shell.bin.gz"), loadShell("/brain/vnc-shell.bin.gz")])
      .then(([brain, vnc]) => {
        if (disposed) return;
        group.add(new THREE.Mesh(toScene(brain), shellMat(0x8fa2ff)));
        group.add(new THREE.Mesh(toScene(vnc), shellMat(0x7f8fe0)));
      })
      .catch((e) => console.error(e));

    let points: THREE.Points | null = null;
    let activityAttr: THREE.BufferAttribute | null = null;
    let somaNeuron: Uint32Array | null = null;

    const buildPoints = () => {
      const r = bus.ready;
      if (!r || points) return;
      const n = r.somaNeuron.length;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (r.somaXYZ[i * 3] - CX) / S;
        pos[i * 3 + 1] = -(r.somaXYZ[i * 3 + 1] - CY) / S;
        pos[i * 3 + 2] = -(r.somaXYZ[i * 3 + 2] - CZ) / S;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      activityAttr = new THREE.BufferAttribute(new Uint8Array(n), 1, true);
      activityAttr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute("activity", activityAttr);
      const mat = new THREE.ShaderMaterial({
        vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
        uniforms: { uScale: { value: 6.5 * renderer.getPixelRatio() } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      points = new THREE.Points(g, mat);
      somaNeuron = r.somaNeuron;
      group.add(points);
    };

    const off = bus.on((f) => {
      buildPoints();
      if (!activityAttr || !somaNeuron) return;
      const dst = activityAttr.array as Uint8Array;
      const src = f.activity;
      for (let i = 0; i < somaNeuron.length; i++) dst[i] = src[somaNeuron[i]];
      activityAttr.needsUpdate = true;
    });

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      off();
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose?.();
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [bus]);

  return <div ref={host} className={className} style={{ position: "relative" }} />;
}
