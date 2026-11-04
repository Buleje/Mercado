"use client";

/**
 * Tipo de cambio para una factura que no está en soles. Dólares: se pide el que
 * SUNAT publica para la fecha de emisión (`GET /api/admin/tipo-cambio`; para
 * compras vale el de VENTA). Si el servicio no responde, o la moneda no es
 * dólar, el dueño lo escribe a mano: sin tipo de cambio la compra no se guarda.
 */
import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { leerTipoCambio, type CambioUsado } from "./compra-desde-factura";

/** Lo que devuelve el endpoint en `data` (forma de `TipoCambio`, lib/integrations/tipo-cambio.ts). */
interface TipoCambioApi {
  fecha: string;
  compra: number;
  venta: number;
  fuente: "sunat" | "bcrp-sbs";
  fechaDato: string;
  detalle: string;
}

interface Respuesta {
  clave: string;
  dato: TipoCambioApi | null;
  error: string | null;
}

export interface EstadoTipoCambio {
  /** La factura no está en soles: hace falta un tipo de cambio. */
  necesita: boolean;
  moneda: string;
  cargando: boolean;
  /** El de SUNAT, si llegó. */
  dato: TipoCambioApi | null;
  /** Por qué no llegó (y hay que escribirlo a mano). */
  error: string | null;
  manual: string;
  setManual: (texto: string) => void;
  /** Escribió algo que no es un tipo de cambio creíble. */
  manualInvalido: boolean;
  /** Con lo que se guarda; null = todavía no se puede guardar. */
  cambio: CambioUsado | null;
}

export function useTipoCambio(fecha: string | null, moneda: string | null): EstadoTipoCambio {
  const necesita = Boolean(fecha && moneda && moneda !== "PEN");
  const pideSunat = necesita && moneda === "USD";
  const clave = `${moneda ?? ""}:${fecha ?? ""}`;
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [escrito, setEscrito] = useState<{ clave: string; texto: string }>({ clave: "", texto: "" });

  useEffect(() => {
    if (!pideSunat || !fecha) return;
    const ctrl = new AbortController();
    fetch(`/api/admin/tipo-cambio?fecha=${encodeURIComponent(fecha.slice(0, 10))}`, { credentials: "include", signal: ctrl.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { data?: TipoCambioApi; error?: string } | null;
        if (ctrl.signal.aborted) return;
        if (res.ok && json?.data && Number.isFinite(json.data.venta)) {
          setRespuesta({ clave, dato: json.data, error: null });
          return;
        }
        setRespuesta({
          clave,
          dato: null,
          error: typeof json?.error === "string" ? json.error : `SUNAT no respondió (${res.status}); escribe el tipo de cambio a mano`,
        });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        logger.warn("[compras/factura-xml] tipo de cambio no llegó", { err: String(err) });
        setRespuesta({ clave, dato: null, error: "No se pudo traer el tipo de cambio; escríbelo a mano" });
      });
    return () => ctrl.abort();
  }, [pideSunat, fecha, clave]);

  const vigente = respuesta?.clave === clave ? respuesta : null;
  const dato = pideSunat ? (vigente?.dato ?? null) : null;
  const cargando = pideSunat && !vigente;
  const error = !necesita ? null : pideSunat ? (vigente?.error ?? null) : `La factura está en ${moneda}: escribe a cuánto está en soles`;
  const manual = escrito.clave === clave ? escrito.texto : "";
  const leido = manual ? leerTipoCambio(manual, moneda ?? "USD") : null;

  let cambio: CambioUsado | null = null;
  if (necesita && fecha) {
    if (dato) cambio = { venta: dato.venta, fecha: fecha.slice(0, 10), fuente: dato.fuente, detalle: dato.detalle };
    else if (error && leido !== null) cambio = { venta: leido, fecha: fecha.slice(0, 10), fuente: "manual", detalle: null };
  }

  return {
    necesita,
    moneda: moneda ?? "PEN",
    cargando,
    dato,
    error,
    manual,
    setManual: (texto) => setEscrito({ clave, texto }),
    manualInvalido: manual.trim() !== "" && leido === null,
    cambio,
  };
}
