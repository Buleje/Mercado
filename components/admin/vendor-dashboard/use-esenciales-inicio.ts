"use client";

import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";
import { logger } from "@/lib/logger";
import type { ResumenEsenciales } from "@/lib/documentos/esenciales-resumen";

export const URL_RESUMEN_ESENCIALES = "/api/admin/documents/esenciales/resumen";

/** 60 s en memoria: volver al Inicio no lo pide de nuevo. Cualquier escritura a `/api/admin/documents/*` lo borra (`cachedJson`). */
const TTL_MS = 60_000;

export type EstadoEsencialesInicio =
  | { fase: "esperando" }
  | { fase: "listo"; datos: ResumenEsenciales }
  | { fase: "error" };

/**
 * El resumen de las carpetas Esenciales para la tarjeta del Inicio. No pide
 * nada hasta que `activo` (la tarjeta asomó en pantalla): no frena la carga
 * del Inicio ni gasta una consulta si nunca bajas hasta ella.
 */
export function useEsencialesInicio(activo: boolean): EstadoEsencialesInicio {
  const [estado, setEstado] = useState<EstadoEsencialesInicio>({ fase: "esperando" });
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    cachedJson<ResumenEsenciales>(URL_RESUMEN_ESENCIALES, TTL_MS, { cache: "no-store" })
      .then((datos) => {
        if (vivo) setEstado(datos?.carpetas ? { fase: "listo", datos } : { fase: "error" });
      })
      .catch((err: unknown) => {
        logger.error("[inicio/esenciales] resumen falló", { error: String(err) });
        if (vivo) setEstado({ fase: "error" });
      });
    return () => {
      vivo = false;
    };
  }, [activo]);
  return estado;
}
