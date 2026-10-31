"use client";

import { useCallback, useEffect, useState } from "react";
import type { AperturasDeClave } from "@/lib/admin/aperturas-panel";
import { URL_USO_PANEL, enviarPendientes } from "@/lib/admin/registro-aperturas";

export interface DatosUsoDelPanel {
  claves: Record<string, AperturasDeClave>;
  /** El día más viejo con registro (`AAAA-MM-DD`), o `null` si todavía no hay nada. */
  desde: string | null;
}

export interface UsoDelPanel {
  datos: DatosUsoDelPanel | null;
  cargando: boolean;
  error: string | null;
  reintentar: () => void;
}

/**
 * Las aperturas de cada pestaña del negocio (GET `/api/admin/uso-panel`, sólo
 * admin y dueño). Antes de leer manda lo que este navegador tenía esperando,
 * para que cuente lo que acabas de abrir. Lee al montar (el plegable monta al abrirse).
 */
export function useUsoDelPanel(): UsoDelPanel {
  const [datos, setDatos] = useState<DatosUsoDelPanel | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    enviarPendientes()
      .then(() => fetch(URL_USO_PANEL, { credentials: "include", cache: "no-store", signal: ctrl.signal }))
      .then(async (r) => {
        if (r.status === 403) throw new Error("Sólo el dueño y el admin ven el uso del panel.");
        if (!r.ok) throw new Error(`No se pudo leer el uso del panel (error ${r.status}).`);
        const d = (await r.json()) as Partial<DatosUsoDelPanel>;
        setDatos({ claves: d.claves ?? {}, desde: d.desde ?? null });
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [vuelta]);

  const reintentar = useCallback(() => setVuelta((v) => v + 1), []);
  return { datos, cargando, error, reintentar };
}
