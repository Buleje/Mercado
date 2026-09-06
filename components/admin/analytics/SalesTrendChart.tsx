"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useReportChartEmpty } from "@/components/admin/shared/ChartManager";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { RefreshCw } from "@buleje/design-system/icons";

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = "7d" | "30d" | "90d";

// Shape from /api/analytics/ventas-tendencia
interface VentaDia {
  fecha: string;
  total: number;
  movingAvg7d: number;
  isQuincena: boolean;
  isFeriado: boolean;
  feriadoNombre?: string;
}

// Fallback shape from /api/analytics/rentabilidad
interface RentabilidadDia {
  fecha: string;
  ingresos: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, fmt: "dd/MM" | "full"): string {
  const d = new Date(dateStr + "T00:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  if (fmt === "dd/MM") return `${dd}/${mm}`;
  const dias = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  return `${dias[d.getDay()]} ${dd}/${mm}`;
}

function isQuincenaLocal(dateStr: string): boolean {
  const day = new Date(dateStr + "T00:00:00").getDate();
  return day === 15 || day === 1;
}

function computeMovingAvgLocal(data: { fecha: string; total: number }[]): VentaDia[] {
  return data.map((d, i) => {
    const start = Math.max(0, i - 6);
    const slice = data.slice(start, i + 1);
    const avg = slice.reduce((s, x) => s + x.total, 0) / slice.length;
    return {
      fecha: d.fecha,
      total: d.total,
      movingAvg7d: Math.round(avg * 100) / 100,
      isQuincena: isQuincenaLocal(d.fecha),
      isFeriado: false,
    };
  });
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: VentaDia }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] px-4 py-3 min-w-[160px]">
      <p className="text-xs font-semibold text-[var(--text-primary)] mb-1.5">{formatDate(d.fecha, "full")}</p>
      <p className="text-xs text-[var(--text-secondary)] flex justify-between gap-4">
        <span>Ventas</span>
        <span className="font-mono font-medium text-primary">S/ {Number(d.total).toFixed(2)}</span>
      </p>
      <p className="text-xs text-[var(--text-secondary)] flex justify-between gap-4">
        <span>Media 7d</span>
        <span className="font-mono font-medium text-[var(--text-tertiary)]">S/ {Number(d.movingAvg7d).toFixed(2)}</span>
      </p>
      {d.isQuincena && <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-1.5">Quincena</p>}
      {d.isFeriado && <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-1">{d.feriadoNombre ?? "Feriado"}</p>}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SalesTrendChart() {
  const [chartData, setChartData] = useState<VentaDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<Period>("30d");

  const fetchData = useCallback(async () => {
    try {
      setError(false);
      // Try dedicated endpoint first
      const res = await fetch(`/api/analytics/ventas-tendencia?period=${period}`, { credentials: "include" });

      if (res.ok) {
        const json = await res.json();
        setChartData(json.dias ?? []);
        return;
      }

      // Fallback: use rentabilidad endpoint and compute locally
      const fallbackRes = await fetch("/api/analytics/rentabilidad", { credentials: "include" });
      if (!fallbackRes.ok) throw new Error("fetch failed");
      const json = await fallbackRes.json();
      const items: RentabilidadDia[] = Array.isArray(json) ? json : json.dias ?? [];
      const mapped = items.map((d) => ({ fecha: d.fecha, total: d.ingresos ?? 0 }));
      setChartData(computeMovingAvgLocal(mapped));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Mejora 15: Datos de semana anterior para comparacion
  const prevWeekData = useMemo(() => {
    if (period === "90d" || chartData.length < 14) return {};
    const lookup: Record<string, number> = {};
    for (const d of chartData) {
      const date = new Date(d.fecha + "T00:00:00");
      const futureDate = new Date(date);
      futureDate.setDate(futureDate.getDate() + 7);
      const key = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, "0")}-${String(futureDate.getDate()).padStart(2, "0")}`;
      lookup[key] = d.total;
    }
    return lookup;
  }, [chartData, period]);

  // Mejora 18: Prediccion de ventas 7 dias
  type ChartPoint = VentaDia & { predicted?: number; predictedHigh?: number; predictedLow?: number; totalPrevWeek?: number };

  const predictedData = useMemo((): ChartPoint[] => {
    if (chartData.length < 7) return chartData.map(d => ({ ...d, predicted: undefined, predictedHigh: undefined, predictedLow: undefined }));

    // Calcular promedio por dia de semana (ultimas 4 semanas)
    const dowAvg: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const last28 = chartData.slice(-28);
    for (const d of last28) {
      const dow = new Date(d.fecha + "T00:00:00").getDay();
      dowAvg[dow].push(d.total);
    }
    const dowMeans: Record<number, number> = {};
    for (let i = 0; i < 7; i++) {
      const vals = dowAvg[i];
      dowMeans[i] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }

    // Factor de tendencia
    const lastWeek = chartData.slice(-7).reduce((s, d) => s + d.total, 0);
    const prevWeek = chartData.slice(-14, -7).reduce((s, d) => s + d.total, 0);
    const trendFactor = prevWeek > 0 && lastWeek > prevWeek ? 1.05 : prevWeek > 0 ? 0.95 : 1;

    // Generar datos proyectados
    const lastDate = new Date(chartData[chartData.length - 1].fecha + "T00:00:00");
    const projected: ChartPoint[] = [];

    // Datos reales (sin prediccion) + Mejora 15: semana anterior
    for (const d of chartData) {
      projected.push({ ...d, predicted: undefined, predictedHigh: undefined, predictedLow: undefined, totalPrevWeek: prevWeekData[d.fecha] });
    }

    // 7 dias de prediccion
    for (let i = 1; i <= 7; i++) {
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + i);
      const dow = nextDate.getDay();
      const predicted = Math.round(dowMeans[dow] * trendFactor * 100) / 100;
      const yyyy = nextDate.getFullYear();
      const mm = String(nextDate.getMonth() + 1).padStart(2, "0");
      const dd = String(nextDate.getDate()).padStart(2, "0");
      projected.push({
        fecha: `${yyyy}-${mm}-${dd}`,
        total: 0,
        movingAvg7d: 0,
        isQuincena: isQuincenaLocal(`${yyyy}-${mm}-${dd}`),
        isFeriado: false,
        predicted,
        predictedHigh: Math.round(predicted * 1.2 * 100) / 100,
        predictedLow: Math.round(predicted * 0.8 * 100) / 100,
      });
    }

    return projected;
  }, [chartData, prevWeekData]);

  // Fecha del último dato real para la linea de referencia
  const todayFecha = chartData.length > 0 ? chartData[chartData.length - 1].fecha : "";

  const quincenas = useMemo(
    () => predictedData.filter((d) => d.isQuincena).map((d) => d.fecha),
    [predictedData]
  );

  const feriados = useMemo(
    () => predictedData.filter((d) => d.isFeriado).map((d) => d.fecha),
    [predictedData]
  );

  const pills: { key: Period; label: string }[] = [
    { key: "7d", label: "7D" },
    { key: "30d", label: "30D" },
    { key: "90d", label: "90D" },
  ];

  // Reporta vacío si no hay días o todos están en cero (sin ventas reales) → el
  // ChartManager oculta el gráfico. En error NO reporta (deja ver el mensaje).
  const isEmpty = chartData.every(d => (d.total ?? 0) === 0);
  useReportChartEmpty(!error && isEmpty, !loading);

  // ── Loading ──
  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="h-5 w-40 bg-[var(--rule-soft)] dark:bg-gray-700 rounded mb-4 animate-pulse" />
        <div className="h-64 bg-[var(--surface-sunken)] rounded-lg animate-pulse" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="rounded-xl border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 p-6 flex flex-col items-center justify-center h-64">
        <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mb-3">
          No se pudieron cargar los datos de ventas
        </p>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/40 text-[var(--data-error-500)] dark:text-[var(--data-error-500)] hover:bg-[var(--data-error-500)] transition-colors"
        >
          <RefreshCw className="h-3 w-3 inline mr-1" />
          Reintentar
        </button>
      </div>
    );
  }

  // ── Empty ──
  if (!chartData.length) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 flex items-center justify-center h-64">
        <p className="text-sm text-[var(--text-tertiary)]">No hay datos de ventas para este periodo</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      {/* Header + pills */}
      <div className="flex items-center justify-between mb-4">
        {/* Sin título propio: esta gráfica va dentro de una AnalyticsCard que
            ya dice "Tendencia de Ventas" con su subtítulo. Se repetía dos veces
            a 20px de distancia. Queda el selector de período solo, alineado
            a la derecha. */}
        <span />
        <div className="flex items-center gap-1">
          {pills.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors",
                period === p.key
                  ? "bg-primary text-white"
                  : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart — Mejora 18: con prediccion 7 dias */}
      <ResponsiveContainer minWidth={0} width="100%" height={420}>
        <ComposedChart data={predictedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" />
              {/* var(--accent), no el literal: #14C2C2 es el acento de DARK, así que
                  en tema claro el degradado arrancaba del turquesa equivocado. */}
              <stop offset="100%" stopColor="var(--accent)" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
          <XAxis
            dataKey="fecha"
            tickFormatter={(d: string) => formatDate(d, "dd/MM")}
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `S/${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
            formatter={(value: string) => {
              const labels: Record<string, string> = { total: "Ventas", movingAvg7d: "Media 7d", predicted: "Proyección 7d", totalPrevWeek: "Semana anterior" };
              return <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{labels[value] ?? value}</span>;
            }}
          />

          {/* Quincenas y feriados son marcas de CALENDARIO, no alertas. Estaban
              las dos en color de advertencia, así que el gráfico se leía como
              si estuviera lleno de errores. Ahora salen de la paleta de series
              (--data-*): quincena neutra, feriado violeta, "hoy" coral. */}
          {quincenas.map((q) => (
            <ReferenceLine
              key={`q-${q}`}
              x={q}
              stroke="var(--rule-strong)"
              strokeDasharray="4 4"
              strokeOpacity={0.35}
            />
          ))}

          {feriados.map((f) => (
            <ReferenceLine
              key={`f-${f}`}
              x={f}
              stroke="var(--data-8)"
              strokeOpacity={0.5}
            />
          ))}

          {/* Mejora 18: Linea "Hoy" separando real de proyectado */}
          {todayFecha && (
            <ReferenceLine
              x={todayFecha}
              stroke="var(--data-7)"
              strokeWidth={2}
              label={{ value: "Hoy", position: "top", fill: "var(--data-7)", fontSize: 10, fontWeight: "bold" }}
            />
          )}

          {/* Banda de confianza de la prediccion — `legendType="none"`: son el
              sombreado de la proyección, no series propias. Sin esto Recharts
              cae al dataKey y la leyenda mostraba "predictedHigh" y
              "predictedLow" crudos, en inglés, al usuario final. */}
          <Area
            type="monotone"
            dataKey="predictedHigh"
            legendType="none"
            stroke="none"
            fill="var(--accent)"
            fillOpacity={0.08}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="predictedLow"
            legendType="none"
            stroke="none"
            fill="var(--accent)"
            fillOpacity={0.08}
            isAnimationActive={false}
          />

          {/* Mejora 15: Linea semana anterior (solo en 7D y 30D) */}
          {period !== "90d" && (
            <Line
              type="monotone"
              dataKey="totalPrevWeek"
              stroke="var(--text-tertiary)"
              strokeDasharray="4 4"
              dot={false}
              strokeWidth={1}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}

          <Bar
            dataKey="total"
            fill="url(#barGradient)"
            radius={[4, 4, 0, 0]}
            barSize={24}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="movingAvg7d"
            stroke="var(--data-6)"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          {/* Mejora 18: Linea de prediccion */}
          <Line
            type="monotone"
            dataKey="predicted"
            stroke="var(--accent)"
            strokeDasharray="6 4"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
