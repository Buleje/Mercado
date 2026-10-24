"use client";

/**
 * En qué aparato se mira el panel (para «En vivo») y un reloj de minuto (para
 * «hace X»). Con `useSyncExternalStore`: el servidor dibuja «pc» y el reloj del
 * render, y el navegador corrige al hidratar sin aviso de desajuste.
 */

import { useSyncExternalStore } from "react";
import { plataformaDe, type Plataforma } from "./hik-connect";

const nada = () => () => {};

export function usePlataforma(): Plataforma {
  return useSyncExternalStore(
    nada,
    () => plataformaDe(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    () => "pc",
  );
}

/* Un solo intervalo para todas las filas que dicen «hace X». */
let ahora = Date.now();
const oyentes = new Set<() => void>();
let reloj: ReturnType<typeof setInterval> | null = null;

function suscribir(avisar: () => void): () => void {
  oyentes.add(avisar);
  if (!reloj) {
    /* La pantalla pudo quedar abierta sin filas: React relee la hora al suscribir. */
    ahora = Date.now();
    reloj = setInterval(() => {
      ahora = Date.now();
      oyentes.forEach((o) => o());
    }, 60_000);
  }
  return () => {
    oyentes.delete(avisar);
    if (oyentes.size === 0 && reloj) {
      clearInterval(reloj);
      reloj = null;
    }
  };
}

/** La hora de ahora, que avanza de minuto en minuto. */
export function useAhora(): number {
  return useSyncExternalStore(
    suscribir,
    () => ahora,
    () => ahora,
  );
}
