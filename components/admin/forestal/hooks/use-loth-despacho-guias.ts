"use client";

/**
 * Las guías emitidas del permiso elegido, para el Despacho de trozas del Libro
 * TH (08-10): destino, placa, transportista, conductor y si ya entró al CTP
 * (`?conCtp=1`, lo calcula el servidor). Una consulta para la vista «Por guía»
 * y el detalle de cada despacho; se vuelve a pedir con cada escritura del libro.
 *
 * Falla blanda: sin la lista, las filas siguen (salen del libro) y sólo faltan
 * los datos de la guía — «no la encontré» y «no la busqué» no son lo mismo.
 */

import { useEffect, useState } from "react";
import { datosDeGuia, type GtfDeLaApi, type GuiaDelDespacho } from "@/lib/forestal/loth-despacho-por-guia";

export interface UseLothDespachoGuias {
  guias: GuiaDelDespacho[];
  cargando: boolean;
  error: string | null;
}

export function useLothDespachoGuias(activo: boolean, permisoQuery: string, senal = 0): UseLothDespachoGuias {
  const [guias, setGuias] = useState<GuiaDelDespacho[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activo) return;
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    fetch(`/api/admin/forestal/gtf?conCtp=1${permisoQuery ? `&${permisoQuery}` : ""}`, {
      credentials: "include",
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`No se pudo leer las guías (HTTP ${r.status}).`);
        const j = (await r.json()) as { gtfs?: GtfDeLaApi[] };
        setGuias((j.gtfs ?? []).filter((g) => g.tipo !== "producto").map(datosDeGuia));
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setGuias([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [activo, permisoQuery, senal]);

  return { guias, cargando, error };
}
