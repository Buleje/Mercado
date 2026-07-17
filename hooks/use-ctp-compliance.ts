"use client";

/**
 * use-ctp-compliance — datos del panel "Cumplimiento del período" del Libro
 * CTP. No agrega un endpoint nuevo: junta los dos agregados que ya existen
 * (`wood-entries?stats=1` y `ctp?saldos=1`), ambos calculados en DB sobre TODO
 * el conjunto del período — nada se suma acá encima de una página paginada.
 */

import { useCallback, useEffect, useState } from "react";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ctpComplianceScore, type CtpComplianceCounts } from "@/lib/forestal/ctp-compliance";
import type { WoodEntryStats } from "@/components/admin/forestal/ctp-shared";

interface SaldosSummary {
  materiaPrima: { especiesEnNegativo: number };
  productos: { producto: string; stock: number }[];
}

export interface CtpComplianceData {
  counts: CtpComplianceCounts;
  score: number;
  totalIngresos: number;
  /** Productos puntuales con stock negativo — para el detalle de la alerta. */
  productosNegativos: string[];
  /** Líneas de despacho sin cadena completa — para el detalle de la alerta. */
  despachosSinTrazaLineas: number[];
}

interface UseCtpComplianceResult {
  data: CtpComplianceData | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

async function errorFrom(res: Response): Promise<string> {
  const body: { message?: string; error?: string } = await res.json().catch(() => ({}));
  return body.message ?? body.error ?? `HTTP ${res.status}`;
}

export function useCtpCompliance(period: CtpPeriod): UseCtpComplianceResult {
  const [data, setData] = useState<CtpComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // limit=1: esta vista no necesita la lista de entries, solo `stats`.
      const woodParams = applyCtpPeriodParams(
        new URLSearchParams({ stats: "1", limit: "1" }),
        period,
      );
      const saldosParams = applyCtpPeriodParams(new URLSearchParams({ saldos: "1" }), period);
      const trazaParams = applyCtpPeriodParams(new URLSearchParams({ traza: "1" }), period);

      const [woodRes, saldosRes, trazaRes] = await Promise.all([
        fetch(`/api/admin/forestal/wood-entries?${woodParams}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/ctp?${saldosParams}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/ctp?${trazaParams}`, { credentials: "include" }),
      ]);
      if (!woodRes.ok) throw new Error(await errorFrom(woodRes));
      if (!saldosRes.ok) throw new Error(await errorFrom(saldosRes));
      if (!trazaRes.ok) throw new Error(await errorFrom(trazaRes));

      const wood: { stats: WoodEntryStats } = await woodRes.json();
      const saldosBody: { saldos: SaldosSummary } = await saldosRes.json();
      const trazaBody: { traza: { total: number; incompletos: number; lineas: number[] } } =
        await trazaRes.json();
      const saldos = saldosBody.saldos;

      const productosNegativos = saldos.productos.filter((p) => p.stock < 0).map((p) => p.producto);

      const counts: CtpComplianceCounts = {
        fueraPlazo: wood.stats.lateCount,
        pendientes: wood.stats.byStatus.pendiente,
        citesCount: wood.stats.citesCount,
        especiesEnNegativo: saldos.materiaPrima.especiesEnNegativo,
        stockNegativo: productosNegativos.length,
        despachosSinTraza: trazaBody.traza.incompletos,
      };

      setData({
        counts,
        score: ctpComplianceScore(counts),
        totalIngresos: wood.stats.totalCount,
        productosNegativos,
        despachosSinTrazaLineas: trazaBody.traza.lineas,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
