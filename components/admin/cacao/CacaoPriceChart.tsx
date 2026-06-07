"use client";

/**
 * CacaoPriceChart — flujo de precio del cacao con analítica de movimiento.
 * Cargado vía next/dynamic en CacaoNoticiero (recharts fuera del bundle inicial).
 * Selector de rango + área coloreada por tendencia + métricas del período.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, Activity } from "@buleje/design-system/icons";

interface PricePoint { t: number; c: number }
const RANGES = [
  { key: "1S", days: 7 }, { key: "1M", days: 30 }, { key: "3M", days: 90 }, { key: "6M", days: 180 }, { key: "1A", days: 9999 },
] as const;

const fmt = (v: number | null, d = 0) => (v == null ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d }));

export default function CacaoPriceChart({ series }: { series: PricePoint[] }) {
  const [range, setRange] = useState<string>("3M");

  const view = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? 90;
    const data = series.slice(-Math.min(days, series.length));
    if (data.length < 2) return null;
    const closes = data.map((p) => p.c);
    const first = closes[0], last = closes[closes.length - 1];
    const max = Math.max(...closes), min = Math.min(...closes);
    const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
    const variacion = ((last - first) / first) * 100;
    // volatilidad: desviación estándar de los retornos diarios (%)
    const rets: number[] = [];
    let up = 0, down = 0;
    for (let i = 1; i < closes.length; i++) {
      const r = (closes[i] - closes[i - 1]) / closes[i - 1];
      rets.push(r);
      if (closes[i] > closes[i - 1]) up++; else if (closes[i] < closes[i - 1]) down++;
    }
    const meanR = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
    const vol = Math.sqrt(rets.reduce((a, b) => a + (b - meanR) ** 2, 0) / (rets.length || 1)) * 100;
    const chartData = data.map((p) => ({ t: p.t, c: p.c, label: new Date(p.t).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" }) }));
    return { chartData, first, last, max, min, avg, variacion, vol, up, down, n: data.length };
  }, [series, range]);

  const up = (view?.variacion ?? 0) > 0, down = (view?.variacion ?? 0) < 0;
  // Recharts pinta el SVG con valores concretos: resolvemos los tokens del DS a
  // su color real (las CSS var() no resuelven confiable como atributo SVG).
  const rootRef = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState({ up: "#00A0A0", down: "#ef4444", neutral: "#9ca3af" });
  useEffect(() => {
    const cs = getComputedStyle(rootRef.current ?? document.body);
    const pick = (names: string[], fb: string) => { for (const n of names) { const v = cs.getPropertyValue(n).trim(); if (v) return v; } return fb; };
    setPalette({
      up: pick(["--data-success-500", "--data-success-600"], "#00A0A0"),
      down: pick(["--data-error-500", "--color-danger"], "#ef4444"),
      neutral: pick(["--text-tertiary"], "#9ca3af"),
    });
  }, []);
  const color = up ? palette.up : down ? palette.down : palette.neutral;

  return (
    <div ref={rootRef} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Activity className="h-4 w-4 text-[var(--accent)]" /> Flujo de precio · ICE cocoa (USD/t)</h3>
        <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
          {RANGES.map((r) => (
            <button key={r.key} type="button" onClick={() => setRange(r.key)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${range === r.key ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{r.key}</button>
          ))}
        </div>
      </div>

      {!view ? (
        <p className="py-12 text-center text-sm text-[var(--text-tertiary)]">Sin datos suficientes para este rango.</p>
      ) : (
        <>
          <div className="mb-3 flex items-baseline gap-3">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ${up ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]" : down ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
              {up ? <TrendingUp className="h-4 w-4" /> : down ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {up ? "+" : ""}{view.variacion.toFixed(1)}% en {range}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">de USD {fmt(view.first)} a USD {fmt(view.last)}</span>
          </div>

          <ResponsiveContainer width="100%" height={240} minWidth={0}>
            <AreaChart data={view.chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cacaoPriceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={40} stroke="rgba(107,114,128,0.4)" />
              <YAxis domain={["dataMin - 100", "dataMax + 100"]} tick={{ fontSize: 10 }} width={48} tickFormatter={(v: number) => fmt(v)} stroke="rgba(107,114,128,0.4)" />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((v: number) => [`USD ${fmt(Number(v))}/t`, "Precio"]) as any}
                contentStyle={{ borderRadius: "12px", border: "1px solid var(--rule-base)", background: "var(--surface-raised)", color: "var(--text-primary)", fontSize: "12px" }}
              />
              <ReferenceLine y={view.avg} stroke="var(--text-tertiary)" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Area type="monotone" dataKey="c" stroke={color} strokeWidth={2} fill="url(#cacaoPriceGrad)" dot={false} activeDot={{ r: 4, fill: color }} />
            </AreaChart>
          </ResponsiveContainer>

          {/* Métricas del movimiento */}
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--rule-soft)] pt-3 sm:grid-cols-5">
            <Metric label="Máximo" value={`USD ${fmt(view.max)}`} />
            <Metric label="Mínimo" value={`USD ${fmt(view.min)}`} />
            <Metric label="Promedio" value={`USD ${fmt(view.avg)}`} hint="línea punteada" />
            <Metric label="Volatilidad" value={`${view.vol.toFixed(1)}%`} hint="cuánto salta/día" />
            <Metric label="Días sube / baja" value={`${view.up} / ${view.down}`} arrows />
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, hint, arrows }: { label: string; value: string; hint?: string; arrows?: boolean }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div>
      <div className="mt-0.5 flex items-center justify-center gap-1 font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
        {arrows && <ArrowUp className="h-3.5 w-3.5 text-[var(--data-success-600)]" />}
        {value}
        {arrows && <ArrowDown className="h-3.5 w-3.5 text-[var(--data-error-600)]" />}
      </div>
      {hint && <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</div>}
    </div>
  );
}
