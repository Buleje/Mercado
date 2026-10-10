"use client";

import { useState, useEffect, useMemo } from "react";
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
import { TrendingUp, TrendingDown } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import ChartsEmptyState from "@/components/admin/shared/ChartsEmptyState";
import { formatNumber } from "@/lib/format";

type ChartRow = {
  mes: string;    // ISO "2026-05" (raw)
  label: string;  // "May 2026" (display)
  cobrados: number;
  nuevos: number;
  neto: number;
};

const MES_ABREV = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function isoToLabel(iso: string): string {
  // "2026-05" → "May 2026"
  const [y, m] = iso.split("-");
  const idx = parseInt(m, 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx > 11) return iso;
  return `${MES_ABREV[idx]} ${y}`;
}

function fmt(n: number): string {
  return `S/${formatNumber(n, { max: 0 })}`;
}

/**
 * Tendencia de Cobro · últimos 6 meses.
 *
 * Audit 2026-05-17 (mejoras Análisis): redoseñado para ser legible por el
 * dueño no técnico.
 *  - Antes: eje Y con S/-700 (negativos sin sentido visual), línea "Neto"
 *    confusa, labels "2026-01" en lugar de "Ene 2026".
 *  - Ahora: barras claras Cobrado (verde) vs Prestado (gris), línea Neto
 *    sutil arriba, eje Y clampeado a positivos, tooltip rico, header con
 *    el mes actual y delta vs mes anterior.
 */
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
            const nuevos = m.nuevos ?? m.created ?? 0;
            const iso = m.mes ?? m.month ?? "";
            return {
              mes: iso,
              label: isoToLabel(iso),
              cobrados: Math.round(cobrados),
              nuevos: Math.round(nuevos),
              neto: Math.round(cobrados - nuevos),
            };
          }));
        }
      })
      .catch((err) => console.warn("[FiadoTendenciaCobroChart] fetch failed:", err))
      .finally(() => setLoading(false));
  }, []);

  // Header KPI: este mes vs anterior
  const header = useMemo(() => {
    if (chartData.length === 0) return null;
    const curr = chartData[chartData.length - 1];
    const prev = chartData.length >= 2 ? chartData[chartData.length - 2] : null;
    const deltaCobrado = prev ? curr.cobrados - prev.cobrados : 0;
    const deltaPct = prev && prev.cobrados > 0 ? (deltaCobrado / prev.cobrados) * 100 : 0;
    return {
      currLabel: curr.label,
      currCobrados: curr.cobrados,
      currNuevos: curr.nuevos,
      currNeto: curr.neto,
      deltaCobrado,
      deltaPct,
      hasPrev: !!prev,
    };
  }, [chartData]);

  if (loading) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
        <div className="h-6 w-40 bg-[var(--surface-sunken)] rounded mb-3" />
        <div className="h-[220px] bg-[var(--surface-sunken)] rounded-lg" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <ChartsEmptyState
        title="Sin historial de cobros aún"
        description="Cuando empieces a registrar fiados y cobros, acá vas a ver la tendencia mes a mes."
        className="rounded-xl"
      />
    );
  }

  // Max para el eje Y (positivos solo). Padding de 10% para que las barras no toquen el top.
  const maxValue = Math.max(...chartData.map(r => Math.max(r.cobrados, r.nuevos)));
  const yMax = Math.ceil(maxValue * 1.15 / 50) * 50 || 100;

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      {/* Título + ⓘ y, a la derecha, cómo va contra el mes pasado. La cifra del mes ya está en
          «Indicadores» de Me deben (10-10: salía tres veces en esta tarjeta y una en la franja). */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Tendencia de cobro</CardTitle>
        <InfoTip
          what="Los últimos 6 meses: cuánto cobraste de fiados (verde) contra cuánto fiaste (gris). La línea es la diferencia: abajo de cero, fiaste más de lo que cobraste."
          example={header ? `${header.currLabel}: cobraste ${fmt(header.currCobrados)} y fiaste ${fmt(header.currNuevos)}.` : undefined}
        />
        {header?.hasPrev && (
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-bold",
              header.deltaCobrado >= 0
                ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-ink)]"
                : "bg-[var(--data-error-500)]/12 text-[var(--data-error-ink)]",
            )}
            title="Lo cobrado este mes contra el mes pasado"
          >
            {header.deltaCobrado >= 0 ? <TrendingUp className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : <TrendingDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
            {header.deltaPct >= 0 ? "+" : ""}{Number(header.deltaPct).toFixed(0)} % vs mes pasado
          </span>
        )}
      </div>

      <ResponsiveContainer minWidth={0} width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 14, fill: "var(--text-secondary)" }}
            axisLine={{ stroke: "var(--rule-base)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 14, fill: "var(--text-secondary)" }}
            axisLine={false}
            tickLine={false}
            domain={[0, yMax]}
            allowDataOverflow={false}
            tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
            width={64}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-sunken)", opacity: 0.5 }}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--rule-base)",
              borderRadius: 8,
              fontSize: 14,
            }}
            labelStyle={{ fontWeight: 700, color: "var(--text-primary)" }}
            formatter={(value: unknown, name: unknown) => {
              const v = Number(value);
              const n = String(name);
              const display = n === "cobrados" ? "Cobrado" : n === "nuevos" ? "Prestado" : "Neto";
              return [`S/${formatNumber(v)}`, display];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 14 }}
            iconType="circle"
            formatter={(value: unknown) => {
              const v = String(value);
              return v === "cobrados" ? "Cobrado" : v === "nuevos" ? "Prestado" : "Neto";
            }}
          />
          <Bar dataKey="cobrados" fill="var(--data-success-500)" radius={[6, 6, 0, 0]} barSize={28} />
          <Bar dataKey="nuevos" fill="var(--text-tertiary)" fillOpacity={0.5} radius={[6, 6, 0, 0]} barSize={28} />
          <Line
            type="monotone"
            dataKey="neto"
            stroke="var(--accent)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "var(--accent)", strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
