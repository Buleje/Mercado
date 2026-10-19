"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { RepartoDePestanas } from "@/lib/admin/pestanas-que-entran";

/**
 * Mide qué pestañas entran en una fila (patrón priority+). Lo comparten la
 * barra del módulo (`AdminTabBar`) y la de secciones (`BarraDeSecciones`):
 * mismo cálculo (`lib/admin/pestanas-que-entran.ts`), misma forma de medir.
 *
 * Cómo mide sin oscilar: los anchos salen de un MEDIDOR escondido con una
 * copia de cada pestaña y del «Más» (`[data-medir-pestana]`,
 * `[data-medir-mas]`), y el ancho libre, de cajas cuyo tamaño no depende de
 * cuántas pestañas se ven. Esconder una pestaña no cambia ninguna de las dos
 * cosas, así que el resultado no se realimenta.
 *
 * `null` = sin medir (servidor, primer cuadro, jsdom sin ResizeObserver): la
 * barra dibuja todas como antes. `useLayoutEffect`: el primer cuadro que ve el
 * usuario ya sale repartido.
 */
export function usePestanasQueEntran<R extends RepartoDePestanas>(
  /** Calcula el reparto con lo medido; `null` si todavía no hay con qué. */
  calcular: () => R | null,
  /** Las cajas que, al cambiar de tamaño, piden volver a medir. */
  observar: () => readonly (Element | null | undefined)[],
  /** Cambia cuando cambian las pestañas (llega una tarde, cambia un contador…). */
  clave: string,
): R | null {
  const [reparto, setReparto] = useState<R | null>(null);
  /* Las funciones cambian en cada render; el efecto usa siempre la última sin
     re-suscribirse (el ResizeObserver se arma una vez por `clave`). */
  const calcularRef = useRef(calcular);
  const observarRef = useRef(observar);
  useLayoutEffect(() => {
    calcularRef.current = calcular;
    observarRef.current = observar;
  });

  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    let ultimo = "";
    const medir = () => {
      const nuevo = calcularRef.current();
      const firma = JSON.stringify(nuevo);
      if (firma === ultimo) return;
      ultimo = firma;
      setReparto(nuevo);
    };
    medir();
    const ro = new ResizeObserver(medir);
    for (const el of observarRef.current()) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [clave]);

  return reparto;
}

/**
 * ¿Se dibuja el medidor? Recién en el navegador y con ResizeObserver: ni en
 * el HTML del servidor (no hay con qué medir y no coincidiría al hidratar) ni
 * en jsdom. Pasa a `true` antes del primer cuadro (`useLayoutEffect`).
 */
export function useConMedidor(): boolean {
  const [con, setCon] = useState(false);
  useLayoutEffect(() => setCon(typeof ResizeObserver !== "undefined"), []);
  return con;
}

export interface MedidasDelMedidor {
  anchos: Record<string, number>;
  /** Ancho del «Más» MÁS la separación que lo aparta de la última pestaña. */
  anchoMas: number;
  separacion: number;
}

const px = (valor: string) => Number.parseFloat(valor) || 0;

/** Lee el medidor escondido: ancho de cada copia y del «Más», y el `gap` entre ellas. */
export function leerMedidor(medidor: HTMLElement | null): MedidasDelMedidor | null {
  if (!medidor) return null;
  const anchos: Record<string, number> = {};
  for (const el of Array.from(medidor.querySelectorAll<HTMLElement>("[data-medir-pestana]"))) {
    const id = el.dataset.medirPestana;
    if (id) anchos[id] = el.getBoundingClientRect().width;
  }
  const separacion = px(getComputedStyle(medidor).columnGap);
  const mas = medidor.querySelector<HTMLElement>("[data-medir-mas]");
  return { anchos, separacion, anchoMas: (mas?.getBoundingClientRect().width ?? 0) + separacion };
}

/** Ancho útil de una caja: el de adentro, sin su padding. */
export function anchoUtil(el: HTMLElement | null): number {
  if (!el) return 0;
  const s = getComputedStyle(el);
  return el.clientWidth - px(s.paddingLeft) - px(s.paddingRight);
}

/** Ancho de una caja con su separación delante (`gap` del padre); 0 si no está. */
export function anchoConSeparacion(el: Element | null | undefined, separacion: number): number {
  return el ? el.getBoundingClientRect().width + separacion : 0;
}

/** `gap` horizontal de una caja flex. */
export function separacionDe(el: HTMLElement | null): number {
  return el ? px(getComputedStyle(el).columnGap) : 0;
}

/** Padding horizontal de una caja. */
export function paddingX(el: HTMLElement | null): number {
  if (!el) return 0;
  const s = getComputedStyle(el);
  return px(s.paddingLeft) + px(s.paddingRight);
}
