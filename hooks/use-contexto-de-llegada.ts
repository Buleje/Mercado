"use client";

/**
 * use-contexto-de-llegada — lo que el servidor sabe de la llegada de unas guías
 * (ADR-434): corridas de su permiso, trozas ya aserradas, meses cerrados, costo
 * congelado. Con eso la fila de la guía avisa y frena ANTES de guardar, con la
 * misma regla (`revisarLlegada`) que después aplica el servidor.
 *
 * Un solo pedido para todas las guías de la pantalla, por `ctpGet` (se
 * deduplica: el aviso de la vista y el modal que abre piden lo mismo).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import type { ContextoDeLlegada } from "@/lib/forestal/fecha-de-llegada";
import { limaDateKey } from "@/lib/utils";
import { logger } from "@/lib/logger";

/** El tope del endpoint (`MAX_GUIAS_CONTEXTO`). */
const TOPE = 60;

export const URL_RECEPCION = "/api/admin/forestal/wood-entries/recepcion";

export function useContextoDeLlegada(gtfs: readonly string[], activo = true) {
  const clave = useMemo(
    () => [...new Set(gtfs.map((g) => g.trim()).filter(Boolean))].sort().slice(0, TOPE).join("\n"),
    [gtfs],
  );
  const [datos, setDatos] = useState<{ clave: string; hoy: string; guias: ContextoDeLlegada[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activo || !clave) return;
    let vivo = true;
    const qs = clave
      .split("\n")
      .map((g) => `gtf=${encodeURIComponent(g)}`)
      .join("&");
    ctpGet<{ hoy: string; guias: ContextoDeLlegada[] }>(`${URL_RECEPCION}?${qs}`)
      .then((d) => {
        if (!vivo) return;
        setDatos({ clave, hoy: d.hoy, guias: d.guias });
        setError(null);
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        logger.warn("[recepcion] no se pudo leer el contexto de llegada", { error: String(err) });
        setError("No se pudieron leer las corridas del permiso: los avisos no están.");
      });
    return () => {
      vivo = false;
    };
  }, [clave, activo]);

  const porGuia = useMemo(
    () => new Map((datos?.clave === clave ? datos.guias : []).map((g) => [g.gtfNumber, g])),
    [datos, clave],
  );

  /* Estable mientras no llegue otro contexto: la pueden usar las listas memoizadas. */
  const contextoDe = useCallback(
    (gtf: string): ContextoDeLlegada | null => porGuia.get(gtf.trim()) ?? null,
    [porGuia],
  );

  return {
    /** El «hoy» de Lima del servidor; mientras carga, el del equipo en Lima. */
    hoy: datos?.hoy ?? limaDateKey(),
    contextoDe,
    cargando: activo && Boolean(clave) && datos?.clave !== clave && !error,
    error,
  };
}
