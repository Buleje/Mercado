"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import { BarChart3, Download, TrendingUp, Package } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

/* ── Types ── */
type ParetoProduct = {
  id: number; name: string; category: string; revenue: number; units: number; margin: number;
};

/* ── Seed Data ── */
const PRODUCTS: ParetoProduct[] = [];

const fmt = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

export default function ParetoAnalysisTab() {
  const [metric, setMetric] = useState<"revenue" | "units" | "margin">("revenue");

  const sorted = useMemo(() => {
    const val = (p: ParetoProduct) => metric === "revenue" ? p.revenue : metric === "units" ? p.units : (p.revenue * p.margin) / 100;
    const s = [...PRODUCTS].sort((a, b) => val(b) - val(a));
    const total = s.reduce((sum, p) => sum + val(p), 0);
    // Pre-compute cumulative sums without mutation inside map
    const cumulatives: number[] = [];
    s.reduce((acc, p) => { const next = acc + val(p); cumulatives.push(next); return next; }, 0);
    return s.map((p, i) => {
      const cum = cumulatives[i];
      const prevCum = i > 0 ? cumulatives[i - 1] : 0;
      return { ...p, value: val(p), pct: (val(p) / total) * 100, cumPct: (cum / total) * 100, isTop: (cum / total) * 100 <= 80 || prevCum < total * 0.8 };
    });
  }, [metric]);

  const totalValue = sorted.reduce((s, p) => s + p.value, 0);
  const topCount = sorted.filter(p => p.isTop).length;
  const topPct = ((topCount / sorted.length) * 100).toFixed(0);
  const topRevPct = sorted.filter(p => p.isTop).reduce((s, p) => s + p.pct, 0).toFixed(1);
  const maxValue = sorted[0]?.value ?? 1;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <BarChart3 className="h-6 w-6 text-[var(--text-secondary)]" /> Análisis Pareto (80/20)
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-1">Identifica el 20% de productos que generan el 80% de resultados</p>
        </div>
        <button onClick={() => exportToCSV(sorted.map(p => ({ Producto: p.name, Categoría: p.category, Valor: p.value, Porcentaje: `${Number(p.pct).toFixed(1)}%`, Acumulado: `${Number(p.cumPct).toFixed(1)}%`, Top80: p.isTop ? "Sí" : "No" })), "pareto")} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Productos Top</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-1">{topCount} de {sorted.length}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{topPct}% del catálogo</p>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Generan</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-1">{topRevPct}%</p>
          <p className="text-xs text-[var(--text-tertiary)]">del total</p>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Total {metric === "revenue" ? "Ingresos" : metric === "units" ? "Unidades" : "Margen"}</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mt-1">{metric === "units" ? totalValue.toLocaleString("es-PE") : fmt(totalValue)}</p>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted uppercase">Resto ({sorted.length - topCount})</p>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-tertiary)] dark:text-muted mt-1">{(100 - parseFloat(topRevPct)).toFixed(1)}%</p>
          <p className="text-xs text-[var(--text-tertiary)]">del total</p>
        </div>
      </div>

      {/* Metric selector */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "revenue" as const, label: "Ingresos", icon: TrendingUp },
          { key: "units" as const, label: "Unidades", icon: Package },
          { key: "margin" as const, label: "Margen Bruto", icon: BarChart3 },
        ].map(m => (
          <button key={m.key} onClick={() => setMetric(m.key)} className={cn("flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg text-sm font-bold transition-colors", metric === m.key ? "bg-[var(--text-primary)] text-white" : "bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-alt)] dark:hover:bg-accent")}>
            <m.icon className="h-4 w-4" /> {m.label}
          </button>
        ))}
      </div>

      {/* Pareto Chart */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-6">
        <CardTitle className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4">Gráfico Pareto</CardTitle>
        <div className="space-y-2">
          {sorted.map((p, i) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3">
              <span className="w-5 text-xs font-bold text-[var(--text-tertiary)] text-right">{i + 1}</span>
              <span className="w-40 text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{p.name}</span>
              <div className="flex-1 flex flex-wrap items-center gap-2">
                <div className="flex-1 h-6 bg-[var(--surface-sunken)] dark:bg-surface rounded-full overflow-hidden relative">
                  <div className={cn("h-full rounded-full transition-all", p.isTop ? "bg-[var(--text-primary)]" : "bg-[var(--rule-base)] dark:bg-gray-600")} style={{ width: `${(p.value / maxValue) * 100}%` }} />
                </div>
                <span className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted w-14 text-right">{Number(p.pct).toFixed(1)}%</span>
              </div>
              {/* Cumulative line marker */}
              <div className="w-20 flex items-center gap-1">
                <div className="flex-1 h-1.5 bg-[var(--surface-sunken)] dark:bg-surface rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", p.cumPct <= 80 ? "bg-[var(--accent-soft)]" : "bg-[var(--data-warning-500)]")} style={{ width: `${p.cumPct}%` }} />
                </div>
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] w-10 text-right">{Number(p.cumPct).toFixed(0)}%</span>
              </div>
              <span className={cn("text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-full", p.isTop ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]")}>{p.isTop ? "TOP" : "—"}</span>
            </div>
          ))}
        </div>
        {/* 80% line reference */}
        <div className="mt-4 pt-3 border-t border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] flex flex-wrap items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[var(--accent-soft)]" />
          <span className="text-xs text-[var(--text-secondary)] dark:text-muted">Línea 80% — Los productos marcados TOP representan ~80% del valor total</span>
        </div>
      </div>

      {/* Insight */}
      <div className="bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-base)] p-3 sm:p-5">
        <CardTitle className="font-extrabold text-[var(--text-secondary)] dark:text-[var(--text-primary)] text-sm">Insight Pareto</CardTitle>
        <p className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-primary)] mt-2">
          <strong>{topCount} productos ({topPct}% del catálogo)</strong> generan <strong>{topRevPct}%</strong> del {metric === "revenue" ? "ingreso" : metric === "units" ? "volumen" : "margen"}.
          Enfoca promociones, stock y negociación con proveedores en estos productos para máximo impacto.
          Los {sorted.length - topCount} productos restantes podrían revisarse para optimizar espacio en tienda.
        </p>
      </div>
    </div>
  );
}
