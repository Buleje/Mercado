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
 *
 * Junto al balance pide los papeles del permiso de ese plan (`/documentos/
 * papeles`, la misma cuenta que la pestaña): el semáforo de la tarjeta dice
 * «Papel vencido» igual que la cabecera. Un fallo de los papeles no tumba la
 * tarjeta: queda `null` y el semáforo dice «No pude leer los papeles».
 *
 * Lo PRELIMINAR (Brandon 26-10: «el registro que tiene datos preliminares tiene
 * que aparecer cuántas GTF, su volumen preliminar y un saldo preliminar»): una
 * sola pregunta al servidor dice qué planes tienen GTF preliminares pendientes
 * (`?preliminaresPendientes=1`) y sólo para esos se lee el resumen que calcula
 * el servidor (`/loth/saldo-plan?planId=…&preliminares=1`, el mismo KPI del plan
 * abierto). Si falla, la tarjeta sale igual, sin la franja.
 */

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { cascadaDelPlan, type CascadaEspecie, type FilaBalanceCascada } from "@/lib/forestal/loth-saldo-cascada";
import { resumenParaSemaforo, type PapelesDelPlan } from "@/lib/forestal/loth-plan-papeles";
import type { PapelesSemaforo } from "@/lib/forestal/loth-plan-semaforo";
import type { ResumenPreliminares } from "@/lib/forestal/loth-plan-preliminares";

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
  | {
      estado: "ok";
      total: CascadaEspecie;
      especies: number;
      /** El saldo por especie: el semáforo de la tarjeta lo mira igual que la cabecera del plan. */
      porEspecie: CascadaEspecie[];
      /** Los papeles del permiso; `undefined` = el negocio no tiene esa sección; `null` = falló la lectura. */
      papeles?: PapelesSemaforo | null;
      /** Las GTF preliminares por registrar; `undefined` = no tiene; `null` = falló la lectura. */
      preliminar?: PreliminarDeLaTarjeta | null;
    };

/** El resumen de las GTF preliminares que lleva la tarjeta (lo calcula el servidor). */
export interface PreliminarDeLaTarjeta {
  guias: number;
  trozas: number;
  m3: number;
  /** «Saldo si se registran»; `null` = el plan no tiene techo. */
  saldoM3: number | null;
  /** Alguna especie se pasaría si se registran. */
  excede: boolean;
}

const RUTA_SALDO = "/api/admin/forestal/loth/saldo-plan";

/** Los planes con alguna preliminar pendiente; `null` = no se pudo saber (la grilla sigue sin la franja). */
async function leerPendientes(signal: AbortSignal): Promise<Set<string> | null> {
  try {
    const r = await fetch(`${RUTA_SALDO}?preliminaresPendientes=1`, { credentials: "include", cache: "no-store", signal });
    if (r.status === 403 || r.status === 404) return new Set();
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { planIds?: unknown };
    return new Set(Array.isArray(j.planIds) ? j.planIds.filter((x): x is string => typeof x === "string") : []);
  } catch (err) {
    if (!signal.aborted) logger.warn("[loth-planes-varios] preliminares pendientes failed", { error: String(err) });
    return null;
  }
}

/** El resumen de las preliminares de un plan; `undefined` = nada por registrar. */
async function leerPreliminar(id: string, signal: AbortSignal): Promise<PreliminarDeLaTarjeta | null | undefined> {
  try {
    const r = await fetch(`${RUTA_SALDO}?planId=${encodeURIComponent(id)}&preliminares=1`, { credentials: "include", cache: "no-store", signal });
    if (r.status === 403 || r.status === 404) return undefined;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const res = ((await r.json()) as { preliminares?: { resumen?: ResumenPreliminares } | null }).preliminares?.resumen;
    if (!res) return null;
    if (res.guias === 0) return undefined;
    return { guias: res.guias, trozas: res.trozas, m3: res.m3, saldoM3: res.quedaSiSeRegistranTotalM3, excede: res.excede };
  } catch (err) {
    if (!signal.aborted) logger.warn("[loth-planes-varios] preliminar failed", { planId: id, error: String(err) });
    return null;
  }
}

/** Los papeles de un plan para el semáforo: 403/404 = no se juzga; otro fallo = `null`. */
async function leerPapeles(id: string, signal: AbortSignal): Promise<PapelesSemaforo | null | undefined> {
  try {
    const r = await fetch(`/api/admin/forestal/plan/documentos/papeles?planId=${encodeURIComponent(id)}`, { credentials: "include", signal });
    if (r.status === 403 || r.status === 404) return undefined;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as Pick<PapelesDelPlan, "lista" | "requeridos" | "presentes">;
    return resumenParaSemaforo(j);
  } catch (err) {
    if (!signal.aborted) logger.warn("[loth-planes-varios] papeles failed", { planId: id, error: String(err) });
    return null;
  }
}

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

    const pendientesP = leerPendientes(ctrl.signal);
    const leerUno = async (id: string) => {
      const papelesP = leerPapeles(id, ctrl.signal);
      const preliminarP = pendientesP.then((s) => (s?.has(id) ? leerPreliminar(id, ctrl.signal) : undefined));
      try {
        const r = await fetch(`/api/admin/forestal/plan?balance=${encodeURIComponent(id)}`, { credentials: "include", signal: ctrl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const filas: FilaBalanceCascada[] = (await r.json())?.balance?.rows ?? [];
        const [papeles, preliminar] = await Promise.all([papelesP, preliminarP]);
        if (ctrl.signal.aborted) return;
        const cascada = cascadaDelPlan(filas);
        setResumen((prev) => ({ ...prev, [id]: { estado: "ok", total: cascada.total, especies: filas.length, porEspecie: cascada.especies, papeles, preliminar } }));
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
