"use client";

/**
 * use-ctp-compliance — datos del panel "Cumplimiento del período" del Libro
 * CTP. No agrega un endpoint nuevo: junta los dos agregados que ya existen
 * (`wood-entries?stats=1` y `ctp?saldos=1`), ambos calculados en DB sobre TODO
 * el conjunto del período — nada se suma acá encima de una página paginada.
 */

import { useCallback, useEffect, useState } from "react";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ctpComplianceScore, parseCitesPermiso, type CtpComplianceCounts } from "@/lib/forestal/ctp-compliance";
import { evaluarRendimiento } from "@/lib/forestal/ctp-rendimiento";
import { documentosVencimientoDeFicha } from "@/lib/forestal/ctp-ficha-types";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import type { WoodEntryStats } from "@/components/admin/forestal/ctp-shared";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { registrarSnapshot } from "./use-ctp-compliance-serie";
import { logger } from "@/lib/logger";

interface SaldosSummary {
  materiaPrima: { especiesEnNegativo: number };
  productos: { producto: string; stock: number }[];
  porEspecie: { especie: string; cites: boolean }[];
}

/**
 * FIX 2026-08-22: antes `(x ?? "").trim().toLowerCase()` — sin quitar tildes.
 * El match CITES ya es por substring («tolerante a tipeo», ver más abajo) así
 * que el paréntesis del científico no rompía nada (el permiso "Caoba
 * (Swietenia macrophylla)" SÍ contiene "caoba"), pero un permiso cargado como
 * "Ishpingo" contra un ingreso "Ishpíngo" (tilde de más/de menos, típico al
 * tipear en dos formularios distintos) sí fallaba: ninguno es substring del
 * otro con un carácter distinto. `claveEspecie` (misma fuente que LOTH) quita
 * tildes además del paréntesis — sólo puede ACOTAR falsos "sin permiso", nunca
 * ocultar un permiso que de verdad falta.
 */
const norm = claveEspecie;

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
  /** GTF de ingresos CITES (vivos) sin un permiso vinculado en el acta (informativo). */
  citesSinPermisoIngresos: string[];
  /** Corridas con rendimiento sobre el referencial SERFOR (informativo). */
  rendimientoAltoLineas: number[];
  /** Títulos habilitantes / permisos CITES vencidos en la Ficha (informativo). */
  documentosVencidosLabels: string[];
  /** Los que vencen dentro de 30 días, con los días que quedan (informativo). */
  documentosPorVencerLabels: string[];
}

