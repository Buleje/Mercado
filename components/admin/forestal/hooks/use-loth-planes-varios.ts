"use client";

/**
 * «Varios» del Plan de manejo: si se está mirando la grilla de todos los
 * planes y el avance de cada uno.
 *
 * `usePlanesVarios` guarda la elección en la URL (`&planes=varios`): recargar
 * o compartir el enlace cae en la grilla, y elegir un plan la quita.
 *
 * `useResumenPlanes` pide el balance de cada plan (`?balance=<id>`, el MISMO
 * que lee la vista de un plan) y lo pasa por `cascadaDelPlan`: la tarjeta dice
 * las mismas cifras que el plan abierto, no una cuenta aparte. Sólo pide con la
 * grilla a la vista y de a cuatro, para no soltar veinte pedidos juntos.
 */

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { cascadaDelPlan, type CascadaEspecie, type FilaBalanceCascada } from "@/lib/forestal/loth-saldo-cascada";

export const PARAM_PLANES = "planes";
const VALOR_VARIOS = "varios";

export function usePlanesVarios(): [boolean, (v: boolean) => void] {
  const [varios, setVariosEstado] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get(PARAM_PLANES) === VALOR_VARIOS) setVariosEstado(true);
  }, []);
  const setVarios = useCallback((v: boolean) => {
    setVariosEstado(v);
    const url = new URL(window.location.href);
    if (v) url.searchParams.set(PARAM_PLANES, VALOR_VARIOS);
    else url.searchParams.delete(PARAM_PLANES);
    window.history.replaceState(null, "", url);
  }, []);
  return [varios, setVarios];
}

export type ResumenPlan =
  | { estado: "cargando" }
  | { estado: "error" }
  | { estado: "ok"; total: CascadaEspecie; especies: number };

const SIMULTANEOS = 4;

export function useResumenPlanes(ids: readonly string[], activo: boolean, reloadSignal?: number): Record<string, ResumenPlan> {
  const [resumen, setResumen] = useState<Record<string, ResumenPlan>>({});
  const clave = ids.join(",");

  useEffect(() => {
    if (!activo || !clave) return;
    const lista = clave.split(",");
    const ctrl = new AbortController();
    /* Lo ya leído se queda a la vista mientras se relee: no parpadea a «cargando». */
    setResumen((prev) => Object.fromEntries(lista.map((id) => [id, prev[id]?.estado === "ok" ? prev[id] : { estado: "cargando" }])));

    const leerUno = async (id: string) => {
      try {
        const r = await fetch(`/api/admin/forestal/plan?balance=${encodeURIComponent(id)}`, { credentials: "include", signal: ctrl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const filas: FilaBalanceCascada[] = (await r.json())?.balance?.rows ?? [];
        if (ctrl.signal.aborted) return;
        setResumen((prev) => ({ ...prev, [id]: { estado: "ok", total: cascadaDelPlan(filas).total, especies: filas.length } }));
      } catch (err) {
        if (ctrl.signal.aborted) return;
        logger.warn("[loth-planes-varios] balance failed", { planId: id, error: String(err) });
        setResumen((prev) => ({ ...prev, [id]: { estado: "error" } }));
      }
    };
    let siguiente = 0;
    const obrero = async () => {
      while (siguiente < lista.length && !ctrl.signal.aborted) await leerUno(lista[siguiente++]);
    };
    void Promise.all(Array.from({ length: Math.min(SIMULTANEOS, lista.length) }, obrero));
    return () => ctrl.abort();
  }, [activo, clave, reloadSignal]);

  return resumen;
}
