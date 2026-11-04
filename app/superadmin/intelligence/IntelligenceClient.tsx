"use client";

import { AlertTriangle, Package, Activity, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { AdminTabShell } from "../_components/_shared";
import DemandaMaderaSection from "./DemandaMaderaSection";
import DemandaInsatisfechaSection from "./DemandaInsatisfechaSection";
import DemandaCategoriasSection from "./DemandaCategoriasSection";
import DemandaQuiebresSection from "./DemandaQuiebresSection";
import DemandaZonasSection from "./DemandaZonasSection";
import { fmtUnits, fmtDate } from "./intelligence-shared";
import { useDemandReport } from "./use-demand-report";

// ── Componente principal ──────────────────────────────────────────────────────

export default function IntelligenceClient() {
  const { report, loading, error, load } = useDemandReport();

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AdminTabShell
        title="Inteligencia de Barrio"
        description="Analizando demanda real de todas tus bodegas…"
        icon={Activity}
        kicker="Plataforma · Inteligencia"
      >
        <div className="flex items-center justify-center py-32 gap-3 text-[var(--text-tertiary)]">
          <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
          <span className="text-sm font-medium">Cargando reporte de demanda…</span>
        </div>
      </AdminTabShell>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !report) {
    return (
      <AdminTabShell
        title="Inteligencia de Barrio"
        description="Detecta qué quiere el barrio antes de que lo pidan."
        icon={Activity}
        kicker="Plataforma · Inteligencia"
      >
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <AlertTriangle className="w-8 h-8 text-[var(--data-error-500,#dc2626)]" aria-hidden />
          <p className="text-sm text-[var(--data-error-500,#dc2626)] font-medium">
            {error || "No se pudo cargar el reporte."}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 px-4 min-h-10 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden />
            Reintentar
          </button>
        </div>
      </AdminTabShell>
    );
  }

  // ── Empty state global ───────────────────────────────────────────────────────
  const isEmpty =
    report.risingCategories.length === 0 &&
    report.fallingCategories.length === 0 &&
    report.unmetDemand.length === 0 &&
    report.byZone.length === 0 &&
    report.stockoutHotspots.length === 0 &&
    (report.madera?.species.length ?? 0) === 0;

  if (isEmpty) {
    return (
      <AdminTabShell
        title="Inteligencia de Barrio"
        description="Detecta qué quiere el barrio antes de que lo pidan."
        icon={Activity}
        kicker="Plataforma · Inteligencia"
      >
        <div className="flex flex-col items-center justify-center py-32 gap-3 text-[var(--text-secondary)]">
          <Activity className="w-10 h-10 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-base font-medium text-[var(--text-primary)]">
            Todavía no hay datos de demanda
          </p>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm text-center">
            Cuando tus bodegas tengan ventas registradas, acá vas a ver qué productos sube, qué baja
            y dónde hay quiebres de stock.
          </p>
        </div>
      </AdminTabShell>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────

  return (
    <AdminTabShell
      title="Inteligencia de Barrio"
      description="Demanda real de todas tus bodegas — detecta tendencias, quiebres y oportunidades."
      icon={Activity}
      kicker="Plataforma · Inteligencia"
      stats={
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-soft)] text-sm font-semibold text-[var(--text-secondary)]">
            <Package className="w-4 h-4" aria-hidden />
            {fmtUnits(report.totalUnits)} uds · {report.period.label}
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">
            Generado {fmtDate(report.generatedAt)}
          </span>
        </div>
      }
    >
      {/* ── 1. Demanda insatisfecha — DESTACADA ───────────────────────────────── */}
      {report.unmetDemand.length > 0 && (
        <DemandaInsatisfechaSection items={report.unmetDemand} period={report.period.label} />
      )}

      {/* ── 2 + 3. Demanda en alza / a la baja — grid ──────────────────────── */}
      <DemandaCategoriasSection
        rising={report.risingCategories}
        falling={report.fallingCategories}
        period={report.period.label}
      />

      {/* ── 4. Quiebres más extendidos ─────────────────────────────────────── */}
      {report.stockoutHotspots.length > 0 && (
        <DemandaQuiebresSection hotspots={report.stockoutHotspots} period={report.period.label} />
      )}

      {/* ── 5. Por zona ───────────────────────────────────────────────────── */}
      {report.byZone.length > 0 && (
        <DemandaZonasSection zones={report.byZone} period={report.period.label} />
      )}

      {/* ── 6. Madera de los aserraderos ──────────────────────────────────── */}
      {report.madera && report.madera.species.length > 0 && (
        <DemandaMaderaSection madera={report.madera} />
      )}
    </AdminTabShell>
  );
}
