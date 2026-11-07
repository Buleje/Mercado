"use client";

/**
 * El candado del cuadre (Brandon, 2026-10-03): si la distribución «difiere»,
 * sacar el papel —descargar, imprimir, guardar— pide confirmar antes.
 *
 * Avisa, no bloquea: «Emitir igual» sigue la acción. Y pregunta UNA vez por
 * diferencia: aceptada «No cuadra por 0.242 m³», imprimir después no vuelve
 * a preguntar lo mismo; si la diferencia cambia, sí.
 */
import { useCallback, useState } from "react";
import { cuadreFrena, type CuadreDelPapel } from "@/lib/forestal/cuadre-del-papel";

export interface CandadoCuadre {
  /** ¿La próxima salida pide confirmar? */
  frena: boolean;
  /** Envuelve una acción: si frena, abre la confirmación; si no, la corre. */
  conCandado: (accion: () => void) => () => void;
  /** Hay una acción esperando la confirmación (el diálogo está abierto). */
  pidiendo: boolean;
  confirmar: () => void;
  cancelar: () => void;
}

export function useCandadoCuadre(cuadre: CuadreDelPapel | null | undefined): CandadoCuadre {
  const [pendiente, setPendiente] = useState<(() => void) | null>(null);
  const [aceptada, setAceptada] = useState<string | null>(null);
  const frena = cuadreFrena(cuadre) && aceptada !== cuadre?.frase;

  const conCandado = useCallback(
    (accion: () => void) => () => {
      /* La acción se guarda envuelta: `setState(fn)` la ejecutaría como updater. */
      if (frena) setPendiente(() => accion);
      else accion();
    },
    [frena],
  );
  /* La acción se corre desde el closure, no desde un updater: en StrictMode
     React llama los updaters dos veces y el PDF saldría dos veces. */
  const confirmar = useCallback(() => {
    setAceptada(cuadre?.frase ?? null);
    setPendiente(null);
    pendiente?.();
  }, [cuadre?.frase, pendiente]);
  const cancelar = useCallback(() => setPendiente(null), []);

  return { frena, conCandado, pidiendo: pendiente != null, confirmar, cancelar };
}
