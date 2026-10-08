"use client";

import { useCallback, useEffect, useState } from "react";
import type { InicioForestal } from "@/lib/forestal/inicio-forestal";
import type { DateRange } from "./DashboardDateRange";

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