interface UseCtpComplianceResult {
  data: CtpComplianceData | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useCtpCompliance(period: CtpPeriod): UseCtpComplianceResult {
  const [data, setData] = useState<CtpComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // stats para los agregados + entries del período para el chequeo CITES
      // por-ingreso (cada acta trae su permiso en notes; el stats agregado no).
      const woodParams = applyCtpPeriodParams(
        new URLSearchParams({ stats: "1", limit: "1000" }),
        period,
      );
      const saldosParams = applyCtpPeriodParams(new URLSearchParams({ saldos: "1" }), period);
      const trazaParams = applyCtpPeriodParams(new URLSearchParams({ traza: "1" }), period);
      const prodParams = applyCtpPeriodParams(new URLSearchParams({ section: "produccion" }), period);
      const concilParams = applyCtpPeriodParams(new URLSearchParams({ conciliacion: "1" }), period);

      /* Deduplicado (ADR-347): los cinco los pide también la vista activa en el
         mismo montaje. Ficha y producción son INFORMATIVAS: si fallan, el panel
         core sigue. */
      const [wood, saldosBody, trazaBody, fichaJson, prodJson, concilBody] = await Promise.all([
        ctpGet<{
          stats: WoodEntryStats;
          entries?: { gtfNumber: string; speciesCites: boolean; status: string; notes: string | null }[];
        }>(`/api/admin/forestal/wood-entries?${woodParams}`),
        ctpGet<{ saldos: SaldosSummary }>(`/api/admin/forestal/ctp?${saldosParams}`),
        ctpGet<{ traza: { total: number; incompletos: number; lineas: number[] } }>(
          `/api/admin/forestal/ctp?${trazaParams}`,
        ),
        ctpGet<unknown>(`/api/admin/forestal/ctp-ficha`).catch((err) => {
          logger.warn("[ctp-compliance] ficha no cargó", { error: String(err) });
          return null;
        }),
        ctpGet<unknown>(`/api/admin/forestal/ctp?${prodParams}`).catch((err) => {
          logger.warn("[ctp-compliance] producción no cargó", { error: String(err) });
          return null;
        }),
        /* La conciliación (ADR-139) es la que sabe la existencia FINAL: apertura
           heredada + movimiento del período. Sin ella, «especies en negativo»
           castiga el movimiento suelto y le resta hasta 25 puntos a una planta
           que arrancó el mes con stock y cerró en positivo. Best-effort: si no
           llega, se usa el movimiento, que es lo que se sabe. */
        ctpGet<{ conciliacion: { materiaPrima: { especie: string; negativa: boolean }[] } }>(
          `/api/admin/forestal/ctp?${concilParams}`,
        ).catch((err) => {
          logger.warn("[ctp-compliance] conciliación no cargó", { error: String(err) });
          return null;
        }),
      ]);

      // CITES por-ingreso: actas CITES vivas (no rechazadas/anuladas) que no
      // vincularon un permiso en sus notas. Informativo — NO resta score, como
      // el resto de señales CITES (un score que castiga lo incorregible enseña
      // a ignorarlo). El faltante estructural se ve acá y en el export.
      const citesSinPermisoIngresos = (wood.entries ?? [])
        .filter((e) => e.speciesCites && e.status !== "rechazado" && e.status !== "anulado" && !parseCitesPermiso(e.notes))
        .map((e) => e.gtfNumber)
        .filter(Boolean);
      const saldos = saldosBody.saldos;

      const productosNegativos = saldos.productos.filter((p) => p.stock < 0).map((p) => p.producto);

      // ── Señales informativas (best-effort) ──
      // CITES sin permiso: especies CITES del período que no matchean ningún
      // permiso cargado en la Ficha (match laxo por substring, tolerante a tipeo).
      let citesSinPermisoEspecies: string[] = [];
      const documentosVencidosLabels: string[] = [];
      const documentosPorVencerLabels: string[] = [];
      if (fichaJson) {
        const body = fichaJson as {
          ficha?: {
            citesPermisos?: { especie: string; vencimiento?: string }[];
            titulos?: { tipo: string; codigo: string; vencimiento?: string }[];
          };
        };
        const f = body.ficha;
        const permisos = (f?.citesPermisos ?? []).map((p) => norm(p.especie)).filter(Boolean);
        citesSinPermisoEspecies = (saldos.porEspecie ?? [])
          .filter((e) => e.cites)
          .filter((e) => {
            const s = norm(e.especie);
            return !permisos.some((p) => s.includes(p) || p.includes(s));
          })
          .map((e) => e.especie);
        // Documentos vencidos: un título/permiso caducado invalida el origen.
        // Y los que vencen dentro de 30 días: llegar a tiempo a la renovación es
        // lo único que evita el vencido de la línea de arriba. Single source con
        // el cron `forestal-plazos` (`documentosVencimientoDeFicha`).
        const vencimiento = documentosVencimientoDeFicha(f);
        documentosVencidosLabels.push(...vencimiento.vencidosLabels);
        documentosPorVencerLabels.push(...vencimiento.porVencerLabels);
      }
      // Rendimiento alto: corridas de producción sobre el referencial SERFOR.
      let rendimientoAltoLineas: number[] = [];
      if (prodJson) {
        const prod = prodJson as {
          entries?: { lineNo: number; productType: string | null; rendimientoPct: string | null }[];
        };
        rendimientoAltoLineas = (prod.entries ?? [])
          .filter((r) => evaluarRendimiento(r.productType, r.rendimientoPct != null ? Number(r.rendimientoPct) : null).estado === "alto")
          .map((r) => r.lineNo);
      }

      const counts: CtpComplianceCounts = {
        fueraPlazo: wood.stats.lateCount,
        pendientes: wood.stats.byStatus.pendiente,
        citesCount: wood.stats.citesCount,
        /* La existencia final manda; el movimiento del período es el respaldo.
           Son cosas distintas y confundirlas inventa una infracción: consumir
           más de lo que entró es normal cuando había stock heredado. */
        especiesEnNegativo:
          concilBody?.conciliacion?.materiaPrima != null
            ? concilBody.conciliacion.materiaPrima.filter((m) => m.negativa).length
            : saldos.materiaPrima.especiesEnNegativo,
        stockNegativo: productosNegativos.length,
        despachosSinTraza: trazaBody.traza.incompletos,
        citesSinPermiso: citesSinPermisoEspecies.length,
        rendimientoAlto: rendimientoAltoLineas.length,
        documentosVencidos: documentosVencidosLabels.length,
        documentosPorVencer: documentosPorVencerLabels.length,
      };

      const score = ctpComplianceScore(counts);
      /* La historia del cumplimiento (ADR-384): se guarda lo que el panel ACABA
         de calcular, no una recomposición server-side que divergiría del número
         que el operador ve. Fire-and-forget y una vez por día. */
      registrarSnapshot(period.key, counts, score, wood.stats.totalCount);

      setData({
        counts,
        score,
        totalIngresos: wood.stats.totalCount,
        productosNegativos,
        despachosSinTrazaLineas: trazaBody.traza.lineas,
        citesSinPermisoEspecies,
        citesSinPermisoIngresos,
        rendimientoAltoLineas,
        documentosVencidosLabels,
        documentosPorVencerLabels,
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
