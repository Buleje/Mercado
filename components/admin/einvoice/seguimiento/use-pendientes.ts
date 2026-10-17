"use client";

/**
 * La bandeja de Seguimiento (N02): lo que el servidor arma de comprobantes,
 * notas, guías, cotizaciones y pedidos. Actualizar REEMPLAZA la lista (no se
 * suma a la anterior) y una carga vieja no pisa a la nueva.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { Pendiente } from "@/lib/comprobantes/pendientes";

export type CargaPendientes =
  | { fase: "cargando"; previa: readonly Pendiente[] | null }
  | { fase: "listo"; pendientes: readonly Pendiente[]; generado: string }
  | { fase: "error"; mensaje: string };

export function usePendientes() {
  const [carga, setCarga] = useState<CargaPendientes>({ fase: "cargando", previa: null });
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    const mio = ++pedido.current;
    setCarga((c) => ({ fase: "cargando", previa: c.fase === "listo" ? c.pendientes : null }));
    try {
      const res = await fetch("/api/admin/comprobantes/pendientes", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { pendientes?: Pendiente[]; generado?: string; error?: string };
      if (mio !== pedido.current) return;
      if (res.ok && Array.isArray(body.pendientes)) {
        return setCarga({ fase: "listo", pendientes: body.pendientes, generado: body.generado ?? new Date().toISOString() });
      }
      setCarga({ fase: "error", mensaje: body.error ?? "No se pudo armar la bandeja. Inténtalo de nuevo." });
    } catch (err) {
      if (mio !== pedido.current) return;
      logger.warn("[seguimiento] pendientes", { error: String(err) });
      setCarga({ fase: "error", mensaje: "Sin conexión: no se pudo traer la bandeja." });
    }
  }, []);

  useEffect(() => {
    cargar().catch((err: unknown) => logger.warn("[seguimiento] carga", { error: String(err) }));
  }, [cargar]);

  const recargar = useCallback(() => {
    cargar().catch((err: unknown) => logger.warn("[seguimiento] recarga", { error: String(err) }));
  }, [cargar]);

  return { carga, recargar };
}
