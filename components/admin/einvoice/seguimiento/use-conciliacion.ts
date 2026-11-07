"use client";

/** La conciliación documental (N08) de un período. Una carga vieja no pisa a la nueva. */
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { Conciliacion } from "@/lib/comprobantes/conciliacion";
import { rangoDePeriodo, type PeriodoClave } from "@/lib/comprobantes/periodo";

export type CargaConciliacion =
  | { fase: "cargando" }
  | { fase: "listo"; conciliacion: Conciliacion }
  | { fase: "error"; mensaje: string };

export function useConciliacion(periodo: PeriodoClave) {
  const [carga, setCarga] = useState<CargaConciliacion>({ fase: "cargando" });
  const pedido = useRef(0);

  const cargar = useCallback(async (p: PeriodoClave) => {
    const mio = ++pedido.current;
    setCarga({ fase: "cargando" });
    const r = rangoDePeriodo(p);
    const qs = new URLSearchParams();
    if (r.desde) qs.set("desde", r.desde);
    if (r.hasta) qs.set("hasta", r.hasta);
    try {
      const res = await fetch(`/api/admin/comprobantes/conciliacion?${qs}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { conciliacion?: Conciliacion; error?: string };
      if (mio !== pedido.current) return;
      if (res.ok && body.conciliacion) return setCarga({ fase: "listo", conciliacion: body.conciliacion });
      const mensaje =
        res.status === 401 || res.status === 403
          ? "Sólo el administrador del negocio ve la conciliación."
          : (body.error ?? "No se pudo armar la conciliación. Inténtalo de nuevo.");
      setCarga({ fase: "error", mensaje });
    } catch (err) {
      if (mio !== pedido.current) return;
      logger.warn("[conciliacion] carga", { error: String(err) });
      setCarga({ fase: "error", mensaje: "Sin conexión: no se pudo traer la conciliación." });
    }
  }, []);

  useEffect(() => {
    cargar(periodo).catch((err: unknown) => logger.warn("[conciliacion] periodo", { error: String(err) }));
  }, [periodo, cargar]);

  const recargar = useCallback(() => {
    cargar(periodo).catch((err: unknown) => logger.warn("[conciliacion] recarga", { error: String(err) }));
  }, [periodo, cargar]);

  return { carga, recargar };
}
