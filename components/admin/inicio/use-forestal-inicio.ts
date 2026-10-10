"use client";

import { useCallback, useEffect, useState } from "react";
import { algunDato, valorConDato } from "@/lib/admin/inicio/hay-datos";
import type { InicioForestal, PermisoInicio } from "@/lib/forestal/inicio-forestal";
import type { DateRange } from "./DashboardDateRange";

/** Guías vigentes del período: las del CTP menos sus anuladas, más las del LO-TH. */
export function guiasVigentes(d: Pick<InicioForestal, "ctp" | "loth">): { ctp: number; th: number; anuladas: number } {
  const ctp = d.ctp ? Math.max(0, d.ctp.guias.total - d.ctp.guias.anuladas) : 0;
  const th = d.loth ? d.loth.guias.emitidas : 0;
  const anuladas = (d.ctp?.guias.anuladas ?? 0) + (d.loth?.guias.anuladas ?? 0);
  return { ctp, th, anuladas };
}

/**
 * Un permiso tiene algo que mostrar si trae volumen autorizado (o registrado)
 * o si ya se taló o despachó algo de él. Uno recién creado, sin volumen ni
 * tala, no es una barra: es un nombre en la línea de «todavía sin volumen».
 */
export function permisoConDato(p: PermisoInicio): boolean {
  return algunDato([p.baseM3, p.taladoM3, p.despachadoM3, p.taladoSinRegistrarM3]);
}

/**
 * Qué hay para mostrar en el Inicio forestal (reglas R1/R2 del tablero, 09-10):
 *  - `movimiento`: algo pasó EN EL PERÍODO (entró, se aserró, salió madera o
 *    se emitió una guía vigente). Las anuladas solas no mueven madera.
 *  - `foto`: algo que es «a hoy» y no depende del rango (patio con trozas,
 *    permisos con volumen o tala, adelantos por cobrar).
 * Sin ninguno de los dos, la pestaña es sólo el estado vacío del paiche; sin
 * movimiento pero con foto, el paiche reemplaza a las cifras del período y la
 * foto de hoy queda debajo.
 *
 * Sólo mira lo que ya llegó de `GET /api/admin/inicio/forestal`: no recalcula.
 */
export function estadoInicioForestal(d: InicioForestal): { movimiento: boolean; foto: boolean } {
  const g = guiasVigentes(d);
  const movimiento = algunDato([
    d.ctp?.ingresoM3,
    d.ctp?.consumoM3,
    d.ctp?.producido,
    d.ctp?.despachado,
    g.ctp + g.th,
  ]);
  const foto =
    valorConDato(d.ctp?.patio?.trozas) ||
    valorConDato(d.ctp?.patio?.m3) ||
    (d.loth?.permisos ?? []).some(permisoConDato) ||
    (d.adelantos ?? []).some((a) => valorConDato(a.saldoPendiente));
  return { movimiento, foto };
}

/**
 * Lee `GET /api/admin/inicio/forestal` para el rango del Inicio.
 *
 * El rango viaja como los dos instantes del selector (`from`/`to` en ISO), igual
 * que el período del Libro CTP: así el mismo rango da las mismas cifras acá y
 * en el Tablero del libro. Un cambio de rango a media carga cancela el pedido
 * viejo — si no, la respuesta lenta del mes anterior pisaba la de este.
 */
export function useForestalInicio(dateRange: DateRange, conAdelantos: boolean) {
  const [data, setData] = useState<InicioForestal | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  const desde = dateRange.from.toISOString();
  const hasta = dateRange.to.toISOString();

  useEffect(() => {
    const ac = new AbortController();
    setCargando(true);
    setError(null);
    const qs = new URLSearchParams({ from: desde, to: hasta, adelantos: conAdelantos ? "1" : "0" });
    fetch(`/api/admin/inicio/forestal?${qs}`, { credentials: "include", cache: "no-store", signal: ac.signal })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as (InicioForestal & { message?: string }) | null;
        if (!r.ok || !j) throw new Error(j?.message ?? `No se pudo cargar el resumen forestal (${r.status}).`);
        setData(j);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : "No se pudo cargar el resumen forestal.");
      })
      .finally(() => {
        if (!ac.signal.aborted) setCargando(false);
      });
    return () => ac.abort();
  }, [desde, hasta, conAdelantos, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { data, cargando, error, reintentar };
}
