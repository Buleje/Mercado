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
import { estadoVencimiento } from "@/lib/forestal/ctp-ficha-types";
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
  /** GTF de ingresos CITES (vivos) sin un permiso vinculado en el acta (informativo). */
  citesSinPermisoIngresos: string[];
  /** Corridas con rendimiento sobre el referencial SERFOR (informativo). */
  rendimientoAltoLineas: number[];
  /** Títulos habilitantes / permisos CITES vencidos en la Ficha (informativo). */
  documentosVencidosLabels: string[];
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
      // stats para los agregados + entries del período para el chequeo CITES
      // por-ingreso (cada acta trae su permiso en notes; el stats agregado no).
      const woodParams = applyCtpPeriodParams(
        new URLSearchParams({ stats: "1", limit: "1000" }),
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

      const wood: {
        stats: WoodEntryStats;
        entries?: { gtfNumber: string; speciesCites: boolean; status: string; notes: string | null }[];
      } = await woodRes.json();
      const saldosBody: { saldos: SaldosSummary } = await saldosRes.json();

      // CITES por-ingreso: actas CITES vivas (no rechazadas/anuladas) que no
      // vincularon un permiso en sus notas. Informativo — NO resta score, como
      // el resto de señales CITES (un score que castiga lo incorregible enseña
      // a ignorarlo). El faltante estructural se ve acá y en el export.
      const citesSinPermisoIngresos = (wood.entries ?? [])
        .filter((e) => e.speciesCites && e.status !== "rechazado" && e.status !== "anulado" && !parseCitesPermiso(e.notes))
        .map((e) => e.gtfNumber)
        .filter(Boolean);
      const trazaBody: { traza: { total: number; incompletos: number; lineas: number[] } } =
        await trazaRes.json();
      const saldos = saldosBody.saldos;

      const productosNegativos = saldos.productos.filter((p) => p.stock < 0).map((p) => p.producto);

      // ── Señales informativas (best-effort) ──
      // CITES sin permiso: especies CITES del período que no matchean ningún
      // permiso cargado en la Ficha (match laxo por substring, tolerante a tipeo).
      let citesSinPermisoEspecies: string[] = [];
      const documentosVencidosLabels: string[] = [];
      if (fichaRes.ok) {
        const body: {
          ficha?: {
            citesPermisos?: { especie: string; vencimiento?: string }[];
            titulos?: { tipo: string; codigo: string; vencimiento?: string }[];
          };
        } = await fichaRes.json();
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
        for (const p of f?.citesPermisos ?? []) {
          if (p.vencimiento && estadoVencimiento(p.vencimiento) === "vencido") {
            documentosVencidosLabels.push(`CITES ${p.especie || "—"}`);
          }
        }
        for (const t of f?.titulos ?? []) {
          if (t.vencimiento && estadoVencimiento(t.vencimiento) === "vencido") {
            documentosVencidosLabels.push(t.codigo || t.tipo || "título");
          }
        }
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
        documentosVencidos: documentosVencidosLabels.length,
      };

      setData({
        counts,
        score: ctpComplianceScore(counts),
        totalIngresos: wood.stats.totalCount,
        productosNegativos,
        despachosSinTrazaLineas: trazaBody.traza.lineas,
        citesSinPermisoEspecies,
        citesSinPermisoIngresos,
        rendimientoAltoLineas,
        documentosVencidosLabels,
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
