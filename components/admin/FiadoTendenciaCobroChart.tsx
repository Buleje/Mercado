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
import { TrendingUp, TrendingDown, Activity } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

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
  return `S/${n.toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
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
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
        <div className="h-6 w-40 bg-[var(--surface-sunken)] rounded mb-3" />
        <div className="h-[220px] bg-[var(--surface-sunken)] rounded-lg" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-6 flex flex-col items-center justify-center gap-2">
        <Activity className="h-8 w-8 text-[var(--text-tertiary)]" strokeWidth={1.5} />
        <p className="text-sm font-semibold text-[var(--text-secondary)]">Sin historial de cobros aún</p>
        <p className="text-xs text-[var(--text-tertiary)] text-center max-w-sm">
          Cuando empieces a registrar fiados y cobros, aquí verás la tendencia mes a mes.
        </p>
      </div>
    );
  }

  // Max para el eje Y (positivos solo). Padding de 10% para que las barras no toquen el top.
  const maxValue = Math.max(...chartData.map(r => Math.max(r.cobrados, r.nuevos)));
  const yMax = Math.ceil(maxValue * 1.15 / 50) * 50 || 100;

  return (
    <div className="bg-white dark:bg-[var(--color-card)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      {/* Header con KPI mes actual y delta */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Tendencia de cobro
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Últimos 6 meses · cuánto cobras vs cuánto prestas
          </p>
        </div>
        {header && (
          <div className="flex items-center gap-4 ml-auto">
            <div className="text-right">
              <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">{header.currLabel}</p>
              <p className="text-lg font-extrabold text-[var(--data-success-500)] tabular-nums leading-tight">
                {fmt(header.currCobrados)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">cobrado</p>
            </div>
            {header.hasPrev && (
              <div
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold",
                  header.deltaCobrado >= 0
                    ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]"
                    : "bg-[var(--data-error-50)] text-[var(--data-error-500)]",
                )}
              >
                {header.deltaCobrado >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" strokeWidth={2.5} />
                )}
                {header.deltaPct >= 0 ? "+" : ""}{header.deltaPct.toFixed(0)}%
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resumen barras simbólicas: cuánto verde (cobrado) vs gris (nuevo) este mes */}
      {header && (header.currCobrados > 0 || header.currNuevos > 0) && (
        <div className="mb-3 px-1">
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[var(--data-success-500)]" />
              <span className="text-[var(--text-secondary)]">Cobrado este mes</span>
              <span className="font-bold text-[var(--text-primary)] tabular-nums">{fmt(header.currCobrados)}</span>
            </span>
            <span className="text-[var(--text-tertiary)]">·</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[var(--text-tertiary)]/60" />
              <span className="text-[var(--text-secondary)]">Prestado este mes</span>
              <span className="font-bold text-[var(--text-primary)] tabular-nums">{fmt(header.currNuevos)}</span>
            </span>
          </div>
        </div>
      )}

      <ResponsiveContainer minWidth={0} width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-soft)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
            axisLine={{ stroke: "var(--rule-base)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
            axisLine={false}
            tickLine={false}
            domain={[0, yMax]}
            allowDataOverflow={false}
            tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
            width={48}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-sunken)", opacity: 0.5 }}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--rule-base)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ fontWeight: 700, color: "var(--text-primary)" }}
            formatter={(value: unknown, name: unknown) => {
              const v = Number(value);
              const n = String(name);
              const display = n === "cobrados" ? "Cobrado" : n === "nuevos" ? "Prestado" : "Neto";
              return [`S/${v.toLocaleString("es-PE")}`, display];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
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
