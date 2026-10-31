"use client";

/**
 * Arrastrar el borde de la testa elegida en «Medir por foto» (F4, 16-10): el
 * Ø cambia en la misma proporción que la distancia del dedo al centro, de a
 * 0,1 cm. Se aplica como sumas a `ajustar` (lo mismo que − y +): así la tabla
 * suelta lo tipeado en ese D, igual que con los botones.
 *
 * El clic que el navegador dispara al soltar no es un toque: `fueArrastre()`
 * lo dice una vez y el lienzo no elige ni recorta nada con él.
 */
import { useCallback, useRef, type PointerEvent } from "react";
import type { TestaPropuesta } from "@/lib/forestal/testas-medicion";

interface Arrastre {
  id: string;
  cx: number;
  cy: number;
  /** Distancia del dedo al centro al empezar (px de la foto) y el Ø de ese momento. */
  d0: number;
  dCm0: number;
  /** El Ø ya pedido: la próxima suma sale de acá, no de la testa (que llega un render después). */
  pedido: number;
}

const a1 = (n: number) => Math.round(n * 10) / 10;

/** El punto del puntero en px de la foto (el `viewBox` del lienzo). */
function enLaFoto(e: PointerEvent<SVGElement>): DOMPoint | null {
  const svg = e.currentTarget.ownerSVGElement;
  const ctm = svg?.getScreenCTM();
  return ctm ? new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse()) : null;
}

export function useArrastrarBorde(ajustar: (id: string, deltaCm: number) => void) {
  const actual = useRef<Arrastre | null>(null);
  const movio = useRef(false);

  const empezar = useCallback((t: TestaPropuesta, e: PointerEvent<SVGElement>) => {
    const p = enLaFoto(e);
    if (!p) return;
    e.stopPropagation();
    /* Con el puntero capturado, el dedo puede salir del aro sin soltar la testa. */
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Un puntero sintético (pruebas) no se captura: el arrastre sigue igual mientras esté encima. */
    }
    actual.current = { id: t.id, cx: t.cx, cy: t.cy, d0: Math.max(1, Math.hypot(p.x - t.cx, p.y - t.cy)), dCm0: t.dCm, pedido: t.dCm };
    movio.current = false;
  }, []);

  const mover = useCallback(
    (e: PointerEvent<SVGElement>) => {
      const a = actual.current;
      const p = a && enLaFoto(e);
      if (!a || !p) return;
      const objetivo = a1((a.dCm0 * Math.hypot(p.x - a.cx, p.y - a.cy)) / a.d0);
      if (objetivo === a.pedido || objetivo <= 0) return;
      movio.current = true;
      ajustar(a.id, a1(objetivo - a.pedido));
      a.pedido = objetivo;
    },
    [ajustar],
  );

  const soltar = useCallback(() => {
    actual.current = null;
  }, []);

  /** ¿El clic que llega viene de soltar un arrastre? Responde una sola vez. */
  const fueArrastre = useCallback(() => {
    const m = movio.current;
    movio.current = false;
    return m;
  }, []);

  return { empezar, mover, soltar, fueArrastre };
}
