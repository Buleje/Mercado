"use client";

/**
 * ExplorarBackToTop — FAB minimalista que aparece tras scroll > 800px.
 *
 * Estilo Holded: pill negra sobre surface-canvas, sin sombra heavy.
 */

import { useEffect, useState } from "react";
import { ArrowUp } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export default function ExplorarBackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 800);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Volver arriba"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        "fixed right-4 sm:right-6 bottom-20 sm:bottom-8 z-40",
        "inline-flex items-center justify-center h-12 w-12 rounded-full",
        "bg-[var(--text-primary)] text-[var(--surface-canvas)]",
        "border border-[var(--rule-soft)] shadow-sm",
        "transition-all duration-300 ease-out",
        "hover:scale-110 hover:bg-[var(--accent)]",
        "motion-reduce:transition-none motion-reduce:hover:scale-100",
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-4 pointer-events-none",
      )}
    >
      <ArrowUp className="h-5 w-5" strokeWidth={2} aria-hidden />
    </button>
  );
}
