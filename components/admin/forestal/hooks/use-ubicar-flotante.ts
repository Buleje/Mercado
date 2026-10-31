"use client";

/**
 * use-ubicar-flotante — dónde se dibuja el detalle flotante de un día.
 *
 * En un PORTAL, dentro del `[role="dialog"]` más cercano al casillero (o en
 * `body` si no hay), con `position: fixed`. «Declarar producción» monta la tira
 * DENTRO del cuerpo que scrollea de un `AdminModal` (`overflow-hidden` +
 * `overflow-y-auto`) y un panel `absolute` colgado del casillero quedaba
 * recortado. Portalear adentro del diálogo —no a `body`— es lo que aprendió
 * `ActionMenu`: Radix apaga los clics de todo lo que queda fuera de su
 * `Dialog.Content`, y su «clic afuera» cerraría el modal.
 *
 * El alto sale del espacio visible DENTRO del diálogo (recortado por la
 * ventana), no de `window.innerHeight`: ahí abajo puede estar el pie del modal.
 */

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { marcoDeFixed } from "@/components/admin/shared/action-menu";

export interface LugarDelFlotante {
  destino: HTMLElement;
  left: number;
  ancho: number;
  /** Abre hacia abajo: distancia desde arriba del marco. */
  top?: number;
  /** Abre hacia arriba: distancia desde abajo del marco. */
  bottom?: number;
  /** Para la caja; el puente de mouse va aparte. */
  maxAlto: number;
  arriba: boolean;
}

/** Aire contra el borde del diálogo o de la ventana. */
const MARGEN = 8;
/** 20 rem: el ancho de siempre, si quien abre no pide otro. */
const ANCHO = 320;
/** El puente transparente entre casillero y caja (`pt-1.5`). */
const PUENTE = 6;
/** Con menos lugar abajo, se abre hacia arriba si arriba hay más. */
const ALTO_MINIMO_ABAJO = 260;

const igual = (a: LugarDelFlotante | null, b: LugarDelFlotante) =>
  !!a &&
  a.destino === b.destino &&
  a.left === b.left &&
  a.ancho === b.ancho &&
  a.top === b.top &&
  a.bottom === b.bottom &&
  a.maxAlto === b.maxAlto &&
  a.arriba === b.arriba;

/**
 * @param clave  la del casillero (`data-casillero`), que es el ancla.
 * @param columna 0 = lunes … 6 = domingo: el lunes abre a la derecha, el domingo a la izquierda.
 * @param anchoDeseado lo que pide el contenido; se achica a lo que entra en el diálogo.
 * @param altoNecesario lo que mide el contenido entero (lo mide el panel). Si
 *   abajo del casillero no entra, el panel SUBE lo justo —tapando la tira,
 *   nunca el borde del diálogo— en vez de scrollear: medido a 400 px, el día
 *   real más cargado pedía 604 px y abajo había 539 (2026-09-23).
 */
export function useUbicarFlotante(
  clave: string,
  columna: number,
  altoMaximo: number,
  anchoDeseado = ANCHO,
  altoNecesario?: number,
): LugarDelFlotante | null {
  const [lugar, setLugar] = useState<LugarDelFlotante | null>(null);

  const ubicar = useCallback(() => {
    const ancla = [...document.querySelectorAll<HTMLElement>("[data-casillero]")].find(
      (el) => el.getAttribute("data-casillero") === clave,
    );
    if (!ancla) return;
    const dialogo = ancla.closest<HTMLElement>('[role="dialog"]');
    const a = ancla.getBoundingClientRect();

    /* Lo visible: el diálogo, recortado por la ventana. */
    const d = dialogo?.getBoundingClientRect();
    const conDialogo = !!d && d.width > 0 && d.height > 0;
    const vis = {
      left: Math.max(0, conDialogo && d ? d.left : 0),
      right: Math.min(window.innerWidth, conDialogo && d ? d.right : window.innerWidth),
      top: Math.max(0, conDialogo && d ? d.top : 0),
      bottom: Math.min(window.innerHeight, conDialogo && d ? d.bottom : window.innerHeight),
    };
    /* `fixed` se resuelve contra el diálogo si éste tiene `translate` (así
       centra Radix); si no, contra la ventana. */
    const marco = marcoDeFixed(dialogo);
    const base = { left: marco?.left ?? 0, top: marco?.top ?? 0, height: marco?.height ?? window.innerHeight };

    const ancho = Math.max(0, Math.min(anchoDeseado, vis.right - vis.left - MARGEN * 2));
    const deseado =
      columna <= 2 ? a.left : columna >= 4 ? a.right - ancho : a.left + (a.width - ancho) / 2;
    const x = Math.max(vis.left + MARGEN, Math.min(deseado, vis.right - MARGEN - ancho));

    const abajo = vis.bottom - a.bottom - MARGEN - PUENTE;
    const arriba = a.top - vis.top - MARGEN - PUENTE;
    const haciaArriba = abajo < ALTO_MINIMO_ABAJO && arriba > abajo;
    /* Abajo no entra entero: se sube el panel hasta que entre (o hasta el
       borde de arriba de lo visible). El puente con el casillero se pierde,
       pero el panel ya tiene su «×» y el mouse que entra lo mantiene abierto. */
    const necesita = Math.min(altoNecesario ?? 0, altoMaximo);
    const subir = !haciaArriba && necesita > abajo;
    const topSubido = subir ? Math.max(vis.top + MARGEN, vis.bottom - MARGEN - PUENTE - necesita) : 0;
    const nuevo: LugarDelFlotante = {
      destino: dialogo ?? document.body,
      left: Math.round(x - base.left),
      ancho,
      maxAlto: Math.max(
        0,
        Math.round(Math.min(altoMaximo, haciaArriba ? arriba : subir ? vis.bottom - MARGEN - PUENTE - topSubido : abajo)),
      ),
      arriba: haciaArriba,
      ...(haciaArriba
        ? { bottom: Math.round(base.height - (a.top - base.top)) }
        : { top: Math.round((subir ? topSubido : a.bottom) - base.top) }),
    };
    /* Scrollear adentro del panel también dispara `scroll`: sin esto, cada
       rueda sería un render con la misma posición. */
    setLugar((prev) => (igual(prev, nuevo) ? prev : nuevo));
  }, [clave, columna, altoMaximo, anchoDeseado, altoNecesario]);

  /* Antes de pintar: si no, el panel aparece un frame en la esquina. */
  useLayoutEffect(() => {
    ubicar();
  }, [ubicar]);

  /* El casillero se mueve con el cuerpo que scrollea (captura, para enterarse
     del scroll de los contenedores internos) y con la ventana. */
  useEffect(() => {
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [ubicar]);

  return lugar;
}
