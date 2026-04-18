"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * SmoothScrollProvider
 *
 * Activa smooth scrolling físico global (Apple-style) con Lenis.
 * - Respeta prefers-reduced-motion
 * - Se auto-desactiva en mobile (táctil ya tiene física nativa)
 * - Expone `data-lenis-prevent` para contenedores internos (drawers, modals)
 */
export default function SmoothScrollProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) return;

    const isTouch = window.matchMedia("(hover: none)").matches;
    if (isTouch) return;

    // Difiere la init de Lenis al idle callback — libera el main thread
    // durante hidratación y primer paint en cada navegación cliente.
    let lenis: Lenis | null = null;
    let rafId = 0;
    let idleId = 0;

    const init = () => {
      lenis = new Lenis({
        duration: 1.1,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 1.2,
      });
      document.documentElement.classList.add("lenis", "lenis-smooth");
      const raf = (time: number) => {
        lenis?.raf(time);
        rafId = requestAnimationFrame(raf);
      };
      rafId = requestAnimationFrame(raf);
    };

    const ric: typeof requestIdleCallback | undefined = (
      window as Window & { requestIdleCallback?: typeof requestIdleCallback }
    ).requestIdleCallback;
    if (typeof ric === "function") {
      idleId = ric(init, { timeout: 500 });
    } else {
      idleId = window.setTimeout(init, 200) as unknown as number;
    }

    return () => {
      const cic: typeof cancelIdleCallback | undefined = (
        window as Window & { cancelIdleCallback?: typeof cancelIdleCallback }
      ).cancelIdleCallback;
      if (typeof cic === "function") cic(idleId);
      else window.clearTimeout(idleId);
      if (rafId) cancelAnimationFrame(rafId);
      lenis?.destroy();
      document.documentElement.classList.remove("lenis", "lenis-smooth");
    };
  }, []);

  return null;
}
