"use client";

/**
 * useRecibirGuiaTh — «Recibir» una guía que viene del Libro TH del mismo
 * negocio (28-09-2026): pide lo que se va a registrar (un renglón por especie
 * con sus trozas) y lo registra con la fecha de llegada.
 *
 * Sólo habla con `/api/admin/forestal/guias/guardadas/[id]/recibir`. Lo que se
 * muestra es lo que el servidor armó con la MISMA función con que registra.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PreparadoRecibirTh, RecibidaTh, RecibirGuiaThInput } from "@/lib/forestal/guia-th-al-ctp";

const ruta = (id: string) => `/api/admin/forestal/guias/guardadas/${encodeURIComponent(id)}/recibir`;

interface CuerpoDeError {
  error?: string;
  message?: string;
  detail?: { vencimiento?: string };
}

export type ResultadoRecibir =
  | { ok: true; recibida: RecibidaTh }
  | { ok: false; codigo: string | null; mensaje: string; vencimiento: string | null };

export function useRecibirGuiaTh(guardadaId: string) {
  const [preparado, setPreparado] = useState<PreparadoRecibirTh | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

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
  }, [guardadaId]);

  const [enviando, setEnviando] = useState(false);
  const recibir = useCallback(
    async (input: RecibirGuiaThInput): Promise<ResultadoRecibir> => {
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
        return {
          ok: false,
          codigo: j.error ?? null,
          mensaje: j.message ?? `No se pudo recibir la guía (${r.status})`,
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

  return { preparado, cargando, errorCarga, recibir, enviando };
}
