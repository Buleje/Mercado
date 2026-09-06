"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Package,
  MapPin,
  Activity,
  Loader2,
  RefreshCw,
} from "@buleje/design-system/icons";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { AdminTabShell } from "../_components/_shared";
import SuperadminChartCard from "@/components/superadmin/_shared/SuperadminChartCard";

// ── Tipos locales (no dependen del backend) ───────────────────────────────────

interface CategoryDemand {
  category: string;
  units: number;
  prevUnits: number;
  trendPct: number;
  rising: boolean;
}

interface ZoneDemand {
  zone: string;
  units: number;
  topCategory: string | null;
  stockouts: number;
}

interface StockoutSignal {
  name: string;
  category: string | null;
  tenantCount: number;
}

interface UnmetDemand {
  category: string;
  trendPct: number;
  stockoutCount: number;
}

interface DemandReport {
  generatedAt: string;
  period: { label: string; days: number };
  totalUnits: number;
  risingCategories: CategoryDemand[];
  fallingCategories: CategoryDemand[];
  unmetDemand: UnmetDemand[];
  byZone: ZoneDemand[];
  stockoutHotspots: StockoutSignal[];
}

// ── Helpers de formato ────────────────────────────────────────────────────────

function fmtUnits(n: number): string {
  return new Intl.NumberFormat("es-PE").format(n);
}

