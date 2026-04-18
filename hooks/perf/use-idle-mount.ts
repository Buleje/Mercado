"use client";

import { useEffect, useState } from "react";

/**
 * useIdleMount — monta componente despues del idle del navegador.
 *
 * Critico para LCP/INP: componentes pesados (mapas, charts pesados,
 * widgets terceros) se montan cuando el navegador esta idle, no
 * compiten con render critico.
 *
 * Usa requestIdleCallback con fallback setTimeout para Safari.
 *
 * @example
 * const ready = useIdleMount(2000); // 2s delay + idle
 * if (!ready) return null;
 * return <HeavyComponent />;
 */
export function useIdleMount(delayMs = 1000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const timer = setTimeout(() => {
      type WindowWithIdle = Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      };
      const w = window as WindowWithIdle;
      if (typeof w.requestIdleCallback === "function") {
        w.requestIdleCallback(() => setReady(true), { timeout: 4000 });
      } else {
        setReady(true);
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [delayMs]);

  return ready;
}
