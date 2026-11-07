"use client";

/**
 * Hoja inferior de la pantalla completa del croquis: lleva la ficha de lo que
 * se tocó sin tapar el plano. El asa se desliza (o se toca) para bajarla a una
 * franja y volver a subirla.
 */

import { useRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "@buleje/design-system/icons";

export default function CtpPlantaCroquisHoja({ children, minimizada, onMinimizar }: { children: ReactNode; minimizada: boolean; onMinimizar: (v: boolean) => void }) {
  const y0 = useRef<number | null>(null);
  const Icono = minimizada ? ChevronUp : ChevronDown;
  return (
    <section aria-label="Ficha de lo tocado en el croquis" className="shrink-0 rounded-t-2xl border border-b-0 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]">
      <button
        type="button"
        aria-expanded={!minimizada}
        aria-label={minimizada ? "Subir la ficha" : "Bajar la ficha"}
        onClick={() => onMinimizar(!minimizada)}
        onPointerDown={(e) => { y0.current = e.clientY; }}
        onPointerUp={(e) => {
          const dy = y0.current === null ? 0 : e.clientY - y0.current;
          y0.current = null;
          if (Math.abs(dy) > 30) { onMinimizar(dy > 0); e.preventDefault(); }
        }}
        style={{ touchAction: "none" }}
        className="flex h-11 w-full flex-col items-center justify-center gap-0.5 text-[var(--text-tertiary)]"
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-[var(--rule-strong)]" />
        <Icono className="h-4 w-4" aria-hidden />
      </button>
      {!minimizada && <div className="max-h-[42svh] overflow-y-auto overscroll-contain px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">{children}</div>}
    </section>
  );
}
