"use client";

/**
 * Fila horizontal de tarjetas: se desliza con el dedo, la rueda o el teclado
 * (la fila es enfocable) y, en pantallas anchas, con las flechas de los lados.
 * Las flechas no se apagan con `disabled` al llegar al borde: un botón que se
 * apaga con el foco encima tira el foco al `<body>`; se atenúan y no hacen nada.
 */
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";

/** Ancho de cada tarjeta: 2,2 en el celular, 3 en tablet, 4-5 en escritorio (3 si la fila va al lado de una foto). */
const ANCHO_ITEM = {
  completo: "w-[46%] sm:w-[31%] lg:w-[calc((100%_-_3*1.25rem)/4)] xl:w-[calc((100%_-_4*1.25rem)/5)]",
  angosto: "w-[46%] sm:w-[31%] lg:w-[calc((100%_-_2*1.25rem)/3)]",
} as const;

export function Carril({ etiqueta, ancho = "completo", children }: { etiqueta: string; ancho?: keyof typeof ANCHO_ITEM; children: ReactNode }) {
  const fila = useRef<HTMLDivElement>(null);
  const [borde, setBorde] = useState({ inicio: true, fin: false });

  const medir = useCallback(() => {
    const el = fila.current;
    if (!el) return;
    setBorde({ inicio: el.scrollLeft < 8, fin: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);

  useEffect(() => {
    const el = fila.current;
    if (!el) return;
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      el.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
    };
  }, [medir]);

  const mover = (dir: 1 | -1) => {
    const el = fila.current;
    if (!el) return;
    if ((dir === -1 && borde.inicio) || (dir === 1 && borde.fin)) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const flecha =
    "absolute top-[38%] z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-md transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] md:flex aria-disabled:pointer-events-none aria-disabled:opacity-0";

  return (
    <div className="relative">
      <div
        ref={fila}
        role="region"
        aria-label={etiqueta}
        tabIndex={0}
        className="bb-sin-barra -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)] sm:-mx-6 sm:scroll-px-6 sm:gap-5 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0"
      >
        {Children.map(children, (hijo) => (
          <div className={`shrink-0 snap-start ${ANCHO_ITEM[ancho]}`}>{hijo}</div>
        ))}
      </div>
      <button type="button" aria-label="Ver anteriores" aria-disabled={borde.inicio} onClick={() => mover(-1)} className={`${flecha} -left-5`}>
        <ChevronLeft className="h-6 w-6" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Ver siguientes" aria-disabled={borde.fin} onClick={() => mover(1)} className={`${flecha} -right-5`}>
        <ChevronRight className="h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  );
}
