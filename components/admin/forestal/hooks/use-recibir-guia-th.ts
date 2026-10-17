"use client";

/**
 * useRecibirGuiaTh — «Recibir» una guía que viene del Libro TH del mismo
 * negocio (28-09-2026): pide lo que se va a registrar (un renglón por especie
 * con sus trozas) y lo registra con la fecha de llegada y el conteo de lo que
 * bajó del camión (ADR-450).
 *
 * Sólo habla con `/api/admin/forestal/guias/guardadas/[id]/recibir`. Lo que se
 * muestra es lo que el servidor armó con la MISMA función con que registra.
 * `recargar()` vuelve a pedir la guía: tras un 409 `GUIA_CAMBIO` la lista (y
 * su huella) ya no es la que se contó.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CodigoGuiaTh, PreparadoRecibirTh, RecibidaTh, RecibirGuiaThBody } from "@/lib/forestal/guia-th-al-ctp";

const ruta = (id: string) => `/api/admin/forestal/guias/guardadas/${encodeURIComponent(id)}/recibir`;

interface CuerpoDeError {
  error?: string;
  message?: string;
  detail?: { vencimiento?: string };
}

export type ResultadoRecibir =
  | { ok: true; recibida: RecibidaTh }
  | { ok: false; codigo: CodigoGuiaTh | "GUIA_VENCIDA" | (string & {}) | null; mensaje: string; vencimiento: string | null };

/** El «no» del servidor en palabras del patio: el conteo y la guía que cambió. */
const MENSAJE_DE: Partial<Record<CodigoGuiaTh, string>> = {
  GUIA_CAMBIO: "La guía cambió en tu Libro TH, vuelve a abrirla.",
  CONTEO_INCOMPLETO: "El conteo no cierra con la lista de la guía: vuelve a abrirla y cuenta otra vez.",
  NADA_LLEGO: "No llegó ninguna troza de esta guía: así no se recibe. Si la madera todavía no bajó, déjala por recibir.",
  FALTANTES_SIN_CONFIRMAR: "Hay trozas que no llegaron: confírmalo antes de recibir.",
};

/** El texto que se muestra: el 409 siempre con la frase fija; los 422, el motivo del servidor. */
export function mensajeDeRecibir(codigo: string | null, mensaje: string | undefined, status: number): string {
  if (codigo === "GUIA_CAMBIO") return MENSAJE_DE.GUIA_CAMBIO as string;
  if (mensaje?.trim()) return mensaje.trim();
  return (codigo && MENSAJE_DE[codigo as CodigoGuiaTh]) || `No se pudo recibir la guía (${status})`;
}

export function useRecibirGuiaTh(guardadaId: string) {
  const [preparado, setPreparado] = useState<PreparadoRecibirTh | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setErrorCarga(null);
    fetch(ruta(guardadaId), { credentials: "include", cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as CuerpoDeError & { preparado?: PreparadoRecibirTh };
        if (!r.ok || !j.preparado) throw new Error(j.message ?? `No se pudo leer la guía (${r.status})`);
        setPreparado(j.preparado);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setErrorCarga(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [guardadaId, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  const [enviando, setEnviando] = useState(false);
  const recibir = useCallback(
    async (input: RecibirGuiaThBody): Promise<ResultadoRecibir> => {
      setEnviando(true);
      try {
        const r = await fetch(ruta(guardadaId), {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(input),
        });
        const j = (await r.json().catch(() => ({}))) as CuerpoDeError & { recibida?: RecibidaTh };
        if (r.ok && j.recibida) return { ok: true, recibida: j.recibida };
        const codigo = j.error ?? null;
        return {
          ok: false,
          codigo,
          mensaje: mensajeDeRecibir(codigo, j.message, r.status),
          vencimiento: j.detail?.vencimiento ?? null,
        };
      } catch (e) {
        return { ok: false, codigo: null, mensaje: e instanceof Error ? e.message : String(e), vencimiento: null };
      } finally {
        setEnviando(false);
      }
    },
    [guardadaId],
  );

  return { preparado, cargando, errorCarga, recibir, enviando, recargar };
}
