"use client";

/**
 * Static anatomical reference viewer - the fly body mesh without simulation,
 * for inspecting the anatomy. Same mesh as RoomView but isolated and scaled
 * to fill the viewport.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadFly } from "@/lib/three/meshes";

export function AnatomyView({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 20);
    camera.position.set(2.5, 1.2, 3);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.enablePan = false;
    controls.minDistance = 0.8;
    controls.maxDistance = 8;

    // Lighting for the static anatomy
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1512, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(3, 4, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xa0b0ff, 0.8);
    fill.position.set(-2, 1, -1);
    scene.add(fill);

    // Load the fly
    loadFly("/fly/fly.bin.gz").then(({ geometry }) => {
      if (disposed) return;
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.55,
        metalness: 0.05,
        transparent: true,
      });
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float alpha; varying float vAlpha;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlpha = alpha;");
        sh.fragmentShader = sh.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vAlpha;")
          .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );");
      };
      const mesh = new THREE.Mesh(geometry, mat);
      scene.add(mesh);
    }).catch((e) => console.error(e));

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
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={host} className={className} />;
}
