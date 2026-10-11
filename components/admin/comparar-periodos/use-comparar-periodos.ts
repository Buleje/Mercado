"use client";

/**
 * Los datos de Mi Plata › Comparar períodos. Todo sale calculado del
 * servidor (`/api/finanzas/comparativo?periodo=…`) con la regla de ventas de
 * Mi Plata; acá sólo se pide y se guarda. `fecha` null = el período de hoy.
 */
import { useCallback, useEffect, useState } from "react";
import type {
  ComparacionDePeriodos,
  ContraPeriodo,
  Periodo,
} from "@/lib/finance/comparativo-periodos";

export function useCompararPeriodos(periodo: Periodo, contra: ContraPeriodo, fecha: string | null) {
  const [datos, setDatos] = useState<ComparacionDePeriodos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const consulta = `periodo=${periodo}&contra=${contra}${fecha ? `&fecha=${fecha}` : ""}`;

  const cargar = useCallback(
    async (signal?: AbortSignal) => {
      setCargando(true);
      setError("");
      try {
        const res = await fetch(`/api/finanzas/comparativo?${consulta}`, {
          credentials: "include",
          cache: "no-store",
          signal,
        });
        if (res.status === 403) throw new Error("sólo el dueño o el encargado la ven");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ComparacionDePeriodos;
        if (!signal?.aborted) setDatos(json);
      } catch (e) {
        if (signal?.aborted) return;
        setError(e instanceof Error ? e.message : "sin conexión");
      } finally {
        if (!signal?.aborted) setCargando(false);
      }
    },
    [consulta],
  );

  useEffect(() => {
    const control = new AbortController();
    void cargar(control.signal);
    return () => control.abort();
  }, [cargar]);

  return { datos, cargando, error, recargar: () => void cargar() };
}
