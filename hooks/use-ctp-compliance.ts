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
import { evaluarRendimiento } from "@/lib/forestal/ctp-rendimiento";
import type { WoodEntryStats } from "@/components/admin/forestal/ctp-shared";

interface SaldosSummary {
  materiaPrima: { especiesEnNegativo: number };
  productos: { producto: string; stock: number }[];
  porEspecie: { especie: string; cites: boolean }[];
}

const norm = (x: string | null | undefined) => (x ?? "").trim().toLowerCase();

export interface CtpComplianceData {
  counts: CtpComplianceCounts;
  score: number;
  totalIngresos: number;
  /** Productos puntuales con stock negativo — para el detalle de la alerta. */
  productosNegativos: string[];
  /** Líneas de despacho sin cadena completa — para el detalle de la alerta. */
  despachosSinTrazaLineas: number[];
  /** Especies CITES del período sin permiso cargado en la Ficha (informativo). */
  citesSinPermisoEspecies: string[];
  /** Corridas con rendimiento sobre el referencial SERFOR (informativo). */
  rendimientoAltoLineas: number[];
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
      const prodParams = applyCtpPeriodParams(new URLSearchParams({ section: "produccion" }), period);

      const [woodRes, saldosRes, trazaRes, fichaRes, prodRes] = await Promise.all([
        fetch(`/api/admin/forestal/wood-entries?${woodParams}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/ctp?${saldosParams}`, { credentials: "include" }),
        fetch(`/api/admin/forestal/ctp?${trazaParams}`, { credentials: "include" }),
        // Ficha + producción son INFORMATIVAS: si fallan, el panel core sigue.
        fetch(`/api/admin/forestal/ctp-ficha`, { credentials: "include" }),
        fetch(`/api/admin/forestal/ctp?${prodParams}`, { credentials: "include" }),
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

      // ── Señales informativas (best-effort) ──
      // CITES sin permiso: especies CITES del período que no matchean ningún
      // permiso cargado en la Ficha (match laxo por substring, tolerante a tipeo).
      let citesSinPermisoEspecies: string[] = [];
      if (fichaRes.ok) {
        const ficha: { ficha?: { citesPermisos?: { especie: string }[] } } = await fichaRes.json();
        const permisos = (ficha.ficha?.citesPermisos ?? []).map((p) => norm(p.especie)).filter(Boolean);
        citesSinPermisoEspecies = (saldos.porEspecie ?? [])
          .filter((e) => e.cites)
          .filter((e) => {
            const s = norm(e.especie);
            return !permisos.some((p) => s.includes(p) || p.includes(s));
          })
          .map((e) => e.especie);
      }
      // Rendimiento alto: corridas de producción sobre el referencial SERFOR.
      let rendimientoAltoLineas: number[] = [];
      if (prodRes.ok) {
        const prod: { entries?: { lineNo: number; productType: string | null; rendimientoPct: string | null }[] } =
          await prodRes.json();
        rendimientoAltoLineas = (prod.entries ?? [])
          .filter((r) => evaluarRendimiento(r.productType, r.rendimientoPct != null ? Number(r.rendimientoPct) : null).estado === "alto")
          .map((r) => r.lineNo);
      }

      const counts: CtpComplianceCounts = {
        fueraPlazo: wood.stats.lateCount,
        pendientes: wood.stats.byStatus.pendiente,
        citesCount: wood.stats.citesCount,
        especiesEnNegativo: saldos.materiaPrima.especiesEnNegativo,
        stockNegativo: productosNegativos.length,
        despachosSinTraza: trazaBody.traza.incompletos,
        citesSinPermiso: citesSinPermisoEspecies.length,
        rendimientoAlto: rendimientoAltoLineas.length,
      };

      setData({
        counts,
        score: ctpComplianceScore(counts),
        totalIngresos: wood.stats.totalCount,
        productosNegativos,
        despachosSinTrazaLineas: trazaBody.traza.lineas,
        citesSinPermisoEspecies,
        rendimientoAltoLineas,
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
