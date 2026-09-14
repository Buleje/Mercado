"use client";

/**
 * use-rrhh-ganado — lo ganado de referencia por período (ADR-414 §5).
 *
 * Sólo nivel completo (el servidor devuelve 403 al resto — el hub ya filtra
 * la sub-pestaña antes de montar esto). El cálculo es SIEMPRE del servidor:
 * este hook no reimplementa `calcularGanado`, sólo pinta lo que vuelve.
 */

import { useCallback, useEffect, useState } from "react";
import type { FechaKey, GanadoDTO } from "@/lib/rrhh/tipos";

export interface UseRrhhGanadoResult {
  ganado: GanadoDTO | null;
  loading: boolean;
  error: string | null;
  recargar: () => void;
}

export function useRrhhGanado(desde: FechaKey, hasta: FechaKey, colaboradorId?: string): UseRrhhGanadoResult {
  const [ganado, setGanado] = useState<GanadoDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ desde, hasta });
    if (colaboradorId) q.set("colaboradorId", colaboradorId);
    fetch(`/api/rrhh/ganado?${q.toString()}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Lo ganado es sólo para admin/owner" : "No se pudo calcular lo ganado");
        return r.json() as Promise<GanadoDTO>;
      })
      .then((data) => {
        if (vigente) setGanado(data);
      })
      .catch((err) => {
        console.error("[rrhh] ganado falló", err);
        if (vigente) setError(err instanceof Error ? err.message : "No se pudo calcular lo ganado");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [desde, hasta, colaboradorId, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  return { ganado, loading, error, recargar };
}
