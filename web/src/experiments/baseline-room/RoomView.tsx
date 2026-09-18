"use client";

/**
 * The room in 3D. One scene unit is 100 mm. The fly is the flybody rig
 * (Google DeepMind / HHMI Janelia, Apache-2.0), drawn 60x life size so it can
 * be seen at all; a real fly is 3 mm long and would be a single pixel here.
 * Its legs and wings are choreographed from the simulation's commands.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FlyRig, loadFlyRigData } from "@/lib/three/flyRig";
import { FlyAnimator } from "@/lib/three/flyPose";
import { loadEnvironment } from "@/lib/three/env";
import { FURNITURE, ROOM_H, ROOM_W, heightOf } from "./world";
import type { FrameBus } from "./bus";

const U = 0.01;                  // mm -> scene units
const FLY_SCALE = 1.8;           // ~180 mm on screen for a 3 mm animal, about 60x

export type ViewMode = "orbit" | "follow" | "eye";

export function RoomView({ bus, view, overrides, className }: {
  bus: FrameBus;
  view: ViewMode;
  /** Manual joint angles, shared with the body panel. */
  overrides: Map<string, number>;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  const ovRef = useRef(overrides);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { ovRef.current = overrides; }, [overrides]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0b0e);
    scene.fog = new THREE.Fog(0x0b0b0e, 20, 44);

    const W = ROOM_W * U, H = ROOM_H * U;
    const camera = new THREE.PerspectiveCamera(46, 1, 0.03, 100);
    camera.position.set(W * 0.5 + 2.2, 2.6, H * 0.55 + 4.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(W / 2, 0.3, H * 0.55);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 1.2;
    controls.maxDistance = 26;

    // Light: a warm window on the far wall, a cool fill, soft shadows, and a
    // photographed studio probe (Poly Haven, CC0) for the fly's cuticle.
    loadEnvironment(renderer, "studio").then((env) => { if (!disposed) { scene.environment = env; scene.environmentIntensity = 0.45; } }).catch(() => {});
    scene.add(new THREE.HemisphereLight(0xb9c4ff, 0x141210, 0.7));
    const sun = new THREE.DirectionalLight(0xffe2b0, 2.4);
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
      const h = heightOf(r) * U;
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

    // Trail, in three dimensions now.
    const TRAIL_MAX = 900;
    const trailPos = new Float32Array(TRAIL_MAX * 3);
    const trailCol = new Float32Array(TRAIL_MAX * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setDrawRange(0, 0);
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    scene.add(trail);

    // Ground shadow disc so altitude reads even in the free view.
    const shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    scene.add(shadowDisc);

    // The fly: a rigged body, choreographed from the simulation's commands.
    const flyGroup = new THREE.Group();
    flyGroup.rotation.order = "YZX";
    scene.add(flyGroup);
    const flyLight = new THREE.PointLight(0xdfe8ff, 5, 4, 2);
    flyLight.position.set(0.6, 1.4, 0.6);
    flyGroup.add(flyLight);
    const placeholder = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff453a }));
    flyGroup.add(placeholder);
    let rig: FlyRig | null = null;
    let anim: FlyAnimator | null = null;
    let standHeight = FLY_SCALE * 0.18;
    const head = new THREE.Object3D();             // where the eye view sits
    flyGroup.add(head);
    loadFlyRigData().then((data) => {
      if (disposed) return;
      rig = new FlyRig(data);
      rig.mesh.castShadow = true;
      rig.root.scale.setScalar(FLY_SCALE);
      // Stand on the claws.
      let low = 0;
      for (const [n, p] of rig.restPositions) if (n.startsWith("claw")) low = Math.min(low, p.z);
      standHeight = -low * FLY_SCALE + 0.005;
      rig.root.position.y = standHeight;
      const hp = rig.restPositions.get("head")!;
      // Just in front of the head, between the eyes.
      head.position.set(0.56 * FLY_SCALE, hp.z * FLY_SCALE + standHeight + 0.01, 0);
      flyGroup.remove(placeholder);
      flyGroup.add(rig.root);
      anim = new FlyAnimator(rig);
    }).catch((e) => console.error(e));

    let latest: Parameters<Parameters<FrameBus["on"]>[0]>[0]["data"] | null = null;
    const off = bus.on((f) => {
      const { fly, threat: th, trail: tr } = f.data;
      latest = f.data;
      flyGroup.position.set(fly.x * U, fly.z * U, fly.y * U);
      flyGroup.rotation.set(fly.roll, -fly.heading, fly.pitch);
      shadowDisc.position.set(fly.x * U, 0.004, fly.y * U);
      const s = Math.max(0.15, 0.45 - fly.z * U * 0.08);
      shadowDisc.scale.setScalar(s);
      (shadowDisc.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.4 - fly.z * U * 0.08);

      if (th.active && th.size > 0.01) {
        const d = 1.5;                                  // 150 mm out from the fly
        const rad = Math.max(0.03, Math.tan(th.size / 2) * d);
        threat.visible = true;
        threat.scale.setScalar(rad);
        threat.position.set(
          fly.x * U + Math.cos(th.bearing) * d, fly.z * U + 0.25 + rad, fly.y * U + Math.sin(th.bearing) * d,
        );
      } else {
        threat.visible = false;
      }

      const n = Math.min(TRAIL_MAX, Math.floor(tr.length / 3));
      for (let i = 0; i < n; i++) {
        trailPos[i * 3] = tr[i * 3] * U; trailPos[i * 3 + 1] = tr[i * 3 + 2] * U + 0.02; trailPos[i * 3 + 2] = tr[i * 3 + 1] * U;
        const a = 0.08 + 0.92 * (i / Math.max(1, n));
        const air = tr[i * 3 + 2] > 5;
        trailCol[i * 3] = (air ? 0.25 : 0.19) * a; trailCol[i * 3 + 1] = (air ? 0.78 : 0.82) * a; trailCol[i * 3 + 2] = (air ? 0.88 : 0.35) * a;
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

    const tmpTarget = new THREE.Vector3(), tmpPos = new THREE.Vector3(), tmpDir = new THREE.Vector3();
    const homePos = camera.position.clone(), homeTarget = controls.target.clone();
    let lastView: ViewMode | null = null;
    let raf = 0, last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000; last = now;

      if (anim && latest) {
        const fly = latest.fly;
        anim.mode = fly.airborne ? "fly" : fly.speed > 2 ? "walk" : "idle";
        anim.speed = Math.min(1, fly.speed / 75);
        anim.turn = Math.max(-1, Math.min(1, fly.turn / 4));
        anim.overrides.clear();
        for (const [k, v] of ovRef.current) anim.overrides.set(k, v);
        anim.update(dt);
      }

      const mode = viewRef.current;
      if (mode !== lastView) {
        controls.enabled = mode !== "eye";
        if (rig) rig.mesh.visible = mode !== "eye";
        camera.fov = mode === "eye" ? 105 : 46;
        camera.updateProjectionMatrix();
        if (mode === "follow" && lastView !== null) {
          // Come in close behind the animal.
          tmpDir.subVectors(camera.position, controls.target).setLength(3.2);
          camera.position.copy(flyGroup.position).add(tmpDir).setY(Math.max(1.2, flyGroup.position.y + 1.4));
        } else if (mode === "orbit") {
          camera.position.copy(homePos); controls.target.copy(homeTarget);
        }
        lastView = mode;
      }
      if (mode === "follow") {
        // Keep whatever orbit offset the person chose, but track the fly.
        tmpTarget.copy(flyGroup.position).setY(flyGroup.position.y + standHeight);
        tmpDir.subVectors(tmpTarget, controls.target).multiplyScalar(Math.min(1, dt * 6));
        controls.target.add(tmpDir);
        camera.position.add(tmpDir);
        controls.update();
      } else if (mode === "eye") {
        head.getWorldPosition(tmpPos);
        camera.position.lerp(tmpPos, Math.min(1, dt * 14));
        tmpDir.set(1, 0, 0).applyQuaternion(flyGroup.quaternion);
        tmpTarget.copy(tmpPos).add(tmpDir);
        camera.lookAt(tmpTarget);
        camera.up.set(0, 1, 0);
      } else {
        controls.update();
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      off(); ro.disconnect(); controls.dispose();
      rig?.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (o !== rig?.mesh) m.geometry?.dispose?.();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [bus]);

  return <div ref={host} className={className} />;
}
