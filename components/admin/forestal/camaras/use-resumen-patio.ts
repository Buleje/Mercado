"use client";

/**
 * useResumenPatio — el resumen de UN día del patio (`/api/admin/camaras/resumen`).
 *
 * Al pasar de día rápido con las flechas salen varios pedidos: sólo se aplica
 * el del día que está elegido, para que el martes no se pinte con los datos del
 * lunes que llegaron tarde.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { API_CAMARAS, type ResumenDelDia } from "./camaras-ui";

export function useResumenPatio(fecha: string, activo: boolean) {
  const [resumen, setResumen] = useState<ResumenDelDia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ultima = useRef(0);

  const recargar = useCallback(async () => {
    const esta = ++ultima.current;
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`${API_CAMARAS}/resumen?fecha=${encodeURIComponent(fecha)}`, {
        credentials: "include",
      });
      const j = (await r.json().catch(() => ({}))) as ResumenDelDia & {
        message?: string;
        error?: string;
      };
      if (!r.ok || j.error) throw new Error(j.message ?? `El servidor respondió ${r.status}`);
      if (esta === ultima.current) setResumen(j);
    } catch (e) {
      if (esta === ultima.current) {
        setResumen(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (esta === ultima.current) setCargando(false);
    }
  }, [fecha]);

  useEffect(() => {
    if (activo) void recargar();
  }, [activo, recargar]);

  /* El resumen que se ve es del día pedido; uno de otro día no se muestra
     mientras viaja el nuevo (queda «cargando»). */
  const vigente = resumen && resumen.fecha === fecha ? resumen : null;
  return {
    resumen: vigente,
    cargando: cargando || (activo && !vigente && !error),
    error,
    recargar,
  };
}
