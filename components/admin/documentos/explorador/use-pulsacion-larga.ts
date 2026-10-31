"use client";

/**
 * Mantener presionado con el dedo = clic derecho.
 *
 * Android Chrome ya dispara `contextmenu` al mantener presionado, pero iOS
 * Safari no: sin esto, en un iPhone no había forma de llegar al menú de una
 * carpeta. Si los dos llegan (Android), el segundo se ignora para no abrir el
 * menú dos veces. También dice si el último toque fue con el dedo: en el
 * celular un toque abre, como el doble clic en la compu.
 */

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { PuntoDeMenu } from "./ubicar-menu";

const ESPERA_MS = 500;
/** Más que esto de movimiento es scroll, no una pulsación. */
const TOLERANCIA_PX = 10;

export function usePulsacionLarga(alPulsar: (punto: PuntoDeMenu) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  /** El tipo del último puntero que tocó: `touch`, `pen` o `mouse`. */
  const tipo = useRef<string>("mouse");
  /** Ya abrió el menú en este toque. */
  const disparo = useRef(false);
  const alPulsarRef = useRef(alPulsar);
  useEffect(() => { alPulsarRef.current = alPulsar; }, [alPulsar]);

  const cancelar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    inicio.current = null;
  }, []);
  useEffect(() => cancelar, [cancelar]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    tipo.current = e.pointerType;
    disparo.current = false;
    if (e.pointerType === "mouse") return;
    cancelar();
    inicio.current = { x: e.clientX, y: e.clientY };
    const { clientX: x, clientY: y } = e;
    timer.current = setTimeout(() => {
      timer.current = null;
      disparo.current = true;
      alPulsarRef.current({ x, y });
    }, ESPERA_MS);
  }, [cancelar]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const o = inicio.current;
    if (!o) return;
    if (Math.abs(e.clientX - o.x) > TOLERANCIA_PX || Math.abs(e.clientY - o.y) > TOLERANCIA_PX) cancelar();
  }, [cancelar]);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp: cancelar, onPointerCancel: cancelar },
    /** El último toque fue con el dedo (o lápiz). */
    esTactil: () => tipo.current !== "mouse",
    /**
     * La pulsación larga ya abrió el menú: el `click` (iOS) y el `contextmenu`
     * (Android) que llegan al soltar no cuentan. Se limpia en el próximo toque.
     */
    yaDisparo: () => disparo.current,
    /** El `contextmenu` de Android llegó antes que el temporizador: que no abra otra vez. */
    marcarDisparo: () => {
      cancelar();
      disparo.current = true;
    },
  };
}
