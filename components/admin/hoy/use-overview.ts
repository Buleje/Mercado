"use client";

import { useEffect, useMemo, useState } from "react";
import { cachedJson } from "@/lib/client-cache-fetch";
import type { OverviewData } from "@/lib/admin/overview-tipos";
import type { DateRange } from "@/components/admin/inicio/DashboardDateRange";

/** Cada cuánto se refresca Inicio. */
const CADA_MS = 60 * 1000;

/**
 * Los datos de `GET /api/admin/overview` para el rango del tablero, refrescados
 * cada minuto. TodayHub y la columna de avisos de Inicio montan a la vez y
 * pedían el mismo endpoint dos veces: `cachedJson` comparte el pedido en vuelo
 * y la respuesta 30 s.
 */
export function useOverview(dateRange?: DateRange): {
  data: OverviewData | null;
  loading: boolean;
  error: boolean;
} {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // El optional chaining en las dependencias es a propósito: no volver a pedir
  // si `dateRange` cambia de referencia pero no de valor.
  const desde = dateRange?.from.toISOString();
  const hasta = dateRange?.to.toISOString();
  const preset = dateRange?.preset;
  const url = useMemo(() => {
    if (!desde || !hasta || !preset) return "/api/admin/overview";
    const params = new URLSearchParams({ from: desde, to: hasta, preset });
    return `/api/admin/overview?${params.toString()}`;
  }, [desde, hasta, preset]);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const json = await cachedJson<OverviewData>(url, 30_000);
      if (!vivo) return;
      if (json && Array.isArray(json.alerts)) {
        setData(json);
        setError(false);
      } else {
        setError(true);
      }
      setLoading(false);
    };
    void cargar();
    const intervalo = setInterval(() => void cargar(), CADA_MS);
    return () => {
      vivo = false;
      clearInterval(intervalo);
    };
  }, [url]);

  return { data, loading, error };
}
