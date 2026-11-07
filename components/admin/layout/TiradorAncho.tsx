"use client";

/**
 * Tirador del borde derecho de la barra lateral: arrastrar = achicar o
 * agrandar (208-400 px), doble clic = ancho de fábrica, flechas con el foco
 * puesto (Shift = pasos de 32 px), Inicio/Fin = mínimo/máximo.
 * Por debajo del mínimo se queda en 208: NO pasa al modo compacto (eso es el
 * botón del pie, una decisión aparte).
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import {
  ANCHO_MAX,
  ANCHO_MIN,
  ATRIBUTO_ARRASTRE,
  acotarAncho,
  aplicarAncho,
  useAnchoBarra,
} from "@/components/admin/layout/use-ancho-barra";

/* Mientras se arrastra: sin transición en la barra ni en el margen del
   contenido (si no, cada cuadro anima 200 ms detrás del mouse) y el cursor de
   redimensionar en toda la página aunque el puntero se salga del tirador. */
const CSS_ARRASTRE = `
html[${ATRIBUTO_ARRASTRE}] [data-barra-lateral],
html[${ATRIBUTO_ARRASTRE}] [data-dark-fallback] { transition: none !important; }
html[${ATRIBUTO_ARRASTRE}="mouse"], html[${ATRIBUTO_ARRASTRE}="mouse"] * { cursor: col-resize !important; user-select: none !important; }
`;

const PASO = 8;
const PASO_LARGO = 32;

export function TiradorAncho({ oculto }: { oculto?: boolean }) {
  const { ancho, fijar } = useAnchoBarra();
  const ref = React.useRef<HTMLDivElement>(null);
  const arrastre = React.useRef<{ x: number; base: number; valor: number; cuadro: number; movido: boolean } | null>(null);

  const terminar = React.useCallback(() => {
    const a = arrastre.current;
    if (!a) return;
    if (a.cuadro) cancelAnimationFrame(a.cuadro);
    arrastre.current = null;
    document.documentElement.removeAttribute(ATRIBUTO_ARRASTRE);
    // Un clic sin mover no guarda nada: el de fábrica sigue siendo el de fábrica
    // (y el doble clic que lo restablece no deja un 276 pegado en un monitor de 296).
    if (a.movido) fijar(a.valor, true);
  }, [fijar]);

  React.useEffect(() => terminar, [terminar]);

  const alPresionar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const barra = ref.current?.closest<HTMLElement>("[data-barra-lateral]");
    const base = barra ? barra.getBoundingClientRect().width : (ancho ?? ANCHO_MIN);
    arrastre.current = { x: e.clientX, base, valor: acotarAncho(base), cuadro: 0, movido: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.documentElement.setAttribute(ATRIBUTO_ARRASTRE, "mouse");
  };

  const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a) return;
    if (!a.movido && Math.abs(e.clientX - a.x) < 2) return;
    a.movido = true;
    a.valor = acotarAncho(a.base + e.clientX - a.x);
    if (a.cuadro) return;
    a.cuadro = requestAnimationFrame(() => {
      a.cuadro = 0;
      aplicarAncho(a.valor);
      ref.current?.setAttribute("aria-valuenow", String(a.valor));
    });
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const actual = ancho ?? ANCHO_MIN;
    const paso = e.shiftKey ? PASO_LARGO : PASO;
    let nuevo: number | null = null;
    if (e.key === "ArrowLeft") nuevo = actual - paso;
    else if (e.key === "ArrowRight") nuevo = actual + paso;
    else if (e.key === "Home") nuevo = ANCHO_MIN;
    else if (e.key === "End") nuevo = ANCHO_MAX;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fijar(null);
      return;
    }
    if (nuevo === null) return;
    e.preventDefault();
    fijar(nuevo);
  };

  if (oculto) return null;

  return (
    <>
      <style>{CSS_ARRASTRE}</style>
      <div
        ref={ref}
        role="separator"
        aria-orientation="vertical"
        aria-label="Ancho de la barra lateral"
        aria-valuemin={ANCHO_MIN}
        aria-valuemax={ANCHO_MAX}
        aria-valuenow={ancho ?? undefined}
        aria-valuetext={ancho ? `${ancho} píxeles` : undefined}
        tabIndex={0}
        title="Arrastra para cambiar el ancho · doble clic: ancho de fábrica"
        data-tirador-ancho
        onPointerDown={alPresionar}
        onPointerMove={alMover}
        onPointerUp={terminar}
        onLostPointerCapture={terminar}
        onDoubleClick={() => fijar(null)}
        onKeyDown={alTeclear}
        className={cn(
          "group/tirador absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none outline-none",
          // La línea del acento aparece al apuntar, con foco y mientras se arrastra.
          "after:absolute after:inset-y-0 after:right-0 after:w-0.5 after:bg-[var(--accent)] after:opacity-0",
          "after:transition-opacity after:duration-[var(--dur-fast)] motion-reduce:after:transition-none",
          "hover:after:opacity-100 focus-visible:after:opacity-100 active:after:opacity-100",
          "focus-visible:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]",
        )}
      />
    </>
  );
}
