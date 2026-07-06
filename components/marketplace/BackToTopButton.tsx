"use client";

/**
 * BackToTopButton — FAB flotante que aparece tras scrollear y vuelve al tope
 * (Brandon 2026-07-06, audit comodidad /tiendas). Útil con muchas secciones.
 * Posición bottom-left para no chocar con el FAB de comparar/chat (bottom-right)
 * ni con el bottom-nav móvil.
 */

import { useEffect, useState } from "react";
import { ArrowUp } from "@buleje/design-system/icons";

export default function BackToTopButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Volver arriba"
      className="fixed bottom-24 left-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-lg transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/50 hover:text-[var(--accent)] active:scale-95 sm:bottom-8"
    >
      <ArrowUp className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}
