"use client";

/**
 * use-proxima-gtf — el número que «Emitir GTF» propone (ADR-446).
 *
 * Sólo lectura: `GET /api/admin/forestal/ctp?proximaGtf=1` calcula el siguiente
 * del talonario (máximo de despachos vigentes, anulados y Anexos 04 + 1, con los
 * dígitos de la Ficha) sin escribir nada. El número se escribe recién cuando el
 * operador lo confirma, y el servidor lo vuelve a validar bajo su lock.
 *
 * Se pide al montar: el componente que lo usa se monta cuando el operador
 * aprieta «Emitir GTF», así la propuesta es la de ese momento y no la de cuando
 * se abrió la pantalla. `recargar()` la vuelve a pedir (tras un 409, por ejemplo).
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PropuestaGtf } from "@/lib/forestal/gtf-talonario";

/** Lo que el servidor le pregunta al operador antes de grabar el número. */
export type PreguntaEmision =
  /** El N° ya lo lleva esa línea: ¿va en la misma guía (un camión, dos productos)? */
  | { tipo: "misma_guia"; gtf: string; propuesta: string; despachoId: string; lineNo: number | null }
  /** El N° se adelanta más de 20 sobre el siguiente: ¿no es un tipeo? */
  | { tipo: "salto"; gtf: string; propuesta: string; salto: number };

export type RespuestaEmision =
  | { ok: true; gtf: string; yaEmitida: boolean }
  | { ok: false; mensaje: string; pregunta: PreguntaEmision | null };

/** Lo que el operador confirmó al responder la pregunta. */
export interface ConfirmacionEmision {
  mismaGuiaQue?: string;
  confirmarSalto?: boolean;
}

/**
 * PATCH `emitir_gtf` con el N° confirmado (ADR-446). Una sola implementación
 * para los dos lugares que emiten (la sección GTF del despacho y el modal de la
 * guía): el 409 de «ya lo lleva otra línea» y el 422 de «salto grande» vuelven
 * como `pregunta`, para que la pantalla pregunte y reintente con la respuesta.
 */
export async function pedirEmisionGtf(
  despachoId: string,
  numero: string,
  confirmacion: ConfirmacionEmision = {},
): Promise<RespuestaEmision> {
  try {
    const r = await fetch("/api/admin/forestal/ctp", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json", ...csrfHeaders() },
      body: JSON.stringify({ id: despachoId, action: "emitir_gtf", numero, ...confirmacion }),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.ok) return { ok: true, gtf: String(j.gtf ?? numero), yaEmitida: j.yaEmitida === true };
    const mensaje = typeof j.message === "string" ? j.message : `No se pudo emitir la GTF (HTTP ${r.status}).`;
    const usadaPor = (j.usadaPor ?? null) as { despachoId?: unknown; lineNo?: unknown } | null;
    if (j.error === "gtf_en_uso" && typeof usadaPor?.despachoId === "string") {
      return {
        ok: false,
        mensaje,
        pregunta: {
          tipo: "misma_guia",
          gtf: String(j.gtf ?? numero),
          propuesta: String(j.propuesta ?? ""),
          despachoId: usadaPor.despachoId,
          lineNo: typeof usadaPor.lineNo === "number" ? usadaPor.lineNo : null,
        },
      };
    }
    if (j.error === "salto_de_correlativo") {
      return {
        ok: false,
        mensaje,
        pregunta: { tipo: "salto", gtf: String(j.gtf ?? numero), propuesta: String(j.propuesta ?? ""), salto: Number(j.salto ?? 0) },
      };
    }
    return { ok: false, mensaje, pregunta: null };
  } catch (e) {
    return { ok: false, mensaje: `No se pudo emitir: ${String(e)}`, pregunta: null };
  }
}

interface Resultado {
  vuelta: number;
  propuesta: PropuestaGtf | null;
  error: string | null;
}

export function useProximaGtf(): {
  propuesta: PropuestaGtf | null;
  error: string | null;
  cargando: boolean;
  recargar: () => void;
} {
  const [vuelta, setVuelta] = useState(0);
  const [res, setRes] = useState<Resultado | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/admin/forestal/ctp?proximaGtf=1", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { propuesta?: PropuestaGtf; message?: string };
        if (!vivo) return;
        setRes(
          r.ok
            ? { vuelta, propuesta: j.propuesta ?? null, error: null }
            : { vuelta, propuesta: null, error: j.message ?? `No se pudo calcular el número (HTTP ${r.status}).` },
        );
      })
      .catch((e: unknown) => {
        if (vivo) setRes({ vuelta, propuesta: null, error: `No se pudo calcular el número: ${String(e)}` });
      });
    return () => { vivo = false; };
  }, [vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  // Mientras llega la respuesta de ESTA vuelta se muestra la anterior (no parpadea).
  return {
    propuesta: res?.propuesta ?? null,
    error: res?.error ?? null,
    cargando: res?.vuelta !== vuelta,
    recargar,
  };
}
