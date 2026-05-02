"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * SmoothScrollProvider
 *
 * Smooth scrolling con física inertial (Apple/Beast Philanthropy style)
 * vía Lenis. Sensación "flotante" — el scroll mantiene momentum tras
 * soltar la rueda y desacelera con curva natural.
 *
 * - Respeta prefers-reduced-motion
 * - `lerp` 0.085 para frame-rate-independent smoothing (más estable
 *   que `duration` cuando hay frame drops)
 * - Se desactiva en touch-only puro (mobile pequeño) — la física
 *   nativa de iOS/Android ya es excelente. Tablets con stylus/mouse
 *   sí aprovechan Lenis.
 * - Expone `data-lenis-prevent` para contenedores internos (drawers,
 *   modals, dropdowns).
 */
export default function SmoothScrollProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) return;

    // Solo bloqueamos touch-PURO sin hover (móvil chico). Los híbridos
    // (laptops con touchscreen) sí reciben Lenis.
    const pureTouch =
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (pureTouch) return;

    let lenis: Lenis | null = null;
    let rafId = 0;
    let idleId = 0;
    let anchorHandler: ((e: MouseEvent) => void) | null = null;

    const init = () => {
      lenis = new Lenis({
        // lerp 0.065 — sweet spot "Apple/Beast/Awwwards": el scroll deja
        // un trail de momentum visible sin sentirse desconectado del
        // gesto. Por debajo de 0.05 se siente lag; por arriba de 0.1 ya
        // no es notoriamente "flotante".
        lerp: 0.065,
        // Anchor links (#como-funciona) y scrollTo programático: 1.8s
        // con easeOutQuint para deceleración cinematográfica.
        duration: 1.8,
        easing: (t) => 1 - Math.pow(1 - t, 5),
        smoothWheel: true,
        // Cada notch del mouse mueve menos → scroll más cinematográfico,
        // se ven más detalles del recorrido.
        wheelMultiplier: 0.85,
        touchMultiplier: 1.5,
        // Sincroniza touch con la física de Lenis (incluye trackpads de
        // mac que se reportan como touch). syncTouchLerp más bajo para
        // que el momentum del swipe sea más pronunciado.
        syncTouch: true,
        syncTouchLerp: 0.055,
        // Gesto de "drag" (touchpad/trackpad de 2 dedos) también animado.
        gestureOrientation: "vertical",
      });
      document.documentElement.classList.add("lenis", "lenis-smooth");
      const raf = (time: number) => {
        lenis?.raf(time);
        rafId = requestAnimationFrame(raf);
      };
      rafId = requestAnimationFrame(raf);

      // Hace que TODOS los anchor links (#como-funciona, #planes, etc.)
      // se animen con Lenis en lugar del scroll instantáneo nativo.
      // Sin esto, el header "Cómo funciona" salta sin animación.
      anchorHandler = (e: MouseEvent) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const link = target.closest('a[href*="#"]') as HTMLAnchorElement | null;
        if (!link) return;
        const url = new URL(link.href, window.location.href);
        if (url.pathname !== window.location.pathname) return; // navega de página
        const hash = url.hash;
        if (!hash || hash === "#") return;
        const dest = document.querySelector(hash);
        if (!dest) return;
        e.preventDefault();
        // 80px offset para no quedar tapado por el LandingHeader sticky.
        // 2s de duración con easeOutExpo da el efecto "cámara que viaja"
        // de las landings premium (Apple/Stripe/Beast).
        lenis?.scrollTo(dest as HTMLElement, {
          offset: -80,
          duration: 2.0,
          easing: (t) => 1 - Math.pow(1 - t, 4),
        });
        // Actualiza la URL sin saltar
        window.history.pushState(null, "", hash);
      };
      document.addEventListener("click", anchorHandler);
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
      if (anchorHandler) document.removeEventListener("click", anchorHandler);
      lenis?.destroy();
      document.documentElement.classList.remove("lenis", "lenis-smooth");
    };
  }, []);

  return null;
}
