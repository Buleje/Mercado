"use client";

/**
 * Ventaneo manual de una tabla larga: monta sólo lo que se ve.
 *
 * Nació en el cubicador de aserrada, donde un lote de 683 filas × ~10 controles
 * por fila colgaba el tab al montar (CPU profile real, no una sospecha: el
 * problema era crear miles de nodos en un solo commit de React, no re-renderizar
 * — por eso memoizar la fila no alcanzaba). Se sacó acá para que el cubicador de
 * TROZAS no repita el mismo cuelgue con el primer camión grande.
 *
 * Por debajo del umbral se rinde TODO, sin costo de ventaneo, para el caso
 * común. La lista se recorta con dos `<tr>` colchón de altura reservada, así el
 * scrollbar mide lo mismo que si estuvieran todas.
 *
 * ## Tres candados que se ganaron con un bug de scroll que no se asentaba
 *
 * 1. **El alto de fila se mide UNA vez por activación**, siempre contra la misma
 *    referencia. Cuando se medía en un efecto con `altoFila` en las
 *    dependencias, y con el ref en la primera fila de la VENTANA (que cambia con
 *    cada scroll), medir otra fila escribía otro alto, eso movía los colchones,
 *    el navegador re-encuadraba el scroll y traía otra fila a medir. Un lazo que
 *    no se asienta: el scroll «subía y bajaba» solo.
 * 2. **El alto del visor es un número que entra por parámetro**, no derivado de
 *    la medición. Cualquier camino de vuelta de la medición hacia el scroll
 *    reabre el lazo.
 * 3. **`overflow-anchor: none` en el contenedor.** El anclaje automático de
 *    Chrome corrige la posición cuando cambia el alto de algo de arriba, y los
 *    colchones cambian de alto en cada scroll: pelea contra el cálculo.
 *
 * El scroll se lee por frame: un `setState` por evento de rueda encola decenas
 * de renders de una tabla con controles en cada celda.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type UIEvent } from "react";

/** Filas de más montadas arriba y abajo del área visible. */
const SOBREMONTAJE = 20;

export interface OpcionesVentaneo {
  /** Debajo de esto se rinde la tabla entera. */
  umbral?: number;
  /** Alto del área visible, en px. Constante mientras se scrollea (candado 2). */
  altoVisor: number;
  /** Alto de fila con el que se arranca, antes de medir el real. */
  altoFilaInicial?: number;
}

export function useTablaVentaneada<T>(filas: T[], opts: OpcionesVentaneo) {
  const { umbral = 150, altoVisor, altoFilaInicial = 44 } = opts;
  const virtualizar = filas.length > umbral;

  const [altoFila, setAltoFila] = useState(altoFilaInicial);
  const [scrollTop, setScrollTop] = useState(0);
  const primeraFilaRef = useRef<HTMLTableRowElement | null>(null);
  const medido = useRef(false);

  const medirAltoFila = useCallback(() => {
    const h = primeraFilaRef.current?.getBoundingClientRect().height;
    if (!h) return;
    medido.current = true;
    /* Se compara contra lo que hay en el DOM, no contra el estado: el
       `setState` sale sólo cuando el número cambia de verdad. */
    setAltoFila((prev) => (Math.abs(h - prev) > 1 ? h : prev));
  }, []);

  useEffect(() => {
    if (!virtualizar) { medido.current = false; return; }
    if (medido.current) return;
    medirAltoFila();
  }, [virtualizar, filas.length, medirAltoFila]);

  /* Se vuelve a medir al cambiar el ancho de la ventana —una columna que se
     apila cambia el alto de la fila—, nunca al scrollear. Un reflow ya movió
     todo: un ajuste más no se nota. */
  useEffect(() => {
    if (!virtualizar) return;
    window.addEventListener("resize", medirAltoFila);
    return () => window.removeEventListener("resize", medirAltoFila);
  }, [virtualizar, medirAltoFila]);

  const frame = useRef<number | null>(null);
  const onScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const y = e.currentTarget.scrollTop;
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setScrollTop(y);
    });
  }, []);
  useEffect(() => () => { if (frame.current != null) cancelAnimationFrame(frame.current); }, []);

  const inicioVentana = virtualizar ? Math.max(0, Math.floor(scrollTop / altoFila) - SOBREMONTAJE) : 0;
  const finVentana = virtualizar
    ? Math.min(filas.length, Math.ceil((scrollTop + altoVisor) / altoFila) + SOBREMONTAJE)
    : filas.length;

  return {
    virtualizar,
    /** Lo que hay que renderizar ahora mismo. */
    filasEnVentana: virtualizar ? filas.slice(inicioVentana, finVentana) : filas,
    /** Posición real de la primera fila montada — para numerar y para el teclado. */
    inicioVentana,
    colchonSuperior: virtualizar ? inicioVentana * altoFila : 0,
    colchonInferior: virtualizar ? (filas.length - finVentana) * altoFila : 0,
    /** Va en el `<tr>` de la PRIMERA fila montada (`i === 0`). */
    primeraFilaRef,
    /** Se esparce en el contenedor con scroll. */
    propsContenedor: virtualizar
      ? {
          style: { maxHeight: altoVisor, overflowY: "auto", overflowAnchor: "none" } as CSSProperties,
          onScroll,
        }
      : {},
  };
}