function fmtPct(n: number, sign = true): string {
  const prefix = sign && n > 0 ? "+" : "";
  return `${prefix}${n.toFixed(1)}%`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Bar visual (porcentaje relativo al máximo) ────────────────────────────────

function MiniBar({ value, max, tone }: { value: number; max: number; tone: "success" | "error" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const bg =
    tone === "success"
      ? "bg-[var(--data-success-500,#16a34a)]"
      : "bg-[var(--data-error-500,#dc2626)]";
  return (
    <div className="h-1.5 w-full rounded-full bg-[var(--surface-sunken)] overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${bg}`}
        style={{ width: `${pct}%` }}
        role="presentation"
      />
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function IntelligenceClient() {
  const [report, setReport] = useState<DemandReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchSuperadmin("/api/superadmin/intelligence/demand");
      if (!res.ok) {
        setError(`Error al cargar datos (HTTP ${res.status})`);
        return;
      }
      const data = (await res.json()) as DemandReport;
      setReport(data);
    } catch {
      setError("Error de red — revisá tu conexión e intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
        description="Detectá qué quiere el barrio antes de que lo pidan."
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
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
    report.stockoutHotspots.length === 0;

  if (isEmpty) {
    return (
      <AdminTabShell
        title="Inteligencia de Barrio"
        description="Detectá qué quiere el barrio antes de que lo pidan."
        icon={Activity}
        kicker="Plataforma · Inteligencia"
      >
        <div className="flex flex-col items-center justify-center py-32 gap-3 text-[var(--text-secondary)]">
          <Activity className="w-10 h-10 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-base font-medium text-[var(--text-primary)]">
            Todavía no hay datos de demanda
          </p>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm text-center">
            Cuando tus bodegas tengan ventas registradas, acá vas a ver qué productos sube, qué
            baja y dónde hay quiebres de stock.
          </p>
        </div>
      </AdminTabShell>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────

  const maxRisingUnits = Math.max(...report.risingCategories.map((c) => c.units), 1);
  const maxFallingUnits = Math.max(...report.fallingCategories.map((c) => c.units), 1);

  return (
    <AdminTabShell
      title="Inteligencia de Barrio"
      description="Demanda real de todas tus bodegas — detectá tendencias, quiebres y oportunidades."
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
        <SuperadminChartCard
          kicker="Oportunidad de negocio"
          title="Demanda insatisfecha"
          description="Estas categorías suben en ventas pero varias bodegas están quebrando stock. Son tu próxima oportunidad de abastecimiento."
          period={report.period.label}
          className="border-[var(--data-warning-500,#d97706)]/30 bg-[var(--data-warning-100,#fef3c7)]/10 dark:bg-[var(--surface-canvas)]"
        >
          <ul className="divide-y divide-[var(--rule-soft)]">
            {report.unmetDemand.map((item) => (
              <li
                key={item.category}
                className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {item.category}
                  </span>
                  <span className="ml-2 text-xs text-[var(--data-success-500,#16a34a)] font-semibold">
                    {fmtPct(item.trendPct)} en ventas
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--data-error-500,#dc2626)]/10 text-xs font-semibold text-[var(--data-error-500,#dc2626)]">
                    <AlertTriangle className="w-3 h-3" aria-hidden />
                    {item.stockoutCount}{" "}
                    {item.stockoutCount === 1 ? "bodega quebrando" : "bodegas quebrando"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </SuperadminChartCard>
      )}

      {/* ── 2 + 3. Demanda en alza / a la baja — grid ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alza */}
        <SuperadminChartCard
          kicker="Categorías"
          title="Demanda en alza"
          description="Categorías que más crecen en unidades vendidas."
          period={report.period.label}
        >
          {report.risingCategories.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] py-4 text-center">
              Sin categorías en alza para este período.
            </p>
          ) : (
            <ul className="space-y-3">
              {report.risingCategories.map((cat) => (
                <li key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <TrendingUp
                        className="w-4 h-4 shrink-0 text-[var(--data-success-500,#16a34a)]"
                        aria-hidden
                      />
                      <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {cat.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
                        {fmtUnits(cat.units)} uds
                      </span>
                      <span className="text-xs font-bold text-[var(--data-success-500,#16a34a)] tabular-nums">
                        {fmtPct(cat.trendPct)}
                      </span>
                    </div>
                  </div>
                  <MiniBar value={cat.units} max={maxRisingUnits} tone="success" />
                </li>
              ))}
            </ul>
          )}
        </SuperadminChartCard>

        {/* Baja */}
        <SuperadminChartCard
          kicker="Categorías"
          title="Demanda a la baja"
          description="Categorías con menos movimiento que el período anterior."
          period={report.period.label}
        >
          {report.fallingCategories.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] py-4 text-center">
              Sin categorías a la baja para este período.
            </p>
          ) : (
            <ul className="space-y-3">
              {report.fallingCategories.map((cat) => (
                <li key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <TrendingDown
                        className="w-4 h-4 shrink-0 text-[var(--data-error-500,#dc2626)]"
                        aria-hidden
                      />
                      <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {cat.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-[var(--text-tertiary)] tabular-nums">
                        {fmtUnits(cat.units)} uds
                      </span>
                      <span className="text-xs font-bold text-[var(--data-error-500,#dc2626)] tabular-nums">
                        {fmtPct(cat.trendPct)}
                      </span>
                    </div>
                  </div>
                  <MiniBar value={cat.units} max={maxFallingUnits} tone="error" />
                </li>
              ))}
            </ul>
          )}
        </SuperadminChartCard>
      </div>

      {/* ── 4. Quiebres más extendidos ─────────────────────────────────────── */}
      {report.stockoutHotspots.length > 0 && (
        <SuperadminChartCard
          kicker="Quiebres de stock"
          title="Quiebres más extendidos"
          description="Productos que más bodegas reportan sin stock — coordinar reposición urgente."
          period={report.period.label}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-base)] text-[var(--text-tertiary)] text-xs font-bold uppercase tracking-wider">
                  <th className="text-left px-0 py-2 w-full">Producto</th>
                  <th className="text-left px-4 py-2 whitespace-nowrap">Categoría</th>
                  <th className="text-right px-0 py-2 whitespace-nowrap">Bodegas sin stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {report.stockoutHotspots.map((s) => (
                  <tr
                    key={s.name}
                    className="hover:bg-[var(--surface-sunken)] transition-colors"
                  >
                    <td className="py-3 pr-4">
                      <span className="font-semibold text-[var(--text-primary)]">{s.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[var(--text-secondary)]">
                        {s.category ?? "—"}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--data-error-500,#dc2626)]/10 text-xs font-bold text-[var(--data-error-500,#dc2626)]">
                        <AlertTriangle className="w-3 h-3" aria-hidden />
                        {s.tenantCount} {s.tenantCount === 1 ? "bodega" : "bodegas"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SuperadminChartCard>
      )}

      {/* ── 5. Por zona ───────────────────────────────────────────────────── */}
      {report.byZone.length > 0 && (
        <SuperadminChartCard
          kicker="Geografía"
          title="Demanda por zona"
          description="Unidades vendidas, categoría más pedida y quiebres detectados por zona geográfica."
          period={report.period.label}
        >
          <ul className="divide-y divide-[var(--rule-soft)]">
            {report.byZone.map((z) => (
              <li
                key={z.zone}
                className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MapPin
                    className="w-4 h-4 shrink-0 text-[var(--text-tertiary)]"
                    aria-hidden
                  />
                  <span className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {z.zone}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-wrap shrink-0 text-sm">
                  <span className="text-[var(--text-secondary)] tabular-nums">
                    <span className="font-semibold text-[var(--text-primary)]">
                      {fmtUnits(z.units)}
                    </span>{" "}
                    uds
                  </span>
                  {z.topCategory && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-xs font-semibold text-[var(--text-secondary)]">
                      {z.topCategory}
                    </span>
                  )}
                  {z.stockouts > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--data-error-500,#dc2626)]/10 text-xs font-semibold text-[var(--data-error-500,#dc2626)]">
                      <AlertTriangle className="w-3 h-3" aria-hidden />
                      {z.stockouts} {z.stockouts === 1 ? "quiebre" : "quiebres"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SuperadminChartCard>
      )}
    </AdminTabShell>
  );
}
