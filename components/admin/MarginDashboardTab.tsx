"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useMemo } from "react";
import {
  Loader2, DollarSign, TrendingUp, BarChart3,
  AlertCircle, AlertTriangle, ChevronUp, ChevronDown,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { MarginResponse } from "@/app/api/analytics/margins/route";

const fmt = (n: number) => `S/${n.toFixed(2)}`;
const pctColor = (n: number) =>
  n >= 30 ? "text-[var(--data-success-500)]" : n >= 15 ? "text-[var(--data-warning-600)]" : "text-[var(--data-error-500)]";

function MarginBar({ value }: { value: number }) {
  const pctClamped = Math.max(0, Math.min(100, value));
  const color = value >= 30 ? "bg-[var(--accent-soft)]" : value >= 15 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]";
  return (
    <div className="w-full bg-gray-100 dark:bg-surface rounded-full h-1.5">
      <div className={cn("h-1.5 rounded-full transition-all", color)} style={{ width: `${pctClamped}%` }} />
    </div>
  );
}

export default function MarginDashboardTab() {
  const [data, setData] = useState<MarginResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"products" | "categories" | "top">("products");
  const [search, setSearch] = useState("");
  const [threshold, setThreshold] = useState(20); // alerta de margen bajo
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetch("/api/analytics/margins")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MarginResponse | null) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.products.filter(
      (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase())
    );
    list = [...list].sort((a, b) =>
      sortDir === "desc" ? b.marginPct - a.marginPct : a.marginPct - b.marginPct
    );
    return list;
  }, [data, search, sortDir]);

  const top10Best = useMemo(() => {
    if (!data) return [];
    return [...data.products].sort((a, b) => b.marginPct - a.marginPct).slice(0, 10);
  }, [data]);

  const top10Worst = useMemo(() => {
    if (!data) return [];
    return [...data.products]
      .filter((p) => p.revenue > 0)
      .sort((a, b) => a.marginPct - b.marginPct)
      .slice(0, 10);
  }, [data]);

  const belowThreshold = useMemo(() => {
    if (!data) return [];
    return data.products.filter((p) => p.revenue > 0 && p.marginPct < threshold);
  }, [data, threshold]);

  if (loading) return (
    <LoadingState />
  );
  if (!data) return (
    <div className="text-center py-20 text-[var(--text-tertiary)] dark:text-muted">Error cargando datos de márgenes</div>
  );

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div>
        <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Dashboard de Márgenes
        </SectionTitle>
        <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Rentabilidad bruta por producto y categoría</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center mb-3">
            <DollarSign className="h-4 w-4 text-white" />
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground">
            {fmt(data.summary.totalRevenue)}
          </p>
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mt-0.5">Ingresos totales</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center mb-3">
            <TrendingUp className="h-4 w-4 text-white" />
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground">
            {fmt(data.summary.totalGrossProfit)}
          </p>
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mt-0.5">Ganancia bruta</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
          <div className="w-9 h-9 rounded-xl bg-[var(--text-primary)] flex items-center justify-center mb-3">
            <BarChart3 className="h-4 w-4 text-white" />
          </div>
          <p className={cn("text-xl sm:text-2xl font-extrabold", pctColor(data.summary.overallMarginPct))}>
            {data.summary.overallMarginPct.toFixed(1)}%
          </p>
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mt-0.5">Margen global</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
          <div className="w-9 h-9 rounded-xl bg-[var(--data-warning-500)] flex items-center justify-center mb-3">
            <AlertCircle className="h-4 w-4 text-white" />
          </div>
          <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground">
            {data.summary.productsWithoutCost}
          </p>
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mt-0.5">Sin costo registrado</p>
        </div>
      </div>

      {/* Alerta de umbral */}
      <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
        <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)] shrink-0" />
        <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground">
          Umbral de alerta de margen:
        </p>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-32 accent-amber-500"
          />
          <span className="text-sm font-bold text-[var(--data-warning-500)] w-10">{threshold}%</span>
        </div>
        {belowThreshold.length > 0 ? (
          <span className="ml-auto text-sm font-bold text-[var(--data-error-500)]">
            {belowThreshold.length} producto{belowThreshold.length !== 1 ? "s" : ""} bajo umbral
          </span>
        ) : (
          <span className="ml-auto text-sm font-bold text-[var(--data-success-500)]">Todos sobre el umbral</span>
        )}
      </div>

      {/* View toggle */}
      <div className="flex flex-wrap gap-2">
        {(["products", "categories", "top"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-semibold transition-colors",
              view === v
                ? "bg-primary text-white"
                : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200 dark:hover:bg-card"
            )}
          >
            {v === "products" ? "Por producto" : v === "categories" ? "Por categoría" : "Top 10"}
          </button>
        ))}
        {view === "products" && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-sm text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface"
            >
              {sortDir === "desc" ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              Margen {sortDir === "desc" ? "mayor" : "menor"} primero
            </button>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="px-4 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm w-48"
            />
          </div>
        )}
      </div>

      {/* Vista: productos */}
      {view === "products" && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden ">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-[var(--rule-soft)] dark:border-card-border text-left">
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Producto</th>
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase hidden sm:table-cell">Categoría</th>
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase text-right">Ingresos</th>
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase text-right hidden md:table-cell">Costo</th>
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase text-right hidden md:table-cell">Ganancia</th>
                  <th className="px-4 py-3 text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase text-right">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-card-border">
                {filtered.map((p) => (
                  <tr
                    key={p.productId}
                    className={cn(
                      "hover:bg-gray-50 dark:hover:bg-surface transition-colors",
                      p.marginPct < threshold && p.revenue > 0 && "bg-[var(--data-error-50)]/40 dark:bg-red-950/10"
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-[var(--text-primary)] dark:text-foreground">{p.name}</p>
                      <div className="mt-1 w-24"><MarginBar value={p.marginPct} /></div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)] dark:text-muted hidden sm:table-cell">{p.category}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-primary)] dark:text-foreground">{fmt(p.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-secondary)] dark:text-muted hidden md:table-cell">
                      {p.cost > 0 ? fmt(p.cost) : <span className="text-[var(--data-warning-500)]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-primary)] dark:text-foreground hidden md:table-cell">{fmt(p.grossProfit)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn("font-bold", pctColor(p.marginPct))}>{p.marginPct.toFixed(1)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="h-20 flex items-center justify-center text-[var(--text-tertiary)] dark:text-muted text-sm">
              No se encontraron productos
            </div>
          )}
        </div>
      )}

      {/* Vista: categorías */}
      {view === "categories" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.byCategory.map((cat) => (
            <div key={cat.category} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="font-semibold text-[var(--text-primary)] dark:text-foreground">{cat.category}</CardTitle>
                <span className={cn("font-bold text-sm", pctColor(cat.marginPct))}>
                  {cat.marginPct.toFixed(1)}%
                </span>
              </div>
              <MarginBar value={cat.marginPct} />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(cat.revenue)}</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Ingresos</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(cat.cost)}</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Costo</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--data-success-500)]">{fmt(cat.grossProfit)}</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Ganancia</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vista: top 10 mejores y peores */}
      {view === "top" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top 10 mejores */}
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden ">
            <div className="px-4 py-3 border-b border-[var(--rule-soft)] dark:border-card-border bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]">
              <CardTitle className="text-sm font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] flex items-center gap-2">
                <ChevronUp className="h-4 w-4" /> Top 10 mayor margen
              </CardTitle>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-card-border">
              {top10Best.map((p, i) => (
                <div key={p.productId} className="px-4 py-3 flex items-center gap-3">
                  <span className="text-xs font-extrabold text-[var(--text-tertiary)] dark:text-muted w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground truncate">{p.name}</p>
                    <MarginBar value={p.marginPct} />
                  </div>
                  <span className={cn("text-sm font-bold shrink-0", pctColor(p.marginPct))}>
                    {p.marginPct.toFixed(1)}%
                  </span>
                </div>
              ))}
              {top10Best.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)] dark:text-muted">Sin datos</p>
              )}
            </div>
          </div>

          {/* Top 10 peores */}
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden ">
            <div className="px-4 py-3 border-b border-[var(--rule-soft)] dark:border-card-border bg-[var(--data-error-50)] dark:bg-red-950/20">
              <CardTitle className="text-sm font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] flex items-center gap-2">
                <ChevronDown className="h-4 w-4" /> Top 10 menor margen
              </CardTitle>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-card-border">
              {top10Worst.map((p, i) => (
                <div key={p.productId} className="px-4 py-3 flex items-center gap-3">
                  <span className="text-xs font-extrabold text-[var(--text-tertiary)] dark:text-muted w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground truncate">{p.name}</p>
                    <MarginBar value={p.marginPct} />
                  </div>
                  <span className={cn("text-sm font-bold shrink-0", pctColor(p.marginPct))}>
                    {p.marginPct.toFixed(1)}%
                  </span>
                </div>
              ))}
              {top10Worst.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)] dark:text-muted">Sin datos</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Productos bajo umbral — sección de alerta */}
      {belowThreshold.length > 0 && view !== "top" && (
        <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/40 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-[var(--data-error-500)] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
                {belowThreshold.length} producto{belowThreshold.length !== 1 ? "s" : ""} con margen menor a {threshold}%
              </p>
              <p className="text-xs text-[var(--data-error-500)]/80">Revisa precios de venta o negocia mejor con proveedores</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {belowThreshold.slice(0, 8).map((p) => (
              <span
                key={p.productId}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white dark:bg-card border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold"
              >
                {p.name}
                <span className="font-extrabold">{p.marginPct.toFixed(0)}%</span>
              </span>
            ))}
            {belowThreshold.length > 8 && (
              <span className="text-xs text-[var(--data-error-500)] self-center">+{belowThreshold.length - 8} más</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
