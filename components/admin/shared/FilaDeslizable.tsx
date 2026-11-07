"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/**
 * Una fila de chips que no se parte: lo que no entra se desliza de lado
 * (Brandon 24-10, Esenciales: «Abres seguido» ocupaba 3 filas y «Lo que más
 * abres» 2 con el panel abierto). Rótulo fijo a la izquierda; los bordes se
 * desvanecen y sale una flecha de 48 px sólo del lado donde hay más.
 * Teclado: Tab recorre los chips (el navegador los trae a la vista) y ← → pasan
 * de un botón al siguiente dentro de la fila.
 */

const BORDE = "3rem";
const mascara = (izq: boolean, der: boolean): string | undefined => {
  if (!izq && !der) return undefined;
  const a = izq ? `transparent 0, black ${BORDE}` : "black 0";
  const b = der ? `black calc(100% - ${BORDE}), transparent 100%` : "black 100%";
  return `linear-gradient(to right, ${a}, ${b})`;
};

const FLECHA =
  "absolute top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export default function FilaDeslizable({ rotulo, etiqueta, children, className, qa }: {
  /** Lo que va fijo a la izquierda (ícono + nombre + ⓘ). */
  rotulo?: ReactNode;
  /** Nombre de la fila para lectores de pantalla. */
  etiqueta: string;
  /** Los chips: cada uno con `shrink-0`. */
  children: ReactNode;
  className?: string;
  qa?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pista = useRef<HTMLDivElement>(null);
  const [lados, setLados] = useState({ izq: false, der: false });

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const izq = max > 1 && el.scrollLeft > 2;
    const der = max > 1 && el.scrollLeft < max - 2;
    setLados((p) => (p.izq === izq && p.der === der ? p : { izq, der }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    // Sin ResizeObserver (jsdom de los tests) se mide sólo al montar y al deslizar.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    ro?.observe(el);
    if (pista.current) ro?.observe(pista.current);
    return () => {
      el.removeEventListener("scroll", medir);
      ro?.disconnect();
    };
  }, [medir]);

  const mover = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const quieto = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: quieto ? "auto" : "smooth" });
  };

  // ← → entre los botones de la fila (Tab sigue saliendo de ella como siempre).
  const alTeclear = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
    const botones = Array.from(pista.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? []);
    const i = botones.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const sig = botones[i + (ev.key === "ArrowRight" ? 1 : -1)];
    if (!sig) return;
    ev.preventDefault();
    sig.focus();
  };

  const m = mascara(lados.izq, lados.der);
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)} data-qa={qa}>
      {rotulo && <div className="flex shrink-0 items-center">{rotulo}</div>}
      <div className="relative min-w-0 flex-1">
        <div
          ref={ref}
          role="group"
          aria-label={etiqueta}
          onKeyDown={alTeclear}
          className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={m ? { maskImage: m, WebkitMaskImage: m } : undefined}
        >
          <div ref={pista} className="flex w-max items-center gap-2">
            {children}
          </div>
        </div>
        {lados.izq && (
          <button type="button" onClick={() => mover(-1)} aria-label={`${etiqueta}: ver los anteriores`} title="Anteriores" className={cn(FLECHA, "left-0")}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
        )}
        {lados.der && (
          <button type="button" onClick={() => mover(1)} aria-label={`${etiqueta}: ver más`} title="Ver más" className={cn(FLECHA, "right-0")}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
