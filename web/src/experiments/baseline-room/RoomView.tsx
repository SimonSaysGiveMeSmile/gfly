"use client";

/**
 * The room in 3D. One scene unit is 100 mm. The fly is the flybody model
 * (Google DeepMind / HHMI Janelia, Apache-2.0), drawn 30x life size so it can
 * be seen at all; a real fly is 3 mm long and would be a single pixel here.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadFly } from "@/lib/three/meshes";
import { FURNITURE, ROOM_H, ROOM_W } from "./world";
import type { FrameBus } from "./bus";

const U = 0.01;                  // mm -> scene units
const FLY_SCALE = 1.8;           // ~180 mm on screen for a 3 mm animal, about 60x

export function RoomView({ bus, className }: { bus: FrameBus; className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b0e);
    scene.fog = new THREE.Fog(0x0b0b0e, 18, 40);

    const W = ROOM_W * U, H = ROOM_H * U;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    camera.position.set(W * 0.5 + 3.5, 6.5, H * 0.5 + 8.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(W / 2, 0.3, H / 2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 3;
    controls.maxDistance = 26;

    // Light: a warm window on the far wall, a cool fill, soft shadows.
    scene.add(new THREE.HemisphereLight(0xb9c4ff, 0x141210, 0.8));
    const sun = new THREE.DirectionalLight(0xffe2b0, 2.2);
    sun.position.set(W * 0.4, 8, -4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10; sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -6;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const windowGlow = new THREE.PointLight(0xffd9a0, 30, 14, 2);
    windowGlow.position.set(W * 0.38, 1.6, 0.4);
    scene.add(windowGlow);

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ color: 0x1c1d1a, roughness: 0.95, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, H / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    // 100 mm floor grid
    const gridPts: number[] = [];
    for (let x = 0; x <= ROOM_W; x += 100) gridPts.push(x * U, 0.002, 0, x * U, 0.002, H);
    for (let y = 0; y <= ROOM_H; y += 100) gridPts.push(0, 0.002, y * U, W, 0.002, y * U);
    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3)),
      new THREE.LineBasicMaterial({ color: 0x2a2c27, transparent: true, opacity: 0.8 }),
    );
    scene.add(grid);

    // Walls, window and furniture straight from the world definition.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b2e28, roughness: 0.9 });
    const furnMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6, metalness: 0.1 });
    const winMat = new THREE.MeshStandardMaterial({ color: 0xffe0a8, emissive: 0xffc46a, emissiveIntensity: 1.6 });
    for (const r of FURNITURE) {
      const isWall = r.kind === "wall";
      const h = r.kind === "window" ? 1.2 : isWall ? 1.6 : r.label === "table" ? 0.75 : r.label === "couch" ? 0.85 : 0.6;
      const geo = new THREE.BoxGeometry(r.w * U, h, r.h * U);
      const mesh = new THREE.Mesh(geo, r.kind === "window" ? winMat : isWall ? wallMat : furnMat);
      mesh.position.set((r.x + r.w / 2) * U, h / 2 + (r.kind === "window" ? 0.3 : 0), (r.y + r.h / 2) * U);
      mesh.castShadow = !isWall;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    // The threat: a dark disc that grows as it closes in.
    const threat = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.4, metalness: 0.2 }),
    );
    threat.castShadow = true;
    threat.visible = false;
    scene.add(threat);
    const threatRim = new THREE.Mesh(
      new THREE.SphereGeometry(1.02, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xff453a, transparent: true, opacity: 0.35, side: THREE.BackSide }),
    );
    threat.add(threatRim);

    // Trail
    const TRAIL_MAX = 900;
    const trailPos = new Float32Array(TRAIL_MAX * 3);
    const trailCol = new Float32Array(TRAIL_MAX * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    scene.add(trail);

    // The fly
    const flyGroup = new THREE.Group();
    scene.add(flyGroup);
    const flyLight = new THREE.PointLight(0xdfe8ff, 6, 4, 2);
    flyLight.position.set(0.6, 1.4, 0.6);
    flyGroup.add(flyLight);
    const placeholder = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xff453a }),
    );
    flyGroup.add(placeholder);
    loadFly("/fly/fly.bin.gz").then(({ geometry }) => {
      if (disposed) return;
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, transparent: true });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float alpha; varying float vAlpha;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlpha = alpha;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vAlpha;")
          .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );");
      };
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = true;
      mesh.scale.setScalar(FLY_SCALE);
      mesh.position.y = FLY_SCALE * 0.18;
      flyGroup.remove(placeholder);
      flyGroup.add(mesh);
    }).catch((e) => console.error(e));

    const off = bus.on((f) => {
      const { fly, threat: th, trail: tr } = f.data;
      flyGroup.position.set(fly.x * U, 0, fly.y * U);
      flyGroup.rotation.y = -fly.heading;

      if (th.active && th.size > 0.01) {
        const d = 1.5;                                  // 150 mm out from the fly
        const rad = Math.max(0.03, Math.tan(th.size / 2) * d);
        threat.visible = true;
        threat.scale.setScalar(rad);
        threat.position.set(
          fly.x * U + Math.cos(th.bearing) * d, 0.25 + rad, fly.y * U + Math.sin(th.bearing) * d,
        );
      } else {
        threat.visible = false;
      }

      const n = Math.min(TRAIL_MAX, tr.length / 2);
      for (let i = 0; i < n; i++) {
        trailPos[i * 3] = tr[i * 2] * U; trailPos[i * 3 + 1] = 0.02; trailPos[i * 3 + 2] = tr[i * 2 + 1] * U;
        const a = 0.08 + 0.92 * (i / Math.max(1, n));
        trailCol[i * 3] = 0.19 * a; trailCol[i * 3 + 1] = 0.82 * a; trailCol[i * 3 + 2] = 0.35 * a;
      }
      (trailGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (trailGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
      trailGeo.setDrawRange(0, n);
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
    const tick = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      off(); ro.disconnect(); controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [bus]);

  return <div ref={host} className={className} />;
}
