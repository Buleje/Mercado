"use client";

/**
 * TenantGrowthChart — multi-line chart con el crecimiento por tenant.
 *
 * Cada tenant es una línea de color distinto. El chart se alimenta del
 * endpoint /api/superadmin/dashboard/tenant-growth.
 *
 * Soporta:
 *   - Toggle de métrica: "Pedidos" | "Ingresos"
 *   - Filtro de rango: 7d / 30d / 90d / 1y (controlado por el parent via prop)
 *   - Hover: tooltip con todos los tenants en ese día
 *   - Leyenda interactiva: click en un tenant para hide/show su línea
 */

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { TrendingUp, ShoppingBag, Banknote, Loader2 } from "@buleje/design-system/icons";

interface TenantSeries {
  tenantId: string;
  tenantName: string;
  slug: string;
  plan: string;
  color: string;
  points: Array<{ date: string; value: number }>;
  total: number;
}

interface GrowthData {
  range: string;
  metric: "orders" | "revenue";
  dates: string[];
  series: TenantSeries[];
}

interface Props {
  range: "7d" | "30d" | "90d" | "1y";
}

const fmtSoles = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(n);

export function TenantGrowthChart({ range }: Props) {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<"orders" | "revenue">("orders");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/superadmin/dashboard/tenant-growth?range=${range}&metric=${metric}&top=8`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: GrowthData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar el crecimiento");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, metric]);

  // Reshape: [{ date, [tenantSlug]: value, ... }]
  const chartData = useMemo(() => {
    if (!data || data.dates.length === 0) return [];
    return data.dates.map((date) => {
      const row: Record<string, number | string> = { date: date.slice(5) }; // MM-DD
      for (const s of data.series) {
        const pt = s.points.find((p) => p.date === date);
        row[s.slug] = pt?.value ?? 0;
      }
      return row;
    });
  }, [data]);

  const visibleSeries = useMemo(
    () => (data?.series ?? []).filter((s) => !hidden.has(s.slug)),
    [data, hidden],
  );

  const toggleHidden = (slug: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Crecimiento por tienda
          </p>
          <h3 className="text-lg sm:text-xl font-extrabold text-[var(--text-primary)] flex items-center gap-2 mt-0.5">
            <TrendingUp className="h-5 w-5 text-[var(--accent)]" />
            {metric === "orders" ? "Pedidos por día" : "Ingresos por día"}
          </h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            Top 8 tiendas con mayor actividad en los últimos {range === "7d" ? "7 días" : range === "30d" ? "30 días" : range === "90d" ? "90 días" : "365 días"}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-[var(--rule-base)] p-0.5">
          <button
            type="button"
            onClick={() => setMetric("orders")}
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
              metric === "orders"
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
            ].join(" ")}
          >
            <ShoppingBag className="h-3.5 w-3.5" /> Pedidos
          </button>
          <button
            type="button"
            onClick={() => setMetric("revenue")}
            className={[
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
              metric === "revenue"
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
            ].join(" ")}
          >
            <Banknote className="h-3.5 w-3.5" /> Ingresos
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando crecimiento…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-[var(--data-error)]">
          {error}
        </div>
      )}

      {!loading && !error && data && data.series.length === 0 && (
        <div className="py-12 text-center text-sm text-[var(--text-tertiary)]">
          Sin actividad de tiendas en el rango seleccionado.
        </div>
      )}

      {!loading && !error && data && data.series.length > 0 && (
        <>
          <div className="h-[320px] sm:h-[360px]">
            <ResponsiveContainer minWidth={0} width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="var(--text-tertiary)"
                  tick={{ fontSize: 11 }}
                  tickMargin={8}
                />
                <YAxis
                  stroke="var(--text-tertiary)"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    metric === "revenue"
                      ? fmtSoles(v).replace("PEN", "S/")
                      : v.toString()
                  }
                  width={50}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--surface-raised)",
                    border: "1px solid var(--rule-base)",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => {
                    const v = typeof value === "number" ? value : Number(value ?? 0);
                    const n = String(name ?? "");
                    const s = data.series.find((x) => x.slug === n);
                    return [
                      metric === "revenue" ? fmtSoles(v) : v.toString(),
                      s?.tenantName ?? n,
                    ];
                  }}
                  labelFormatter={(label) => `Día ${String(label ?? "")}`}
                />
                {visibleSeries.map((s) => (
                  <Line
                    key={s.tenantId}
                    type="monotone"
                    dataKey={s.slug}
                    stroke={s.color}
                    strokeWidth={2.5}
                    dot={{ r: 2.5, strokeWidth: 0, fill: s.color }}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "white" }}
                    name={s.slug}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Custom interactive legend */}
          <div className="mt-4 flex flex-wrap gap-2">
            {data.series.map((s) => {
              const isHidden = hidden.has(s.slug);
              return (
                <button
                  key={s.tenantId}
                  type="button"
                  onClick={() => toggleHidden(s.slug)}
                  className={[
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                    isHidden
                      ? "border-[var(--rule-soft)] text-[var(--text-tertiary)] line-through"
                      : "border-[var(--rule-base)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
                  ].join(" ")}
                  aria-pressed={!isHidden}
                  title={isHidden ? "Mostrar" : "Ocultar"}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: isHidden ? "var(--rule-base)" : s.color }}
                    aria-hidden
                  />
                  <span className="truncate max-w-[140px]">{s.tenantName}</span>
                  <span className="text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">
                    {metric === "revenue" ? fmtSoles(s.total) : s.total}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
