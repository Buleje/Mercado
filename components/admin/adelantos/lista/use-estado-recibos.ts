"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { EstadoRecibos } from "@/lib/adelantos/recibo-whatsapp";
import type { HojaFirmada } from "@/lib/adelantos/hoja-firmas";

export type CargaRecibos = "cargando" | "listo" | "error";

/**
 * Las horas de firma y huella y el último envío por WhatsApp de cada adelanto
 * (23-10). Lo que dice SI hay firma/huella/foto ya viene en la lista; esto
 * agrega cuándo y el envío. Sólo la última carga escribe (carga vieja no pisa).
 */
export function useEstadoRecibos(): { estados: EstadoRecibos; hojas: Record<string, HojaFirmada>; carga: CargaRecibos; recargar: () => void } {
  const [estados, setEstados] = useState<EstadoRecibos>({});
  /** Los adelantos firmados en una hoja de papel (foto): cuentan como firmados, con su documento. */
  const [hojas, setHojas] = useState<Record<string, HojaFirmada>>({});
  const [carga, setCarga] = useState<CargaRecibos>("cargando");
  const turno = useRef(0);

  const recargar = useCallback(() => {
    const mio = ++turno.current;
    fetch("/api/adelantos/estado-recibos", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const j = await leerJson<{ estados?: EstadoRecibos; hojas?: Record<string, HojaFirmada> }>(res);
        if (mio !== turno.current) return;
        if (res.ok && j?.estados) {
          setEstados(j.estados);
          setHojas(j.hojas ?? {});
          setCarga("listo");
        } else {
          logger.warn("[adelantos] no se pudo leer el estado de los recibos", { status: res.status });
          setCarga("error");
        }
      })
      .catch((err) => {
        logger.error("[adelantos] no se pudo leer el estado de los recibos", { error: String(err) });
        if (mio === turno.current) setCarga("error");
      });
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { estados, hojas, carga, recargar };
}
