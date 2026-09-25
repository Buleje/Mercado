"use client";

/**
 * use-acomodar-trozas — la vista previa y el «Acomodar» de ADR-435.
 *
 * La vista previa se pide SIN el caché de `ctpGet`: lo que se muestra antes de
 * confirmar tiene que ser el estado de ahora, no el de hace ocho segundos. Al
 * aplicar se manda lo que se vio, troza → fila de destino: lo que apareció
 * después no se mueve sin verse, y si un destino cambió no se mueve nada. Después
 * se vacía el caché del libro entero: la ficha de la guía, el patio y la ficha
 * del permiso leen las mismas trozas.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { PlanAcomodo } from "@/lib/forestal/acomodar-trozas";

/** Qué guías mirar: una (por cualquiera de sus filas), las de un permiso, o todas. */
export type AlcanceAcomodoCliente = { woodEntryId: string } | { contratoId: string } | { todas: true };

export interface ResultadoAcomodo {
  movidas: number;
  m3Movidos: number;
  yaNoSePudieron: number;
  guias: number;
}

const URL_ACOMODAR = "/api/admin/forestal/wood-entries/acomodar-trozas";

const aQuery = (a: AlcanceAcomodoCliente): string =>
  "woodEntryId" in a
    ? `woodEntryId=${encodeURIComponent(a.woodEntryId)}`
    : "contratoId" in a
      ? `contratoId=${encodeURIComponent(a.contratoId)}`
      : "todas=1";

const mensajeDe = (j: { message?: string; error?: string } | null, status: number) =>
  j?.message ?? (j?.error ? `No se pudo (${j.error}).` : `No se pudo (HTTP ${status}).`);

export function useAcomodarTrozas(alcance: AlcanceAcomodoCliente) {
  const [plan, setPlan] = useState<PlanAcomodo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoAcomodo | null>(null);
  const query = aQuery(alcance);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    fetch(`${URL_ACOMODAR}?${query}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const j = await leerJson<{ plan?: PlanAcomodo; message?: string; error?: string }>(r);
        if (!vivo) return;
        if (!r.ok || !j?.plan) setError(mensajeDe(j, r.status));
        else setPlan(j.plan);
      })
      .catch((err: unknown) => {
        if (vivo) setError(`No se pudo leer la guía: ${String(err)}`);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [query]);

  const aplicar = useCallback(async (): Promise<ResultadoAcomodo | null> => {
    if (!plan) return null;
    /* Troza → fila de destino, tal como se vio: si el servidor ve otro destino, frena. */
    const movimientos = plan.guias.flatMap((g) => g.mover.map((m) => ({ trozaId: m.trozaId, haciaId: m.hacia.id })));
    if (movimientos.length === 0) return null;
    setAplicando(true);
    setError(null);
    try {
      const r = await fetch(URL_ACOMODAR, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ...alcance, movimientos }),
      });
      const j = await leerJson<ResultadoAcomodo & { despues?: PlanAcomodo; message?: string; error?: string }>(r);
      if (!r.ok || !j) {
        setError(mensajeDe(j, r.status));
        return null;
      }
      invalidarCtp();
      if (j.despues) setPlan(j.despues);
      const hecho = { movidas: j.movidas, m3Movidos: j.m3Movidos, yaNoSePudieron: j.yaNoSePudieron, guias: j.guias };
      setResultado(hecho);
      return hecho;
    } catch (err) {
      setError(`No se pudo acomodar: ${String(err)}`);
      return null;
    } finally {
      setAplicando(false);
    }
  }, [plan, alcance]);

  return { plan, cargando, aplicando, error, resultado, aplicar };
}
