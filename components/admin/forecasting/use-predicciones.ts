"use client";

/**
 * El pronóstico del negocio entero (`/api/analytics/predictions`): ventas de
 * la próxima semana, lo que se agota, el día más tranquilo, los clientes que no
 * vuelven y la hora pico. Una sola carga (≈250 ms) para las tres secciones de
 * Análisis › Predicción que la leen (Ventas, Stock y compras, Clientes).
 *
 * Salió de `PredictiveAnalyticsTab.tsx` (11-10) sin cambiar el cálculo: los
 * números los hace el endpoint; acá sólo se piden y se guardan.
 */

import { useCallback, useEffect, useState } from "react";

export type StockRiskItem = {
  id: string;
  name: string;
  stock: number;
  daysLeft: number;
  image: string | null;
};

export type ChurnItem = {
  id: string;
  name: string;
  phone: string;
  daysAgo: number | null;
  whatsappUrl: string | null;
};

export type Predicciones = {
  salesForecast: number;
  trendPct: number;
  stockRisk: StockRiskItem[];
  bestPurchaseDay: { day: string; reason: string; avgSales: number };
  churnRisk: ChurnItem[];
  peakHour: { hour: number; label: string; salesCount: number };
  generatedAt: string;
};

export interface EstadoPredicciones {
  data: Predicciones | null;
  cargando: boolean;
  error: string;
  recargar: () => void;
}

/** `vuelta` cambia cuando la vista pide «Actualizar»: vuelve a pedir. */
export function usePredicciones(vuelta = 0): EstadoPredicciones {
  const [data, setData] = useState<Predicciones | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [propia, setPropia] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setCargando(true);
    setError("");
    fetch("/api/analytics/predictions", { credentials: "include", signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: Predicciones) => setData(json))
      .catch((e: unknown) => {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Error al cargar predicciones");
      })
      .finally(() => { if (!ac.signal.aborted) setCargando(false); });
    return () => ac.abort();
  }, [vuelta, propia]);

  const recargar = useCallback(() => setPropia((v) => v + 1), []);
  return { data, cargando, error, recargar };
}
