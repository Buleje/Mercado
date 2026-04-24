"use client";

/**
 * useReducedMotion — Respeta prefers-reduced-motion.
 *
 * Usar para condicionar animaciones de Framer Motion, confetti, parallax,
 * loaders espectaculares. Tailwind ya tiene `motion-safe:` y `motion-reduce:`
 * modifiers, asi que este hook solo es util para logica JS.
 *
 * Uso:
 *   const prefersReducedMotion = useReducedMotion();
 *   return <motion.div animate={prefersReducedMotion ? {} : { y: 100 }} />;
 */

import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(query.matches);
    const handler = (e: MediaQueryListEvent) => setPrefers(e.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  return prefers;
}
