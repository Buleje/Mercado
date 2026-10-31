"use client";

/**
 * use-rrhh-resumen — el resumen del hub de Recursos Humanos (ADR-414 §7).
 *
 * Trae el `nivel` que decide qué sub-pestañas se muestran. El hub NO deduce el
 * rol en el cliente: lo que diga este endpoint manda, y el servidor vuelve a
 * chequear en cada ruta — esto es sólo para pintar la barra correcta.
 */

import { useCallback, useEffect, useState } from "react";
import type { ResumenRrhhDTO } from "@/lib/rrhh/tipos";
import { sinDato } from "@/lib/errores/sin-dato";

export interface UseRrhhResumenResult {
  resumen: ResumenRrhhDTO | null;
  loading: boolean;
  error: string | null;
  recargar: () => void;
}

export function useRrhhResumen(): UseRrhhResumenResult {
  const [resumen, setResumen] = useState<ResumenRrhhDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError(null);
    fetch("/api/rrhh/resumen", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Sin acceso a Recursos Humanos" : "No se pudo cargar el resumen");
        return r.json() as Promise<ResumenRrhhDTO>;
      })
      .then((data) => {
        if (vigente) setResumen(data);
      })
      .catch((err) => {
        sinDato("RRHH resumen")(err);
        if (vigente) setError(err instanceof Error ? err.message : "No se pudo cargar el resumen");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  return { resumen, loading, error, recargar };
}
