"use client";

/** Trae el expediente de una operación (sólo lectura). Una carga vieja no pisa a la nueva. */
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { Expediente } from "@/lib/comprobantes/expediente";

export type CargaExpediente =
  | { fase: "cargando" }
  | { fase: "listo"; expediente: Expediente }
  | { fase: "error"; mensaje: string };

export function useExpediente(ref: string | null) {
  const [carga, setCarga] = useState<CargaExpediente>({ fase: "cargando" });
  const pedido = useRef(0);

  const cargar = useCallback(async (r: string) => {
    const mio = ++pedido.current;
    setCarga({ fase: "cargando" });
    try {
      const res = await fetch(`/api/admin/comprobantes/expediente?ref=${encodeURIComponent(r)}`);
      const body = (await res.json().catch(() => ({}))) as { expediente?: Expediente; error?: string };
      if (mio !== pedido.current) return;
      if (res.ok && body.expediente) return setCarga({ fase: "listo", expediente: body.expediente });
      const mensaje =
        res.status === 401 || res.status === 403
          ? "Sólo el administrador del negocio ve el expediente completo."
          : (body.error ?? "No se pudo armar el expediente. Inténtalo de nuevo.");
      setCarga({ fase: "error", mensaje });
    } catch (err) {
      if (mio !== pedido.current) return;
      logger.warn("[expediente] no se pudo cargar", { error: String(err) });
      setCarga({ fase: "error", mensaje: "Sin conexión: no se pudo traer el expediente." });
    }
  }, []);

  useEffect(() => {
    if (!ref) return;
    cargar(ref).catch((err: unknown) => logger.warn("[expediente] carga", { error: String(err) }));
  }, [ref, cargar]);

  const recargar = useCallback(() => {
    if (ref) cargar(ref).catch((err: unknown) => logger.warn("[expediente] recarga", { error: String(err) }));
  }, [ref, cargar]);

  return { carga, recargar };
}
