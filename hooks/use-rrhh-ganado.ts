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
import { sinDato } from "@/lib/errores/sin-dato";

export interface UseRrhhGanadoResult {
  ganado: GanadoDTO | null;
  loading: boolean;
  error: string | null;
  recargar: () => void;
}

export function useRrhhGanado(desde: FechaKey, hasta: FechaKey, colaboradorId?: string, activo = true): UseRrhhGanadoResult {
  const [ganado, setGanado] = useState<GanadoDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Lo ganado es sólo del nivel completo: la hoja semanal lo monta para todos
    // los roles, y sin esto manager y almacenero dejaban un 403 por apertura.
    if (!activo) {
      setGanado(null);
      setLoading(false);
      return;
    }
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
        sinDato("RRHH lo ganado")(err);
        if (vigente) setError(err instanceof Error ? err.message : "No se pudo calcular lo ganado");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [desde, hasta, colaboradorId, tick, activo]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  return { ganado, loading, error, recargar };
}
