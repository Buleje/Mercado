"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  DollarSign, Receipt, Truck, Filter, RefreshCw, Download,
  TrendingDown, Calendar, AlertTriangle, Search,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/admin/shared/StatusBadge";

/**
 * HistorialGastosTab — vista unificada de gastos del negocio.
 *
 * Audit 2026-05-17 (feature compras): agrega gastos de TODOS los módulos:
 *  - Expense table (manual: alquiler, servicios, transporte)
 *  - PurchaseOrder finalizadas (compras a proveedores)
 *
 * KPIs arriba + tabla filtrable + agrupación por categoría.
 */

type HistorialItem = {
  id: string;
  source: "expense" | "purchase";
  fecha: string;
  category: string;
  description: string;
  amount: number;
  recurring: boolean;
  supplierName?: string;
};

type Kpis = {
  totalGastado: number;
  cantidadGastos: number;
  porCategoria: Record<string, number>;
  porSource: { expense: number; purchase: number };
};

type Period = "hoy" | "semana" | "mes" | "trimestre" | "todo";

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return iso;
  }
}

function periodToDates(period: Period): { from?: Date; to?: Date } {
  const now = new Date();
  switch (period) {
    case "hoy": {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from };
    }
    case "semana": {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      return { from };
    }
    case "mes": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from };
    }
    case "trimestre": {
      const from = new Date(now);
      from.setMonth(now.getMonth() - 3);
      return { from };
    }
    default:
      return {};
  }
}

const PERIOD_LABELS: Record<Period, string> = {
  hoy: "Hoy",
  semana: "7 días",
  mes: "Este mes",
  trimestre: "3 meses",
  todo: "Todo",
};

const SOURCE_META: Record<"expense" | "purchase", { label: string; icon: typeof Receipt; tone: string }> = {
  expense:  { label: "Gasto operativo", icon: Receipt, tone: "var(--data-warning-500)" },
  purchase: { label: "Compra proveedor", icon: Truck, tone: "var(--data-info-500)" },
};

