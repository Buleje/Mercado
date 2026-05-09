"use client";

import { useState, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { StatusBadge } from "@buleje/design-system";

type ChartRow = {
  mes: string;
  cobrados: number;
  nuevos: number;
  neto: number;
};

export default function FiadoTendenciaCobroChart() {
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/fiado-analytics")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tendencia12m && Array.isArray(data.tendencia12m)) {
          const last6 = data.tendencia12m.slice(-6);
          setChartData(last6.map((m: {
            mes?: string; month?: string;
            cobrados?: number; collected?: number;
            nuevos?: number; created?: number;
          }) => {
            const cobrados = m.cobrados ?? m.collected ?? 0;
            const nuevos   = m.nuevos   ?? m.created   ?? 0;
            return {
              mes:      m.mes ?? m.month ?? "",
              cobrados: Math.round(cobrados),
              nuevos:   Math.round(nuevos),
              neto:     Math.round(cobrados - nuevos),
            };
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
        <div className="h-[200px] bg-[var(--color-muted)] rounded-xl" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4">
        <p className="text-xs text-[var(--text-tertiary)] text-center py-4">Sin datos de fiados para mostrar grafica</p>
      </div>
    );
  }

  const lastNeto = chartData[chartData.length - 1]?.neto ?? 0;

  return (
    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-[var(--text-secondary)]">Tendencia de Cobro</p>
        <StatusBadge
          variant={lastNeto >= 0 ? "success" : "error"}
          label={lastNeto >= 0 ? "Recuperando más de lo que prestas" : "Prestando mas de lo que cobras"}
        />
      </div>
      <ResponsiveContainer minWidth={0} width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `S/${v}`} />
          <Tooltip
            formatter={(value: unknown, name: unknown) => {
              const v = Number(value);
              const n = String(name);
              return [`S/${v.toLocaleString("es-PE")}`, n === "cobrados" ? "Cobrados" : n === "nuevos" ? "Nuevos" : "Neto"];
            }}
          />
          <Legend
            formatter={(value: unknown) => {
              const v = String(value);
              return v === "cobrados" ? "Cobrados" : v === "nuevos" ? "Nuevos" : "Neto";
            }}
          />
          <Bar dataKey="cobrados" fill="var(--data-success)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="nuevos" fill="var(--text-tertiary)" radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey="neto" stroke="var(--data-success)" strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
