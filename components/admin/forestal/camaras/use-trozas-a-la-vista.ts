"use client";
/**
 * Las trozas que la cámara vio en un día (ADR-480), de
 * `/api/admin/camaras/trozas-a-la-vista`. La pantalla no suma nada: el
 * resumen (vistas, libres, m³ libres) viene del servidor.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RespuestaALaVista } from "@/lib/camaras/marcadores";

export function useTrozasALaVista(dia: string, activo: boolean) {
  const [datos, setDatos] = useState<RespuestaALaVista | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Sólo escribe el último pedido: cambiar de día rápido no deja la lista del anterior. */
  const ultimo = useRef(0);

  const recargar = useCallback(async () => {
    const n = ++ultimo.current;
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/camaras/trozas-a-la-vista?dia=${encodeURIComponent(dia)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await r.json().catch(() => ({}))) as RespuestaALaVista & { message?: string };
      if (n !== ultimo.current) return;
      if (!r.ok) throw new Error(j.message ?? `El servidor respondió ${r.status}`);
      setDatos(j);
    } catch (e) {
      if (n === ultimo.current) setError(e instanceof Error ? e.message : "No se pudo leer lo que vio la cámara.");
    } finally {
      if (n === ultimo.current) setCargando(false);
    }
  }, [dia]);

  useEffect(() => {
    if (!activo) return;
    setDatos(null);
    void recargar();
  }, [activo, recargar]);

  return { datos, cargando, error, recargar };
}
