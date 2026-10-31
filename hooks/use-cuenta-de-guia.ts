"use client";

/**
 * La cuenta del proveedor dentro de «Plata de la guía» (ADR-437 §5): lee
 * `GET /api/admin/forestal/guias/plata/cuenta?parte=` sólo cuando la sección
 * está abierta, y relee cuando cambia `version` (un pago, un costo guardado).
 * Sólo la última lectura escribe: una vieja que vuelve tarde no pisa la nueva.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CuentaDeGuiaDTO } from "@/lib/forestal/cuenta-en-la-guia";

export function useCuentaDeGuia(parteId: string | null, activo: boolean, version: string) {
  /* Cada lectura queda atada a SU persona: al cambiar `parteId`, la cuenta y
     el error de la anterior dejan de mostrarse en el acto (sin esto, la cuenta
     de Nelly se veía bajo el nombre de Santos hasta que llegaba la lectura). */
  const [leida, setLeida] = useState<{ parteId: string; cuenta: CuentaDeGuiaDTO } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState<{ parteId: string; error: string } | null>(null);
  const ultima = useRef(0);

  const cargar = useCallback(async () => {
    if (!parteId) return;
    const mia = ++ultima.current;
    setCargando(true);
    try {
      const r = await fetch(`/api/admin/forestal/guias/plata/cuenta?parte=${encodeURIComponent(parteId)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const b = (await r.json().catch(() => ({}))) as Partial<CuentaDeGuiaDTO> & { message?: string };
      if (mia !== ultima.current) return;
      if (!r.ok || !Array.isArray(b.lineas)) {
        throw new Error(b.message ?? `No se pudo leer la cuenta (${r.status})`);
      }
      setLeida({ parteId, cuenta: b as CuentaDeGuiaDTO });
      setFallo(null);
    } catch (e) {
      if (mia === ultima.current) setFallo({ parteId, error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (mia === ultima.current) setCargando(false);
    }
  }, [parteId]);

  useEffect(() => {
    if (activo && parteId) void cargar();
    // `version` fuerza la relectura tras un pago o un costo guardado.
  }, [activo, parteId, version, cargar]);

  const cuenta = leida && leida.parteId === parteId ? leida.cuenta : null;
  const error = fallo && fallo.parteId === parteId ? fallo.error : null;
  return { cuenta, cargando, error, recargar: cargar };
}
