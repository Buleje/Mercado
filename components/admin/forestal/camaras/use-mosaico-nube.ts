"use client";

/**
 * El reloj de inactividad del mosaico (ADR-471): UNO para todos los cuadros.
 * Cada toque en cualquier cuadro lo reinicia; a los 5 min sin tocar, pausa a
 * todos juntos (cada cuadro suelta su reproductor) y «Seguir viendo» los
 * vuelve a pedir. Cada cuadro sigue con su propio «Reintentar» si falla.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MINUTOS_SIN_TOCAR } from "./hik-connect-teams";

/** Entre un pedido y el siguiente: Hikvision corta a más de 5 pedidos por segundo. */
export const RETRASO_ENTRE_CUADROS_MS = 600;

/** «el doble», «el triple»… para el aviso de batería y datos. */
export function vecesMas(n: number): string {
  if (n <= 2) return "el doble";
  if (n === 3) return "el triple";
  return `${n} veces más`;
}

export function useMosaicoNube() {
  const [cortado, setCortado] = useState(false);
  const corte = useRef<ReturnType<typeof setTimeout> | null>(null);

  const actividad = useCallback(() => {
    if (corte.current) clearTimeout(corte.current);
    corte.current = setTimeout(() => setCortado(true), MINUTOS_SIN_TOCAR * 60_000);
  }, []);

  useEffect(() => {
    if (!cortado) actividad();
    return () => {
      if (corte.current) clearTimeout(corte.current);
    };
  }, [cortado, actividad]);

  const seguir = useCallback(() => setCortado(false), []);
  return { cortado, actividad, seguir };
}
