"use client";

/**
 * The body, up close: the same flybody rig as the room, isolated so its
 * limbs can be watched and posed. In "live" mode it mirrors what the
 * simulated fly is doing; otherwise it holds a chosen behaviour. Manual joint
 * angles from the limb panel win over both.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadBody, type Body, type BodyKind, type BodyMode as Mode } from "@/lib/three/body";
import { loadEnvironment } from "@/lib/three/env";
import type { FrameBus } from "./bus";

export type BodyMode = "live" | Mode;

export function BodyView({ bus, kind, mode, overrides, onBody, className }: {
  bus?: FrameBus;
  kind: BodyKind;
  mode: BodyMode;
  overrides: Map<string, number>;
  /** Called with the loaded body (its limbs and joints), and null when it goes. */
  onBody?: (body: Body | null) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  const ovRef = useRef(overrides);
  const onBodyRef = useRef(onBody);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { ovRef.current = overrides; }, [overrides]);
  useEffect(() => { onBodyRef.current = onBody; }, [onBody]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 30);
    camera.position.set(1.7, 0.9, 1.9);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.9;
    controls.enablePan = false;
    controls.minDistance = 0.6;
    controls.maxDistance = 6;
    controls.target.set(0, 0.05, 0);
    renderer.domElement.addEventListener("pointerdown", () => { controls.autoRotate = false; }, { once: true });

    // A photographed studio lights it (Poly Haven, CC0); one key light adds shape.
    loadEnvironment(renderer, "studio").then((env) => { if (!disposed) { scene.environment = env; scene.environmentIntensity = 1.1; } }).catch(() => {});
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1512, 0.5));
    const key = new THREE.DirectionalLight(0xfff1dc, 1.8);
    key.position.set(3, 4, 2);
    scene.add(key);

    // A faint ground ring so up is up.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.64, 96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);

    let body: Body | null = null;
    loadBody(kind).then((b) => {
      if (disposed) { b.dispose(); return; }
      body = b;
      ring.position.y = b.footY;
      scene.add(b.root);
      onBodyRef.current?.(b);
      // A small hook so poses can be checked from outside.
      (window as unknown as { __gflyBody?: unknown }).__gflyBody = { body, rig: (b as { rig?: unknown }).rig };
    }).catch((e) => console.error(e));

    let latest: { airborne: boolean; speed: number; turn: number } | null = null;
    const off = bus?.on((f) => { latest = f.data.fly; });

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

    let raf = 0, last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000; last = now;
      if (body) {
        const m = modeRef.current;
        if (m === "live") {
          const f = latest;
          body.mode = !f ? "idle" : f.airborne ? "fly" : f.speed > 2 ? "walk" : "idle";
          body.speed = f ? Math.min(1, f.speed / 75) : 0;
          body.turn = f ? Math.max(-1, Math.min(1, f.turn / 4)) : 0;
        } else {
          body.mode = m;
          body.speed = m === "walk" ? 0.6 : 0;
          body.turn = 0;
        }
        body.overrides.clear();
        for (const [k, v] of ovRef.current) body.overrides.set(k, v);
        body.update(dt);
      }
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      off?.();
      ro.disconnect();
      controls.dispose();
      body?.dispose();
      onBodyRef.current?.(null);
      ring.geometry.dispose(); (ring.material as THREE.Material).dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [bus, kind]);

  return <div ref={host} className={className} />;
}
