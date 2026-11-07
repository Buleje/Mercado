"use client";

/**
 * useResumenPersonas — personas DISTINTAS de un día (ADR-479):
 * `GET /api/admin/camaras/personas/resumen`. Igual que `useFotosPersonas`: al
 * pasar días rápido sólo se aplica la respuesta del pedido vigente.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RespuestaResumenPersonas } from "@/lib/camaras/visitantes";
import { API_CAMARAS } from "./camaras-ui";

export function useResumenPersonas(dia: string, activo: boolean) {
  const [resumen, setResumen] = useState<RespuestaResumenPersonas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ultima = useRef(0);

  const recargar = useCallback(async () => {
    const esta = ++ultima.current;
    setError(null);
    try {
      const r = await fetch(`${API_CAMARAS}/personas/resumen?${new URLSearchParams({ dia })}`, { credentials: "include" });
      const j = (await r.json().catch(() => ({}))) as Partial<RespuestaResumenPersonas> & { message?: string; error?: string };
      if (!r.ok || j.error || !j.ok) throw new Error(j.message ?? `El servidor respondió ${r.status}`);
      if (esta === ultima.current) setResumen(j as RespuestaResumenPersonas);
    } catch (e) {
      if (esta === ultima.current) {
        setResumen(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, [dia]);

  useEffect(() => {
    if (activo) void recargar();
  }, [activo, recargar]);

  const vigente = resumen && resumen.dia === dia ? resumen : null;
  return { resumen: vigente, cargando: activo && !vigente && !error, error, recargar };
}
