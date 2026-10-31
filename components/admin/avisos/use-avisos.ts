"use client";

import { useCallback, useEffect, useState } from "react";
import type { Aviso } from "./tipos";

/** El historial de avisos (`GET /api/notifications`, los últimos 200). */
export function useAvisos() {
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: unknown) => {
        if (!vivo) return;
        setAvisos(Array.isArray(j) ? (j as Aviso[]) : []);
        setError(false);
      })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  return { avisos, error, recargar };
}
