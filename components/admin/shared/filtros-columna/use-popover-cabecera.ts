"use client";

/**
 * usePopoverCabecera — la mecánica del desplegable de una cabecera, UNA vez.
 *
 * Movido tal cual desde `components/admin/forestal/ctp-filtros-panel.tsx`
 * (Brandon, 2026-09-03/10): no tenía nada de forestal, era pura posición de
 * popover. `<details>` nativo para abrir/cerrar sin librería, y el panel en
 * `position: fixed` con la posición MEDIDA al abrir — la tabla suele vivir
 * dentro de un contenedor con `overflow`, que recortaría cualquier `absolute`.
 * Abre hacia arriba cuando no entra abajo, como el autofiltro de Excel. Se
 * cierra al click afuera y al scrollear — una posición fija quedaría colgada
 * en el aire si no se recalcula o se cierra.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface PosicionPopover {
  left: number;
  top?: number;
  bottom?: number;
}

export function usePopoverCabecera(alto: number, ancho = 256) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [pos, setPos] = useState<PosicionPopover | null>(null);

  /**
   * Dónde va el panel: pegado al disparador, arriba o abajo según lo que entre.
   *
   * Devuelve `false` cuando el disparador ya no se ve —ahí sí hay que cerrar:
   * un panel fijo colgado sobre una cabecera que se fue es peor que ninguno.
   */
  const medir = useCallback((): boolean => {
    const r = ref.current?.querySelector("summary")?.getBoundingClientRect();
    if (!r) return false;
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    const entraAbajo = r.bottom + 4 + alto <= window.innerHeight;
    // Y que no se corte contra el borde derecho: la última columna de una
    // tabla ancha abre su panel justo ahí, y la mitad quedaba fuera de la
    // pantalla (visto en Ingresos, 2026-09-10).
    const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
    setPos(entraAbajo ? { top: r.bottom + 4, left } : { bottom: window.innerHeight - r.top + 4, left });
    return true;
  }, [alto, ancho]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /**
     * Al scrollear se REUBICA, no se cierra: tildar una opción cambia la
     * cantidad de filas, la página se acomoda, eso dispara un `scroll` — y
     * cerrar en cada uno cerraría el panel antes de poder tildar la segunda
     * opción (medido en el navegador, 2026-09-10).
     */
    const alScrollear = () => {
      if (!el.open) return;
      if (!medir()) el.open = false;
    };
    const clickAfuera = (e: MouseEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("mousedown", clickAfuera);
    document.addEventListener("scroll", alScrollear, true);
    window.addEventListener("resize", alScrollear);
    return () => {
      document.removeEventListener("mousedown", clickAfuera);
      document.removeEventListener("scroll", alScrollear, true);
      window.removeEventListener("resize", alScrollear);
    };
  }, [medir]);

  const alAbrir = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (e.currentTarget.open) medir();
  };
  const estilo = pos
    ? { position: "fixed" as const, top: pos.top, bottom: pos.bottom, left: pos.left }
    : undefined;
  return { ref, alAbrir, estilo };
}

/** El disparador del desplegable: mismo alto y borde en todas las cabeceras. */
export const SUMMARY_CABECERA =
  "flex h-9 min-w-24 max-w-56 cursor-pointer list-none items-center justify-between gap-1 rounded-lg border-[1.5px] bg-[var(--surface-raised)] pl-2.5 pr-2 text-sm font-medium text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none [&::-webkit-details-marker]:hidden";
