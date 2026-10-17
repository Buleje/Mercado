"use client";

import { useEffect } from "react";

/**
 * ScrollReveal — animaciones de entrada al scrollear (Brandon 2026-06-26, Modo
 * Creativo). Las secciones aparecen con fade+slide cuando entran al viewport.
 *
 * Progressive enhancement: el estado oculto (`pb-reveal`) lo agrega ESTE JS, no
 * el server → sin JS la tienda se ve completa (SEO/no-JS intactos). Respeta
 * `prefers-reduced-motion` (a11y). Se monta solo si el dueño activa animateOnScroll.
 */
export default function ScrollReveal() {
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const els = [...document.querySelectorAll<HTMLElement>("main > [data-pb], main [data-reveal]")];
    if (!els.length) return;
    els.forEach((el) => el.classList.add("pb-reveal"));

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("pb-reveal-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
