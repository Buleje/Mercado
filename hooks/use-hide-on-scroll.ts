"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useHideOnScroll — oculta una barra fija al scrollear hacia ABAJO y la vuelve
 * a mostrar al scrollear hacia ARRIBA (patrón header Amazon/Rappi). Devuelve
 * `hidden`. Throttle con requestAnimationFrame y un umbral para no esconderla
 * cerca del tope de la página. Lo consumen MarketplaceNavbar + SecondaryNav
 * para ocultarse/aparecer EN SINCRONÍA (ambos leen la misma dirección).
 */
export function useHideOnScroll(threshold = 90): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const diff = y - lastY.current;
        // Ignora micro-scrolls (jitter de trackpad) para evitar parpadeos.
        if (Math.abs(diff) > 6) {
          if (diff > 0 && y > threshold) setHidden(true); // bajando → ocultar
          else if (diff < 0) setHidden(false); // subiendo → mostrar
          lastY.current = y;
        } else if (y <= threshold) {
          setHidden(false); // cerca del tope: siempre visible
        }
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
