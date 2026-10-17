"use client";

/**
 * use-ctp-cierres — los períodos cerrados del Libro CTP, en un solo lugar.
 *
 * El asistente (arriba) cierra y el historial (abajo) lista y reabre: si cada
 * uno se traía la lista por su cuenta, cerrar un mes dejaba al otro mostrando
 * el estado viejo. Un único fetch y un único `cerrar`/`reabrir` para los dos.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";

const URL = "/api/admin/forestal/ctp/cierre";

/** Lo que devuelve el endpoint (lo poco que se lee acá). */
interface RespuestaCierre {
  cierres?: CtpCierrePeriodo[];
  cierre?: CtpCierrePeriodo;
  message?: string;
  error?: string;
}

export interface CtpCierresState {
  /** `null` mientras carga (el historial distingue "cargando" de "ninguno"). */
  cierres: CtpCierrePeriodo[] | null;
  /** Meses cerrados y NO reabiertos: no se pueden volver a cerrar. */
  closedKeys: Set<string>;
  error: string | null;
  busy: boolean;
  recargar: () => Promise<void>;
  cerrar: (year: number, month: number) => Promise<{ ok: boolean; msg: string }>;
  reabrir: (c: CtpCierrePeriodo, motivo: string) => Promise<{ ok: boolean; msg: string }>;
}

export function useCtpCierres(): CtpCierresState {
  const [cierres, setCierres] = useState<CtpCierrePeriodo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recargar = useCallback(async () => {
    try {
      /* Deduplicado (ADR-347): la cabina y el asistente de cierre lo montan a la vez. */
      const j = await ctpGet<RespuestaCierre>(URL);
      setCierres(Array.isArray(j.cierres) ? j.cierres : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCierres([]);
    }
  }, []);

  useEffect(() => { void recargar(); }, [recargar]);

  const closedKeys = useMemo(
    () => new Set((cierres ?? []).filter((c) => !c.reabierto).map((c) => c.periodKey)),
    [cierres],
  );

  /** Manda la acción y deja el estado ya actualizado con lo que devolvió el server. */
  const mandar = useCallback(async (body: Record<string, unknown>, exito: (j: RespuestaCierre) => string) => {
    setBusy(true);
    setError(null);
    try {
      invalidarCtp("/forestal/");
      const r = await fetch(URL, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as RespuestaCierre;
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      if (Array.isArray(j.cierres)) setCierres(j.cierres);
      return { ok: true, msg: exito(j) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      return { ok: false, msg };
    } finally {
      setBusy(false);
    }
  }, []);

  const cerrar = useCallback(
    (year: number, month: number) =>
      mandar({ action: "cerrar", year, month }, (j) => {
        const t = j.cierre?.totales;
        return t
          ? `${t.corridasCongeladas} corridas congeladas${t.corridasSinCostear ? `, ${t.corridasSinCostear} sin costear` : ""}.`
          : "Período cerrado.";
      }),
    [mandar],
  );

  const reabrir = useCallback(
    (c: CtpCierrePeriodo, motivo: string) =>
      mandar({ action: "reabrir", periodKey: c.periodKey, motivo }, () => `Período ${c.label} reabierto.`),
    [mandar],
  );

  return { cierres, closedKeys, error, busy, recargar, cerrar, reabrir };
}
