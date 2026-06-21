"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Eye, MousePointer, TrendingUp, DollarSign, Loader2, BarChart2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import ChartsEmptyState from "@/components/admin/shared/ChartsEmptyState";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsDay {
  date: string;
  views: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

interface AnalyticsData {
  totalViews: number;
  totalClicks: number;
  conversionRate: number;
  revenue: number;
  days: AnalyticsDay[];
  topProducts: { id: number; name: string; views: number; revenue: number }[];
}

interface ProductAnalyticsPanelProps {
  productId: number;
  productName: string;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-[var(--surface-raised)] rounded-xl p-4 border border-[var(--rule-base)] flex items-center gap-4">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
        <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
      </div>
    </div>
  );
}

// ── Range Selector ─────────────────────────────────────────────────────────────

const RANGES = [
  { label: "7 días", value: 7 },
  { label: "30 días", value: 30 },
  { label: "90 días", value: 90 },
];

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ProductAnalyticsPanel({ productId, productName }: ProductAnalyticsPanelProps) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/marketplace/products/${productId}/analytics?days=${days}`);
        if (!res.ok) throw new Error("fetch fail");
        const json = await res.json();
        setData(json?.data ?? json);
      } catch {
        // NO mock data (Brandon: nunca datos inventados). Sin datos → empty-state.
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [productId, days, productName]);

  if (loading) {
    return (
      <LoadingState />
    );
  }

  // Estado vacío — sin datos reales
  const isEmpty = !data || (data.totalViews === 0 && data.totalClicks === 0 && data.revenue === 0);

  return (
    <div className="space-y-6">
      {/* Header con selector de rango */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="font-semibold text-[var(--text-primary)]">{productName}</CardTitle>
          <p className="text-xs text-[var(--text-tertiary)]">Analytics del producto</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-[var(--rule-base)] p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setDays(r.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                days === r.value
                  ? "bg-[#00A0A0] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <ChartsEmptyState
          icon={BarChart2}
          title="Aún no hay datos de este producto"
          description="Los analytics empiezan a registrarse cuando alguien visita el producto. No te mostramos gráficos vacíos."
        />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Visitas totales"
              value={data!.totalViews.toLocaleString()}
              icon={Eye}
              color="bg-[#00A0A0]"
            />
            <KpiCard
              label="Clicks totales"
              value={data!.totalClicks.toLocaleString()}
              icon={MousePointer}
              color="bg-[var(--text-primary)]"
            />
            <KpiCard
              label="Tasa de conversión"
              value={`${data!.conversionRate}%`}
              icon={TrendingUp}
              color="bg-[#ff6b5b]"
            />
            <KpiCard
              label="Ingresos"
              value={`S/ ${data!.revenue.toLocaleString()}`}
              icon={DollarSign}
              color="bg-[var(--accent-soft)]"
            />
          </div>

          {/* Gráfico de líneas */}
          <div className="bg-[var(--surface-raised)] rounded-xl p-4 border border-[var(--rule-base)]">
            <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
              Tendencia — últimos {days} días
            </h4>
            <ResponsiveContainer minWidth={0} width="100%" height={240}>
              <LineChart data={data!.days} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  interval="preserveStartEnd"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line
                  type="monotone"
                  dataKey="views"
                  name="Visitas"
                  stroke="#00A0A0"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  name="Clicks"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="conversions"
                  name="Conversiones"
                  stroke="#ff6b5b"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Top productos */}
          {data!.topProducts.length > 0 && (
            <div className="bg-[var(--surface-raised)] rounded-xl p-4 border border-[var(--rule-base)]">
              <h4 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">Top productos</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-xs text-[var(--text-tertiary)] border-b border-[var(--rule-base)]">
                      <th className="pb-2 text-left">Producto</th>
                      <th className="pb-2 text-right">Visitas</th>
                      <th className="pb-2 text-right">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {data!.topProducts.map((tp) => (
                      <tr key={tp.id}>
                        <td className="py-2 text-[var(--text-primary)]">{tp.name}</td>
                        <td className="py-2 text-right text-[var(--text-secondary)]">{tp.views.toLocaleString()}</td>
                        <td className="py-2 text-right text-[var(--text-secondary)]">S/ {tp.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
