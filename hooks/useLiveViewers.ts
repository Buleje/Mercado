"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useLiveViewers — polling mock para simular viewers en una transmisión live.
 *
 * Cada 3s ajusta el contador ±N viewers con un pequeño drift, simulando
 * gente entrando/saliendo. Cuando haya WebSocket real, reemplazar el
 * setInterval por un subscribe al canal del live.
 *
 * @param initial Viewers iniciales
 * @param active  Si el live está activo — si no, congela el contador
 * @returns viewers actuales (acotado a [>=0])
 */
export function useLiveViewers(initial: number, active = true): number {
  const [viewers, setViewers] = useState<number>(initial);
  const tickRef = useRef(0);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!activeRef.current) return;
      tickRef.current += 1;
      const burst = tickRef.current % 7 === 0;
      const delta = burst
        ? Math.floor(Math.random() * 6) - 2
        : Math.floor(Math.random() * 3) - 1;
      setViewers((prev) => Math.max(0, prev + delta));
    }, 3000);

    return () => clearInterval(id);
  }, []);

  return viewers;
}
