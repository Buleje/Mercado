"use client";

/**
 * El hueco de la barra de trabajo donde cae «Indicadores» (08-10).
 *
 * `LothSeccionKpis` (el título y las cifras de la sección) y `LothSeccionBarra`
 * (Opciones, Nueva línea…) son hermanos en el libro: ninguno contiene al otro.
 * Brandon pidió el botón «Indicadores» en la MISMA fila que los demás botones,
 * no en la del título. La barra registra acá su hueco y las cifras ponen su
 * botón adentro con un portal; sin barra (otra pantalla que reuse las cifras)
 * el botón se queda donde estaba.
 */

import { useSyncExternalStore } from "react";

let hueco: HTMLElement | null = null;
const oyentes = new Set<() => void>();

/** `ref` de la barra: el elemento donde aterriza el botón (o `null` al desmontarse). */
export function registrarHuecoIndicadores(el: HTMLElement | null) {
  if (hueco === el) return;
  hueco = el;
  oyentes.forEach((f) => f());
}

export function useHuecoIndicadores(): HTMLElement | null {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => hueco,
    () => null,
  );
}
