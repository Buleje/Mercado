"use client";

/**
 * useRendimientoAserradero — lee `GET /api/admin/forestal/ctp/rendimiento`:
 * corridas, resumen por especie y (si el rol la ve) la plata por PT.
 *
 * `useCorridasEnProceso` es la versión liviana (`?plata=0`) para las pantallas
 * que sólo necesitan saber qué corridas son «parciales» (radar, Cuadro 3):
 * mientras carga o si falla, devuelve mapas vacíos y la pantalla se ve como
 * antes — no esconde nada por no saber.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RendimientoAserraderoDTO } from "@/lib/forestal/rendimiento-especie";

const URL_RENDIMIENTO = "/api/admin/forestal/ctp/rendimiento";

export interface EstadoRendimiento {
  datos: RendimientoAserraderoDTO | null;
  cargando: boolean;
  error: string | null;
  recargar: () => void;
}

export function useRendimientoAserradero(opts: { plata: boolean }): EstadoRendimiento {
  const [datos, setDatos] = useState<RendimientoAserraderoDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    fetch(`${URL_RENDIMIENTO}?plata=${opts.plata ? "1" : "0"}`, { credentials: "include", signal: ctrl.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as Partial<RendimientoAserraderoDTO> & { message?: string };
        if (!r.ok) throw new Error(j.message ?? `No se pudo leer el rendimiento (HTTP ${r.status}).`);
        setDatos(j as RendimientoAserraderoDTO);
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [opts.plata, vuelta]);

  return { datos, cargando, error, recargar };
}

/**
 * Qué corridas (por id) siguen en proceso, con su fecha de fin. Sólo por id:
 * el código de lote del rendimiento es el de ASERRÍO y el del Cuadro 3 el de
 * PRODUCCIÓN — cruzarlos por código no coincidía nunca (revisión 1dc55fcad).
 */
export function useCorridasEnProceso(): { porCorrida: ReadonlyMap<string, string>; hoy: string | undefined } {
  const { datos } = useRendimientoAserradero({ plata: false });
  return useMemo(() => {
    const porCorrida = new Map<string, string>();
    for (const c of datos?.corridas ?? []) if (c.parcial && c.finProceso) porCorrida.set(c.id, c.finProceso);
    return { porCorrida, hoy: datos?.hoy };
  }, [datos]);
}
