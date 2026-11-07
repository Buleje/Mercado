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
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import ChartsEmptyState from "@/components/admin/shared/ChartsEmptyState";
import { formatCurrency, formatNumber } from "@/lib/format";
import { mesLeido } from "@/components/admin/fiados/fechas";
import { comparativoDeCobro } from "@/components/admin/fiados/tendencia-cobro";

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
export type TendenciaCobroProps = {
  /** Mes abierto («YYYY-MM»): sus cobros y fiados salen en la lista de al lado. null = el último. */
  mesElegido?: string | null;
  onElegirMes?: (mes: string | null) => void;
};

export default function FiadoTendenciaCobroChart({ mesElegido = null, onElegirMes }: TendenciaCobroProps) {
  const [chartData, setChartData] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    setError(false);
    fetch("/api/analytics/fiado-analytics")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
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
              // Céntimos del servidor: las tres cifras del mes se leen exactas (antes se redondeaba a soles).
              cobrados,
              nuevos,
              neto: Math.round((cobrados - nuevos) * 100) / 100,
            };
          }));
        }
      })
      .catch((err) => { setError(true); console.warn("[FiadoTendenciaCobroChart] fetch failed:", err); })
      .finally(() => setLoading(false));
  }, [intento]);

  // M38: las tres cifras y el comparativo son del mes abierto (o del último), con su nombre.
  const mesVisto = mesElegido && chartData.some((r) => r.mes === mesElegido) ? mesElegido : chartData[chartData.length - 1]?.mes ?? null;
  const fila = chartData.find((r) => r.mes === mesVisto) ?? null;
  const comparativo = useMemo(() => (mesVisto ? comparativoDeCobro(chartData, mesVisto) : null), [chartData, mesVisto]);

  if (loading) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 animate-pulse">
        <div className="h-6 w-40 bg-[var(--surface-sunken)] rounded mb-3" />
        <div className="h-[220px] bg-[var(--surface-sunken)] rounded-lg" />
      </div>
    );
  }

  if (error && chartData.length === 0) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-sm text-[var(--data-error-ink)]">
        No se pudo cargar la tendencia de cobro.
        <button type="button" onClick={() => { setLoading(true); setIntento((n) => n + 1); }} className="ml-auto h-12 rounded-xl px-4 font-bold hover:bg-[var(--surface-sunken)]">Reintentar</button>
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

  /* Recharts pasa la fila en `payload`: tocar el mes abierto lo cierra. */
  const elegirDeBarra = (d: unknown) => {
    const mes = (d as { payload?: ChartRow } | undefined)?.payload?.mes;
    if (onElegirMes && mes) onElegirMes(mes === mesElegido ? null : mes);
  };

  // Max para el eje Y (positivos solo). Padding de 10% para que las barras no toquen el top.
  const maxValue = Math.max(...chartData.map(r => Math.max(r.cobrados, r.nuevos)));
  const yMax = Math.ceil(maxValue * 1.15 / 50) * 50 || 100;

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      {/* Título + ⓘ y el mes que se lee; debajo, sus tres cifras con el comparativo (M38). */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Tendencia de cobro</CardTitle>
        <InfoTip
          what="Los últimos 6 meses: cuánto cobraste de fiados (verde) contra cuánto fiaste (gris). La línea es el neto: abajo de cero, fiaste más de lo que cobraste."
          affects="Toca una barra o elige el mes para ver al lado los cobros y los fiados de ese mes."
          example={fila ? `${mesLeido(fila.mes)}: cobraste ${fmt(fila.cobrados)} − fiaste ${fmt(fila.nuevos)} = neto ${fmt(fila.neto)}.` : undefined}
        />
        {onElegirMes && (
          <select
            aria-label="Mes que se lee"
            data-qa="cobro-mes"
            value={mesElegido ?? ""}
            onChange={(e) => onElegirMes(e.target.value || null)}
            className="ml-auto h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]"
          >
            <option value="">Todos los meses</option>
            {[...chartData].reverse().map((r) => <option key={r.mes} value={r.mes}>{mesLeido(r.mes)}</option>)}
          </select>
        )}
      </div>
      {fila && (
        <div className="mb-3 grid grid-cols-3 gap-2" aria-label={`Cifras de ${mesLeido(fila.mes)}`}>
          {[
            { rotulo: "Cobrado", valor: fila.cobrados, clase: "text-[var(--data-success-ink)]" },
            { rotulo: "Fiado nuevo", valor: fila.nuevos, clase: "text-[var(--text-primary)]" },
            { rotulo: "Neto", valor: fila.neto, clase: fila.neto >= 0 ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]" },
          ].map((c) => (
            <div key={c.rotulo} className="min-w-0 rounded-xl bg-[var(--surface-sunken)] px-3 py-2">
              <p className="truncate text-sm text-[var(--text-secondary)]">{c.rotulo}</p>
              <p className={cn("truncate text-base font-bold tabular-nums", c.clase)}>{c.rotulo === "Neto" && c.valor > 0 ? "+" : ""}{formatCurrency(c.valor)}</p>
            </div>
          ))}
          <p className="col-span-3 flex flex-wrap items-center gap-x-2 text-sm text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{mesLeido(fila.mes)}</span>
            {comparativo?.tipo === "pct" && (
              <span className={cn("inline-flex items-center gap-1 font-bold", comparativo.diferencia >= 0 ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]")}>
                {comparativo.diferencia >= 0 ? <TrendingUp className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : <TrendingDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
                {comparativo.pct >= 0 ? "+" : ""}{comparativo.pct.toFixed(0)} % cobrado vs {mesLeido(comparativo.mesAnterior).split(" ")[0]}
              </span>
            )}
            {comparativo?.tipo === "sin-base" && <span>· {mesLeido(comparativo.mesAnterior).split(" ")[0]} sin cobros: no hay con qué comparar</span>}
          </p>
        </div>
      )}

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
          <Bar dataKey="cobrados" fill="var(--data-success-500)" radius={[6, 6, 0, 0]} barSize={28} cursor={onElegirMes ? "pointer" : undefined} onClick={(d) => elegirDeBarra(d)}>
            {chartData.map((r) => <Cell key={r.mes} fillOpacity={mesElegido && r.mes !== mesElegido ? 0.35 : 1} />)}
          </Bar>
          <Bar dataKey="nuevos" fill="var(--text-tertiary)" radius={[6, 6, 0, 0]} barSize={28} cursor={onElegirMes ? "pointer" : undefined} onClick={(d) => elegirDeBarra(d)}>
            {chartData.map((r) => <Cell key={r.mes} fillOpacity={mesElegido && r.mes !== mesElegido ? 0.2 : 0.5} />)}
          </Bar>
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
