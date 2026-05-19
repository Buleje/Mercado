"use client";

/**
 * use-nav-scroll-hide — Detecta dirección de scroll y devuelve si el nav
 * debe estar visible.
 *
 * - Scroll DOWN past `threshold` → hide (returns false)
 * - Scroll UP (any) → show (returns true)
 * - Scroll near top (< threshold) → always show
 *
 * Smooth: el consumidor aplica `transform: translateY(-100%)` con
 * `transition-transform duration-300`.
 */

import { useEffect, useState } from "react";

/**
 * Brandon 2026-05-18 perf P2 #13: `enabled` opcional para que el callsite
 * pueda evitar montar el listener cuando no hay sticky bar visible (ej:
 * /tiendas sin subcategorías). Antes el scroll listener corría siempre y
 * disparaba rAF por evento aunque el resultado se ignorara.
 */
export function useNavScrollHide(threshold = 80, enabled = true): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    let lastY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < threshold) {
          setVisible(true);
        } else if (y > lastY + 4) {
          // Scroll down — esconder
          setVisible(false);
        } else if (y < lastY - 4) {
          // Scroll up — mostrar
          setVisible(true);
        }
        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold, enabled]);

  return visible;
}
