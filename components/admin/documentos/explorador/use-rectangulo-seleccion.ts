"use client";

/**
 * Elegir varios arrastrando un rectángulo sobre el fondo, como en Windows.
 * Sólo con mouse (con el dedo, arrastrar es hacer scroll) y sólo si arranca en
 * el fondo: sobre un elemento, arrastrar es moverlo. Con Ctrl suma a lo que ya
 * estaba elegido. Un clic en el fondo sin arrastrar vacía la selección.
 */

import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

export interface Caja {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** ¿Se tocan los dos rectángulos (en coordenadas de pantalla)? */
export const seTocan = (a: Caja, b: Caja) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

const UMBRAL_PX = 4;

interface Deps {
  contenedor: RefObject<HTMLElement | null>;
  /** Lo que queda dentro del rectángulo (más lo de antes si había Ctrl). */
  alElegir: (claves: string[]) => void;
  alLimpiar: () => void;
  /** Lo elegido al empezar (para sumar con Ctrl). */
  base: () => Iterable<string>;
}

type Inicio = { x: number; y: number; id: number; sumar: boolean; antes: string[]; activo: boolean };

export function useRectanguloSeleccion({ contenedor, alElegir, alLimpiar, base }: Deps) {
  const inicio = useRef<Inicio | null>(null);
  const [caja, setCaja] = useState<Caja | null>(null);

  const terminar = (e: ReactPointerEvent<HTMLElement>) => {
    const i = inicio.current;
    inicio.current = null;
    setCaja(null);
    if (!i) return;
    if (e.currentTarget.hasPointerCapture?.(i.id)) e.currentTarget.releasePointerCapture(i.id);
    if (!i.activo && !i.sumar) alLimpiar();
  };

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest("[data-clave], button, a, input, [role=button]")) return;
      const c = contenedor.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const sumar = e.ctrlKey || e.metaKey;
      inicio.current = { x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId, sumar, antes: sumar ? [...base()] : [], activo: false };
      c.focus({ preventScroll: true });
      e.currentTarget.setPointerCapture?.(e.pointerId);
      // Sin esto el navegador empieza a seleccionar el texto de los nombres.
      e.preventDefault();
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const i = inicio.current;
      const c = contenedor.current;
      if (!i || !c) return;
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (!i.activo && Math.abs(x - i.x) < UMBRAL_PX && Math.abs(y - i.y) < UMBRAL_PX) return;
      i.activo = true;
      const local: Caja = { left: Math.min(x, i.x), top: Math.min(y, i.y), width: Math.abs(x - i.x), height: Math.abs(y - i.y) };
      setCaja(local);
      const enPantalla: Caja = { ...local, left: local.left + r.left, top: local.top + r.top };
      const dentro: string[] = [];
      for (const el of c.querySelectorAll<HTMLElement>("[data-clave]")) {
        const b = el.getBoundingClientRect();
        if (seTocan(enPantalla, b) && el.dataset.clave) dentro.push(el.dataset.clave);
      }
      alElegir(i.sumar ? [...new Set([...i.antes, ...dentro])] : dentro);
    },
    onPointerUp: terminar,
    onPointerCancel: terminar,
  };

  return { handlers, caja };
}
