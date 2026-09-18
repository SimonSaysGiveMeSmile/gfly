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
import { FUNCTION_GROUPS } from "@/lib/sim/populations";
import type { FrameBus } from "./bus";

// Brain bbox in 8 nm voxels: x 2.2k-93.8k, y 4.6k-54.8k, z 7.9k-52k. The VNC
// continues to z 134.6k. Centre on the brain, scale so it is ~2.3 units wide.
const CX = 48000, CY = 30000, CZ = 30000, S = 40000;

const POINT_VERT = `
attribute float activity;
attribute vec3 gcolor;
varying float vA;
varying vec3 vC;
uniform float uScale;
void main() {
  vA = activity;
  vC = gcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * (1.0 + 1.4 * vA) / -mv.z;
}`;

const POINT_FRAG = `
varying float vA;
varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.3, d);
  // At rest a neuron is a dim dot in its group's colour; a spike lifts it
  // towards white. Alpha stays low so 139k dots read as dots, not a glow.
  vec3 c = mix(vC * 0.55, mix(vC, vec3(1.0), 0.55), smoothstep(0.0, 0.5, vA));
  float a = soft * (0.05 + 0.35 * vA);
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
  gl_FragColor = vec4(uColor, 0.015 + 0.16 * f);
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
      const col = new Float32Array(n * 3);
      const palette = FUNCTION_GROUPS.map((gr) => new THREE.Color(gr.color));
      for (let i = 0; i < n; i++) {
        const c = palette[r.somaGroup[i]] ?? palette[5];
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("gcolor", new THREE.BufferAttribute(col, 3));
      activityAttr = new THREE.BufferAttribute(new Uint8Array(n), 1, true);
      activityAttr.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute("activity", activityAttr);
      const mat = new THREE.ShaderMaterial({
        vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
        uniforms: { uScale: { value: 4.2 * renderer.getPixelRatio() } },
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
