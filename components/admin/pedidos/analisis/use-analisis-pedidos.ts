"use client";

/**
 * Datos de Pedidos › Análisis (N06): todo viene calculado del servidor
 * (`/api/admin/pedidos/analisis`); acá sólo se pide el período elegido y se
 * recuerda cuál fue. Un cambio de período rápido no deja que la respuesta
 * vieja pise a la nueva.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { tenantFetch } from "@/lib/tenant-fetch";
import { logger } from "@/lib/logger";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { esPeriodoAnalisis, type AnalisisOperativo, type PeriodoAnalisis } from "@/lib/pedidos/analisis-operativo";

export interface RespuestaAnalisis {
  periodo: PeriodoAnalisis;
  generado: string;
  truncado: boolean;
  tope: number;
  analisis: AnalisisOperativo;
}

export function useAnalisisPedidos() {
  const [guardado, setPeriodo] = useLocalStorage<PeriodoAnalisis>("pedidos-analisis-periodo", "30");
  const periodo: PeriodoAnalisis = esPeriodoAnalisis(guardado) ? guardado : "30";
  const [datos, setDatos] = useState<RespuestaAnalisis | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const turno = useRef(0);

  const cargar = useCallback(async (p: PeriodoAnalisis) => {
    const mio = ++turno.current;
    setCargando(true);
    try {
      const res = await tenantFetch(`/api/admin/pedidos/analisis?periodo=${p}`);
      if (mio !== turno.current) return;
      if (res.status === 403) {
        setError("Con tu rol no ves el análisis: tiene montos del negocio.");
        return;
      }
      if (!res.ok) throw new Error(`analisis ${res.status}`);
      const j = (await res.json()) as RespuestaAnalisis;
      if (mio !== turno.current) return;
      setDatos(j);
      setError(null);
    } catch (err) {
      logger.warn("[AnalisisPedidos] no se pudo cargar", { error: String(err) });
      if (mio === turno.current) setError("No pudimos calcular el análisis. Revisa tu conexión e inténtalo otra vez.");
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(periodo);
  }, [cargar, periodo]);

  return { periodo, setPeriodo, datos, cargando, error, recargar: () => cargar(periodo) };
}
