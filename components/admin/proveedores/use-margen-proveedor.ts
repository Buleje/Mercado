"use client";

/** Datos de «Cuánto ganas con cada proveedor» (`/api/analytics/margen-por-proveedor`). */
import { useEffect, useState } from "react";
import type { MargenPorProveedor } from "@/lib/analytics/margen-por-proveedor";

export type DiasMargen = "7" | "30" | "90";
export type RespuestaMargen = MargenPorProveedor & { periodDays: number; since: string };

export function useMargenProveedor(dias: DiasMargen) {
  const [datos, setDatos] = useState<RespuestaMargen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(false);
    void fetch(`/api/analytics/margen-por-proveedor?days=${dias}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as RespuestaMargen;
        if (vivo) setDatos(d);
      })
      .catch(() => { if (vivo) setError(true); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [dias, vuelta]);

  return { datos, cargando, error, reintentar: () => setVuelta((v) => v + 1) };
}
