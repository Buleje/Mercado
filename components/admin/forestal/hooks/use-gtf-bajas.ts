"use client";

/**
 * Las guías dadas de baja (anuladas + borradas) para la pestaña «Anuladas y
 * otras» de la vista GTF del Libro TH. Mismo permiso que la lista de vigentes
 * (`permisoQuery`); se vuelve a pedir cuando sube `senal` (cada escritura del
 * libro o de la vista) o con `recargar` (el «Reintentar»).
 */

import { useCallback, useEffect, useState } from "react";
import type { Gtf } from "../gtf-tabla-columnas";

export interface UseGtfBajas {
  bajas: Gtf[];
  cargando: boolean;
  error: string | null;
  recargar: () => void;
}

export function useGtfBajas(permisoListo: boolean, permisoQuery: string, senal = 0): UseGtfBajas {
  const [bajas, setBajas] = useState<Gtf[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!permisoListo) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    fetch(`/api/admin/forestal/gtf?estado=bajas${permisoQuery ? `&${permisoQuery}` : ""}`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`No se pudo leer las guías anuladas (HTTP ${r.status}).`);
        const j = (await r.json()) as { gtfs?: Gtf[] };
        if (vivo) setBajas(j.gtfs ?? []);
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        /* Sin lista no se deja la del filtro anterior: se vacía y se dice. */
        setBajas([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [permisoListo, permisoQuery, senal, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { bajas, cargando, error, recargar };
}
