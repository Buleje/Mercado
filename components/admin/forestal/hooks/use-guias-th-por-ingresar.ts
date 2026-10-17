"use client";

/**
 * useGuiasThPorIngresar — «Nuevo ingreso › Desde tu Libro TH» (ADR-481): las
 * guías de tu Libro TH que todavía no entraron al CTP, y «Traer con todo»,
 * que la deja guardada para abrir «Recibir» relleno.
 *
 * Sólo habla con `/api/admin/forestal/guias/libro-th`. Si se pide otra lista
 * mientras llegaba la anterior, la vieja se descarta (AbortController).
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { GuiaThAlistada, GuiaThPorIngresar } from "@/lib/forestal/guias-th-por-ingresar";

const RUTA = "/api/admin/forestal/guias/libro-th";

export type ResultadoAlistar = { ok: true; alistada: GuiaThAlistada } | { ok: false; codigo: string | null; mensaje: string };

/**
 * La guía del TH elegida → su guardada en el CTP. También la usa el puente
 * «Ingresar al CTP» del Libro TH, que sólo sabe el N°.
 */
export async function alistarGuiaTh(ref: { gtfId: string } | { gtfNumber: string }): Promise<ResultadoAlistar> {
  try {
    const r = await fetch(RUTA, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrfHeaders() },
      body: JSON.stringify(ref),
    });
    const j = (await r.json().catch(() => ({}))) as { alistada?: GuiaThAlistada; error?: string; message?: string };
    if (r.ok && j.alistada) return { ok: true, alistada: j.alistada };
    return { ok: false, codigo: j.error ?? null, mensaje: j.message?.trim() || `No se pudo traer la guía (${r.status})` };
  } catch (e) {
    return { ok: false, codigo: null, mensaje: e instanceof Error ? e.message : String(e) };
  }
}

export function useGuiasThPorIngresar(activo: boolean) {
  const [guias, setGuias] = useState<GuiaThPorIngresar[] | null>(null);
  const [ingresadas, setIngresadas] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!activo) return;
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    fetch(RUTA, { credentials: "include", cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { porIngresar?: GuiaThPorIngresar[]; ingresadas?: number; message?: string };
        if (!r.ok || !Array.isArray(j.porIngresar)) throw new Error(j.message ?? `No se pudieron leer las guías (${r.status})`);
        setGuias(j.porIngresar);
        setIngresadas(j.ingresadas ?? 0);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCargando(false);
      });
    return () => ctrl.abort();
  }, [activo, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  /** El gtfId que se está trayendo (un botón a la vez). */
  const [trayendo, setTrayendo] = useState<string | null>(null);
  const traer = useCallback(async (gtfId: string): Promise<ResultadoAlistar> => {
    setTrayendo(gtfId);
    try {
      return await alistarGuiaTh({ gtfId });
    } finally {
      setTrayendo(null);
    }
  }, []);

  return { guias, ingresadas, cargando, error, recargar, traer, trayendo };
}
