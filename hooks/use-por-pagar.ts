"use client";

/**
 * usePorPagar — lo que el negocio debe (F10 «Lo que debo»), tal como lo arma
 * `GET /api/finanzas/por-pagar`.
 *
 * El total, el desglose, el neto y el orden salen del servidor: la pantalla
 * sólo los pinta (regla de totales en backend). Sólo manda la ÚLTIMA carga
 * pedida: dos toques a «Actualizar» y la respuesta lenta de la primera pisaba
 * a la segunda (el mismo cuidado que ya tiene «Por cobrar»).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import type { PorPagarDetalle } from "@/lib/finance/por-pagar";

export const POR_PAGAR_VACIO: PorPagarDetalle = { hoy: "", totales: [], porFuente: [], personas: [], truncado: false };

export interface UsoPorPagar {
  data: PorPagarDetalle;
  loading: boolean;
  /** `null` = sin error. Con error, `data` conserva lo último que llegó bien. */
  error: string | null;
  recargar: () => void;
}

/** ¿La respuesta tiene la forma que la pantalla sabe pintar? */
function esDetalle(v: unknown): v is PorPagarDetalle {
  const d = v as Partial<PorPagarDetalle> | null;
  return !!d && Array.isArray(d.personas) && Array.isArray(d.totales) && Array.isArray(d.porFuente);
}

export function usePorPagar(): UsoPorPagar {
  const [data, setData] = useState<PorPagarDetalle>(POR_PAGAR_VACIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ultima = useRef(0);

  const recargar = useCallback(() => {
    const mia = ++ultima.current;
    setLoading(true);
    setError(null);
    tenantFetch("/api/finanzas/por-pagar")
      .then(async (r) => {
        if (!r.ok) {
          let motivo = `HTTP ${r.status}`;
          try {
            const cuerpo = (await r.json()) as { error?: string } | null;
            if (cuerpo?.error) motivo = cuerpo.error;
          } catch {
            /* El cuerpo no era JSON (un 502 del proxy): queda el código HTTP. */
          }
          throw new Error(motivo);
        }
        return r.json() as Promise<unknown>;
      })
      .then((d) => {
        if (mia !== ultima.current) return;
        if (!esDetalle(d)) throw new Error("Respuesta inesperada");
        setData(d);
      })
      .catch((err: unknown) => {
        if (mia !== ultima.current) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar");
      })
      .finally(() => {
        if (mia === ultima.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { data, loading, error, recargar };
}
