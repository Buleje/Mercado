/**
 * Dónde se dibuja un menú flotante del Archivo para que nunca se salga de la
 * pantalla. Lo comparten el «⋯» de cada documento (`MenuDocumento`) y el menú
 * del clic derecho del explorador (`MenuEnPunto`): antes la cuenta vivía sólo
 * en el primero.
 */

import { useLayoutEffect, type RefObject } from "react";

export const ANCHO_MENU = 232;
const MARGEN = 12;
const SEPARACION = 4;

/**
 * Dónde abrir el menú sin pasar por un botón: el clic derecho (`x`,`y`) o el
 * teclado sobre un elemento (`y` = su borde de abajo, `arriba` = el de arriba,
 * para poder darse vuelta sin taparlo).
 */
export interface PuntoDeMenu {
  x: number;
  y: number;
  arriba?: number;
}

export interface PosicionMenu {
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
  /** Bordes de lo que lo abrió, para reacomodarlo una vez medido. */
  ancla?: { arriba: number; abajo: number };
  medido?: boolean;
}

/** Abre hacia abajo salvo que abajo no entre y arriba haya más sitio. */
export function ubicar(x: number, yArriba: number, yAbajo: number, ancho = ANCHO_MENU): PosicionMenu {
  const left = Math.max(MARGEN, Math.min(x, window.innerWidth - ancho - MARGEN));
  const abajo = window.innerHeight - yAbajo - SEPARACION - MARGEN;
  const arriba = yArriba - SEPARACION - MARGEN;
  if (abajo < 220 && arriba > abajo) {
    return { bottom: window.innerHeight - yArriba + SEPARACION, left, maxHeight: Math.max(160, arriba), ancla: { arriba: yArriba, abajo: yAbajo } };
  }
  return { top: yAbajo + SEPARACION, left, maxHeight: Math.max(160, abajo), ancla: { arriba: yArriba, abajo: yAbajo } };
}

/**
 * Ya medido el menú (`alto` natural): abajo si entra entero; si no, arriba
 * (como Windows); si tampoco, corrido hasta que entre entero en la pantalla.
 * Antes se quedaba abajo con barra de scroll y «Eliminar» quedaba escondido.
 */
export function ajustarAlAlto(p: PosicionMenu, alto: number): PosicionMenu {
  if (p.medido || !p.ancla) return p;
  const vh = window.innerHeight;
  const { arriba, abajo } = p.ancla;
  const base = { left: p.left, ancla: p.ancla, medido: true };
  if (abajo + SEPARACION + alto <= vh - MARGEN) return { ...base, top: abajo + SEPARACION, maxHeight: vh - abajo - SEPARACION - MARGEN };
  if (arriba - SEPARACION - alto >= MARGEN) return { ...base, bottom: vh - arriba + SEPARACION, maxHeight: arriba - SEPARACION - MARGEN };
  const top = Math.max(MARGEN, vh - alto - MARGEN);
  return { ...base, top, maxHeight: vh - top - MARGEN };
}

/** Mide el menú recién dibujado y lo reacomoda antes de pintar (sin saltos). */
export function useMenuQueEntra(
  ref: RefObject<HTMLElement | null>,
  pos: PosicionMenu | null,
  setPos: (p: PosicionMenu) => void,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!pos || pos.medido || !el) return;
    setPos(ajustarAlAlto(pos, el.scrollHeight + el.offsetHeight - el.clientHeight));
  }, [pos, ref, setPos]);
}

/** El punto para abrir el menú de un elemento desde el teclado o su «⋯». */
export function puntoDeElemento(el: Element, alinearDerecha = false): PuntoDeMenu {
  const r = el.getBoundingClientRect();
  return { x: alinearDerecha ? r.right - ANCHO_MENU : r.left + 8, y: r.bottom, arriba: r.top };
}