export default function HistorialGastosTab() {
  const [items, setItems] = useState<HistorialItem[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("mes");
  const [sourceFilter, setSourceFilter] = useState<"all" | "expense" | "purchase">("all");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const fetchHistorial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = periodToDates(period);
      const params = new URLSearchParams();
      if (from) params.set("from", from.toISOString());
      if (to) params.set("to", to.toISOString());
      params.set("source", sourceFilter);

      const res = await fetch(`/api/expenses/historial?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setKpis(data.kpis ?? null);
    } catch (err) {
      console.warn("[HistorialGastosTab] fetch failed", err);
      setError("No se pudo cargar el historial. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [period, sourceFilter]);

  useEffect(() => { fetchHistorial(); }, [fetchHistorial]);

  // Filtros client-side: búsqueda + categoría
  const filtered = useMemo(() => {
    let list = items;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((i) =>
        (i.description?.toLowerCase().includes(q) ?? false) ||
        (i.category?.toLowerCase().includes(q) ?? false) ||
        (i.supplierName?.toLowerCase().includes(q) ?? false),
      );
    }
    if (categoryFilter) {
      list = list.filter((i) => i.category === categoryFilter);
    }
    return list;
  }, [items, search, categoryFilter]);

  const categories = useMemo(() => {
    if (!kpis) return [];
    return Object.entries(kpis.porCategoria)
      .map(([cat, total]) => ({ cat, total }))
      .sort((a, b) => b.total - a.total);
  }, [kpis]);

  const handleExport = () => {
    const rows = [
      ["Fecha", "Origen", "Categoría", "Descripción", "Proveedor", "Monto"].join(","),
      ...filtered.map((i) => [
        formatDate(i.fecha),
        i.source === "expense" ? "Gasto" : "Compra",
        i.category,
        `"${(i.description ?? "").replace(/"/g, '""')}"`,
        i.supplierName ?? "",
        i.amount.toFixed(2),
      ].join(",")),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historial-gastos-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-[var(--data-error-500)]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Total gastado</p>
          </div>
          <p className="text-2xl font-extrabold text-[var(--data-error-500)] tabular-nums">
            {kpis ? fmt(kpis.totalGastado) : "—"}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {kpis ? `${kpis.cantidadGastos} ${kpis.cantidadGastos === 1 ? "transacción" : "transacciones"}` : ""}
          </p>
        </div>

        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="h-4 w-4 text-[var(--data-warning-500)]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Gastos operativos</p>
          </div>
          <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
            {kpis ? fmt(kpis.porSource.expense) : "—"}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Alquiler, servicios, transporte</p>
        </div>

        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="h-4 w-4 text-[var(--data-info-500)]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Compras proveedor</p>
          </div>
          <p className="text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
            {kpis ? fmt(kpis.porSource.purchase) : "—"}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">Mercadería recibida</p>
        </div>

        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-4 w-4 text-[var(--text-primary)]" />
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Categoría top</p>
          </div>
          <p className="text-base font-bold text-[var(--text-primary)] truncate">
            {categories[0]?.cat ?? "—"}
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 tabular-nums">
            {categories[0] ? fmt(categories[0].total) : ""}
          </p>
        </div>
      </div>

      {/* Toolbar: período + filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Período */}
        <div className="flex items-center gap-1 bg-[var(--surface-sunken)] p-1 rounded-lg">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                period === p
                  ? "bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Source filter */}
        <div className="flex items-center gap-1 bg-[var(--surface-sunken)] p-1 rounded-lg">
          {([
            { v: "all" as const, l: "Todos" },
            { v: "expense" as const, l: "Operativos" },
            { v: "purchase" as const, l: "Proveedores" },
          ]).map((opt) => (
            <button
              key={opt.v}
              onClick={() => setSourceFilter(opt.v)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                sourceFilter === opt.v
                  ? "bg-white dark:bg-[var(--color-card)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {opt.l}
            </button>
          ))}
        </div>

        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descripción, categoría o proveedor"
            className="w-full h-10 pl-10 pr-3 text-sm rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] focus:border-primary/40 focus:ring-1 focus:ring-primary/30 outline-none"
          />
        </div>

        <div className="flex-1" />

        <button
          onClick={fetchHistorial}
          className="p-2 rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:bg-[var(--surface-sunken)] transition-colors"
          title="Recargar"
        >
          <RefreshCw className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>

        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Exportar
        </button>
      </div>

      {/* Distribución por categoría */}
      {categories.length > 0 && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
            Distribución por categoría
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.slice(0, 8).map(({ cat, total }) => {
              const isActive = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(isActive ? "" : cat)}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                    isActive
                      ? "bg-primary text-white border-primary"
                      : "border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] text-[var(--text-secondary)] hover:border-primary/40 hover:text-primary",
                  )}
                >
                  <span>{cat}</span>
                  <span className="font-bold tabular-nums">{fmt(total)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
            <span className="text-sm text-[var(--text-secondary)]">Cargando historial...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
            <p className="text-sm text-[var(--data-error-500)]">{error}</p>
            <button onClick={fetchHistorial} className="text-xs text-primary font-bold hover:underline mt-1">
              Reintentar
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <DollarSign className="h-8 w-8 text-[var(--text-tertiary)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Sin gastos en este período
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Cuando registres gastos o recibas compras, aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* ds-ignore-table — header sticky con sort indicators */}
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 bg-[var(--surface-sunken)] z-10">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Fecha</th>
                  <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Origen</th>
                  <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Categoría</th>
                  <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Descripción</th>
                  <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const meta = SOURCE_META[item.source];
                  const Icon = meta.icon;
                  return (
                    <tr key={item.id} className="border-t border-[var(--rule-soft)] hover:bg-[var(--surface-sunken)]/50 transition-colors">
                      <td className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap">{formatDate(item.fecha)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: meta.tone }}>
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge variant="neutral" label={item.category} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)] max-w-md truncate">
                        {item.description || "—"}
                        {item.supplierName && (
                          <span className="text-xs text-[var(--text-tertiary)] ml-1">· {item.supplierName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-[var(--text-primary)] whitespace-nowrap">
                        {fmt(item.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
