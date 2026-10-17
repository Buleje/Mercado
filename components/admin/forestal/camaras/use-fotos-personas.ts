"use client";

/**
 * useFotosPersonas — la galería «Personas» de UN día (y una cámara o todas):
 * `GET /api/admin/camaras/personas/fotos`.
 *
 * Igual que `useResumenPatio`: al pasar días rápido con las flechas sólo se
 * aplica la respuesta del pedido vigente, y la galería de otro día no se
 * muestra mientras viaja la nueva.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { GaleriaPersonas } from "@/lib/camaras/personas-galeria";
import { API_CAMARAS } from "./camaras-ui";

export function useFotosPersonas(dia: string, camara: string | null, activo: boolean) {
  const [galeria, setGaleria] = useState<GaleriaPersonas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ultima = useRef(0);

  const recargar = useCallback(async () => {
    const esta = ++ultima.current;
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ dia });
      if (camara) qs.set("camara", camara);
      const r = await fetch(`${API_CAMARAS}/personas/fotos?${qs}`, { credentials: "include" });
      const j = (await r.json().catch(() => ({}))) as Partial<GaleriaPersonas> & {
        message?: string;
        error?: string;
      };
      if (!r.ok || j.error || !j.ok) throw new Error(j.message ?? `El servidor respondió ${r.status}`);
      if (esta === ultima.current) setGaleria(j as GaleriaPersonas);
    } catch (e) {
      if (esta === ultima.current) {
        setGaleria(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (esta === ultima.current) setCargando(false);
    }
  }, [dia, camara]);

  useEffect(() => {
    if (activo) void recargar();
  }, [activo, recargar]);

  const vigente = galeria && galeria.dia === dia && galeria.camara === camara ? galeria : null;
  return {
    galeria: vigente,
    cargando: cargando || (activo && !vigente && !error),
    error,
    recargar,
  };
}
