"use client";

/**
 * use-salidas-por-registrar — los Anexos 04 con GTF cuya salida falta en el
 * Libro, con su vencimiento (`/api/admin/forestal/salidas-por-registrar`, que
 * usa la fuente única `lib/forestal/salidas-por-registrar.ts`). Si falla, no
 * hay aviso: es un indicador, no un bloqueo.
 */
import { useEffect, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { SalidaPorRegistrar } from "@/lib/forestal/salidas-por-registrar";

export const URL_SALIDAS_POR_REGISTRAR = "/api/admin/forestal/salidas-por-registrar";

/** `recarga` sube (p. ej. al registrar una guía) y vuelve a leer. */
export function useSalidasPorRegistrar(activo = true, recarga = 0) {
  const [datos, setDatos] = useState<{ hoy: string; salidas: SalidaPorRegistrar[] } | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    fetch(URL_SALIDAS_POR_REGISTRAR, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? leerJson<{ hoy?: string; salidas?: SalidaPorRegistrar[] }>(r) : null))
      .then((j) => {
        if (vivo && j?.hoy) setDatos({ hoy: j.hoy, salidas: j.salidas ?? [] });
      })
      .catch((err: unknown) => logger.warn("[salidas-por-registrar] no se pudo leer", { error: String(err) }));
    return () => {
      vivo = false;
    };
  }, [activo, recarga]);
  return datos;
}
