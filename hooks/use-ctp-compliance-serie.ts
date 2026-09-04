"use client";

/**
 * use-ctp-compliance-serie — la historia del score del Libro CTP (ADR-384).
 *
 * Dos mitades del mismo hecho:
 *  - `registrarSnapshot()` guarda el punto de HOY, con lo que el panel ya
 *    calculó. No recalcula nada: recalcular server-side crearía un segundo
 *    score que va a divergir del que ve el operador.
 *  - `useCtpComplianceSerie()` lee la serie para graficarla.
 *
 * El registro es fire-and-forget y **una vez por día, período y pestaña**: el
 * panel se remonta al cambiar de vista y sin el guard mandaría un POST por cada
 * montaje. Guardar la historia nunca puede volverse ruido sobre la pantalla que
 * la produce.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { logger } from "@/lib/logger";
import type { CtpComplianceCounts } from "@/lib/forestal/ctp-compliance";
import type { CtpPeriodKey } from "@/lib/forestal/ctp-period";

const API = "/api/admin/forestal/ctp-compliance";

/** Un punto de la serie, tal como lo devuelve el endpoint. */
export interface ComplianceSnapshot {
  /** `yyyy-mm-dd`. */
  fecha: string;
  periodo: string;
  score: number;
  fueraPlazo: number;
  pendientes: number;
  especiesEnNegativo: number;
  stockNegativo: number;
  despachosSinTraza: number;
  citesCount: number;
  citesSinPermiso: number;
  rendimientoAlto: number;
  documentosVencidos: number;
  documentosPorVencer: number;
  totalIngresos: number;
}

/** Lo ya mandado en esta pestaña: `<periodo>:<yyyy-mm-dd>`. */
const yaMandado = new Set<string>();

/**
 * El gráfico y el POST viven en componentes distintos y arrancan a la vez: el
 * GET sale ANTES de que el punto de hoy exista, así que el primer día el
 * operador veía «todavía no hay historia» justo después de haberla creado.
 * Al guardarse un punto se avisa, y el que esté graficando vuelve a leer.
 */
const oyentes = new Set<() => void>();

const hoyUtc = () => new Date().toISOString().slice(0, 10);

/**
 * Guarda el punto de hoy. Fire-and-forget: si falla, el panel no se entera.
 *
 * `custom` se saltea a propósito: su rango no se guarda, así que dos snapshots
 * «custom» de días distintos pueden hablar de períodos completamente distintos
 * y la línea que los une no significaría nada.
 */
export function registrarSnapshot(
  periodo: CtpPeriodKey,
  counts: CtpComplianceCounts,
  score: number,
  totalIngresos: number,
): void {
  if (periodo === "custom") return;
  const clave = `${periodo}:${hoyUtc()}`;
  if (yaMandado.has(clave)) return;
  yaMandado.add(clave);

  void fetch(API, {
    method: "POST",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({
      periodo,
      score,
      totalIngresos,
      fueraPlazo: counts.fueraPlazo,
      pendientes: counts.pendientes,
      especiesEnNegativo: counts.especiesEnNegativo,
      stockNegativo: counts.stockNegativo,
      despachosSinTraza: counts.despachosSinTraza,
      citesCount: counts.citesCount,
      citesSinPermiso: counts.citesSinPermiso ?? 0,
      rendimientoAlto: counts.rendimientoAlto ?? 0,
      documentosVencidos: counts.documentosVencidos ?? 0,
      documentosPorVencer: counts.documentosPorVencer ?? 0,
    }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      /* El GET está cacheado 8s (ADR-347): sin invalidar, el reload devolvería
         la misma respuesta vacía que motivó el aviso. */
      invalidarCtp("ctp-compliance");
      for (const f of oyentes) f();
    })
    .catch((err) => {
    /* Reintentar en el próximo montaje: sacarlo del set. Un día perdido es un
       hueco en el gráfico, no un dato falso. */
    yaMandado.delete(clave);
    logger.warn("[ctp-compliance] no se pudo guardar el snapshot del día", { error: String(err) });
  });
}

export interface UseComplianceSerieResult {
  serie: ComplianceSnapshot[] | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** La serie de los últimos `dias` para ese período. */
export function useCtpComplianceSerie(
  periodo: CtpPeriodKey,
  dias = 90,
  activo = true,
): UseComplianceSerieResult {
  const [serie, setSerie] = useState<ComplianceSnapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activo || periodo === "custom") {
      setSerie([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await ctpGet<{ serie: ComplianceSnapshot[] }>(
        `${API}?periodo=${encodeURIComponent(periodo)}&dias=${dias}`,
      );
      setSerie(r.serie ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [periodo, dias, activo]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Volver a leer cuando el panel acaba de guardar el punto de hoy. */
  useEffect(() => {
    const f = () => { void load(); };
    oyentes.add(f);
    return () => { oyentes.delete(f); };
  }, [load]);

  return { serie, loading, error, reload: load };
}
