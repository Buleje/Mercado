"use client";

/**
 * Los datos de Mi Plata › Fiarle: `GET /api/finanzas/a-quien-fiarle`. El
 * veredicto, el motivo y las sumas vienen hechos del servidor; acá sólo se
 * filtran las filas. Una respuesta vieja nunca pisa a una nueva.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import type { AQuienFiarle } from "@/lib/db/a-quien-fiarle.db";

export const A_QUIEN_FIARLE_VACIO: AQuienFiarle = {
  hoy: "",
  filas: [],
  resumen: { clientes: 0, si: 0, cuidado: 0, no: 0, deuda: 0, vencido: 0, sinHistorial: 0 },
};

function esRespuesta(v: unknown): v is AQuienFiarle {
  const d = v as Partial<AQuienFiarle> | null;
  return !!d && Array.isArray(d.filas) && !!d.resumen;
}

export function useAQuienFiarle() {
  const [data, setData] = useState<AQuienFiarle>(A_QUIEN_FIARLE_VACIO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ultima = useRef(0);

  const recargar = useCallback(() => {
    const mia = ++ultima.current;
    setLoading(true);
    setError(null);
    tenantFetch("/api/finanzas/a-quien-fiarle")
      .then(async (r) => {
        const cuerpo = (await r.json().catch(() => null)) as unknown;
        if (!r.ok) throw new Error((cuerpo as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
        if (!esRespuesta(cuerpo)) throw new Error("Respuesta inesperada");
        return cuerpo;
      })
      .then((d) => {
        if (mia === ultima.current) setData(d);
      })
      .catch((err: unknown) => {
        if (mia === ultima.current) setError(err instanceof Error ? err.message : "No se pudo cargar");
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
