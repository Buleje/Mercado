"use client";

import { useEffect, useRef } from "react";

/**
 * Scene3D — A Three.js orbiting product globe.
 * Renders a rotating icosahedron with glowing indigo/amber wireframe + orbiting product icon spheres.
 * Lazy-loads Three.js so it never blocks hydration.
 */
export default function Scene3D({ className = "" }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderer: import("three").WebGLRenderer;
    let animId: number;
    const mountNode = mountRef.current;

    async function init() {
      const THREE = await import("three");
      // Guard against React Strict Mode double-mount: if cleanup already ran, abort.
      if (cancelled) return;
      const el = mountNode;
      if (!el) return;

      const W = el.clientWidth || 400;
      const H = el.clientHeight || 400;

      // Scene setup
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
      camera.position.z = 5;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);

      /* ── Core globe ── */
      const coreGeo = new THREE.IcosahedronGeometry(1.35, 1);
      const coreMat = new THREE.MeshPhongMaterial({
        color: 0x6366f1,
        emissive: 0x4338ca,
        emissiveIntensity: 0.4,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
      });
      const coreGlobe = new THREE.Mesh(coreGeo, coreMat);
      scene.add(coreGlobe);

      /* ── Outer glow wireframe ── */
      const outerGeo = new THREE.IcosahedronGeometry(1.6, 1);
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
      });
      const outerGlobe = new THREE.Mesh(outerGeo, outerMat);
      scene.add(outerGlobe);

      /* ── Orbiting spheres ── */
      const orbitColors = [0x818cf8, 0xfbbf24, 0x3b82f6, 0x8b5cf6, 0x60a5fa];
      const orbitData: { mesh: import("three").Mesh; r: number; speed: number; phase: number; tilt: number }[] = [];

      orbitColors.forEach((color, idx) => {
        const geo = new THREE.SphereGeometry(0.09, 8, 8);
        const mat = new THREE.MeshPhongMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.6,
        });
        const mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);
        orbitData.push({
          mesh,
          r: 2.0 + idx * 0.18,
          speed: 0.45 + idx * 0.12,
          phase: (idx / orbitColors.length) * Math.PI * 2,
          tilt: (idx * 22 * Math.PI) / 180,
        });
      });

      /* ── Orbit ring (torus) ── */
      const ringGeo = new THREE.TorusGeometry(2.15, 0.008, 6, 80);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.25 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 3;
      scene.add(ring);

      /* ── Lights ── */
      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const pLight = new THREE.PointLight(0x6366f1, 2.5, 10);
      pLight.position.set(3, 3, 3);
      scene.add(pLight);
      const pLight2 = new THREE.PointLight(0xf59e0b, 1.5, 8);
      pLight2.position.set(-3, -2, -3);
      scene.add(pLight2);

      /* ── Particle cloud ── */
      const pCount = 120;
      const pPositions = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 2.8 + Math.random() * 1.2;
        pPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pPositions[i * 3 + 2] = r * Math.cos(phi);
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(pPositions, 3));
      const pMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.025, transparent: true, opacity: 0.5 });
      scene.add(new THREE.Points(pGeo, pMat));

      /* ── Mouse interaction ── */
      let mx = 0, my = 0;
      const onMouseMove = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        mx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        my = -((e.clientY - rect.top) / rect.height - 0.5) * 2;
      };
      el.addEventListener("mousemove", onMouseMove);

      /* ── Resize ── */
      const onResize = () => {
        const W2 = el.clientWidth;
        const H2 = el.clientHeight;
        camera.aspect = W2 / H2;
        camera.updateProjectionMatrix();
        renderer.setSize(W2, H2);
      };
      window.addEventListener("resize", onResize);

      /* ── Animation loop ── */
      const startTime = performance.now();
      const animate = () => {
        if (cancelled) return;
        animId = requestAnimationFrame(animate);
        const t = (performance.now() - startTime) / 1000;

        coreGlobe.rotation.y = t * 0.22 + mx * 0.3;
        coreGlobe.rotation.x = Math.sin(t * 0.1) * 0.1 + my * 0.15;
        outerGlobe.rotation.y = -t * 0.14;
        outerGlobe.rotation.z = t * 0.06;
        ring.rotation.z = t * 0.08;

        orbitData.forEach(({ mesh, r, speed, phase, tilt }) => {
          const angle = t * speed + phase;
          mesh.position.x = Math.cos(angle) * r;
          mesh.position.y = Math.sin(angle * 0.5) * Math.sin(tilt) * r * 0.5;
          mesh.position.z = Math.sin(angle) * r * Math.cos(tilt);
        });

        renderer.render(scene, camera);
      };
      animate();

      return () => {
        el.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("resize", onResize);
      };
    }

    const cleanup = init();
    return () => {
      cancelled = true; // mark cancelled FIRST to stop any pending async init
      cancelAnimationFrame(animId);
      cleanup.then((fn) => fn?.());
      renderer?.dispose();
      if (mountNode) mountNode.innerHTML = "";
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ width: "100%", height: "100%", cursor: "grab" }}
    />
  );
}
