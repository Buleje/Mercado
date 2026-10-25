"use client";

/**
 * «Saldo que no se pasa» (24-10) desde la pantalla
 * (`/api/admin/forestal/loth/saldo-plan`):
 *
 *  - `useSaldoDelPlan`: autorizado · usado · queda por especie de un plan, con
 *    la guía de cada m³.
 *  - `useSaldosDeLoSinPlan`: el de cada plan vigente con especies, contra los
 *    que T6 mide lo que sale sin plan: así el freno del despacho mide lo mismo
 *    que el 422.
 *  - `useSueltosDelLibro`: las guías y trozas sin plan, con el plan sugerido.
 *  - `crearPlanDesdeLaGuia`: el POST de «Crear el plan desde la guía».
 *
 * `version` relee: subirla tras atar o crear un plan.
 */

import { useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { logger } from "@/lib/logger";
import type { AltaDesdeLaGuia, PlanCreadoDesdeLaGuia, SaldoPlanRespuesta, SaldosDeLoSinPlan, SueltosDelLibro } from "@/lib/forestal/loth-saldo-plan-tipos";

const RUTA = "/api/admin/forestal/loth/saldo-plan";

export interface LecturaEstado<T> {
  dato: T | null;
  cargando: boolean;
  error: string | null;
}

type ConError = { message?: string; error?: string };

/** Un GET que se relee con la clave y descarta la respuesta de una clave vieja. */
function useLectura<T>(url: string | null, que: string): LecturaEstado<T> {
  const [estado, setEstado] = useState<{ url: string; dato: T | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    fetch(url, { credentials: "include", cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        const j = await leerJson<T & ConError>(r);
        if (ctrl.signal.aborted) return;
        if (!r.ok || !j) setEstado({ url, dato: null, error: j?.message ?? j?.error ?? `No se pudo leer ${que} (${r.status})` });
        else setEstado({ url, dato: j, error: null });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        logger.warn(`[loth-saldo-plan] no se pudo leer ${que}`, { error: String(err) });
        setEstado({ url, dato: null, error: `No se pudo leer ${que}. Recarga la página.` });
      });
    return () => ctrl.abort();
  }, [url, que]);
  const vigente = estado && estado.url === url ? estado : null;
  /* Releer lo mismo (sólo cambia `&v=`) deja ver lo anterior mientras llega: si no,
     el renglón y la ventana de «Atar» parpadeaban tras cada atado. Otro plan, nunca. */
  const base = (u: string | null) => u?.replace(/&v=[^&]*$/, "") ?? null;
  const anterior = !vigente && estado && base(estado.url) === base(url) ? estado.dato : null;
  return { dato: vigente?.dato ?? anterior, cargando: !!url && !vigente, error: vigente?.error ?? null };
}

/** El saldo de un plan. Sin `planId` o con `activo:false` no se pide nada. */
export function useSaldoDelPlan(planId: string | null | undefined, version = 0, activo = true): LecturaEstado<SaldoPlanRespuesta> {
  const url = activo && planId ? `${RUTA}?${new URLSearchParams({ planId })}&v=${version}` : null;
  return useLectura<SaldoPlanRespuesta>(url, "el saldo del plan");
}

/** El saldo de cada plan vigente con especies (lo sin plan cuenta en todos). `activo:false` = no se pide. */
export function useSaldosDeLoSinPlan(activo = true, version = 0): LecturaEstado<SaldosDeLoSinPlan> {
  return useLectura<SaldosDeLoSinPlan>(activo ? `${RUTA}?sinPlan=1&v=${version}` : null, "el saldo de los planes vigentes");
}

export function useSueltosDelLibro(version = 0, activo = true): LecturaEstado<SueltosDelLibro> {
  return useLectura<SueltosDelLibro>(activo ? `${RUTA}?sueltos=1&v=${version}` : null, "lo que no tiene plan");
}

export type ResultadoAlta =
  | { ok: true; plan: PlanCreadoDesdeLaGuia }
  | { ok: false; status: number; mensaje: string; planExistente: string | null };

export async function crearPlanDesdeLaGuia(gtfId: string, alta: AltaDesdeLaGuia): Promise<ResultadoAlta> {
  try {
    const r = await fetch(RUTA, {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ gtfId, ...alta }),
    });
    const j = await leerJson<PlanCreadoDesdeLaGuia & ConError & { detail?: { planId?: string } }>(r);
    if (r.ok && j) return { ok: true, plan: j };
    return {
      ok: false,
      status: r.status,
      mensaje: j?.message ?? j?.error ?? `No se pudo crear el plan (${r.status})`,
      planExistente: r.status === 409 ? (j?.detail?.planId ?? null) : null,
    };
  } catch (err) {
    logger.warn("[loth-saldo-plan] no se pudo crear el plan desde la guía", { error: String(err) });
    return { ok: false, status: 0, mensaje: "No se pudo crear el plan: revisa la conexión y vuelve a intentar.", planExistente: null };
  }
}
