"use client";

/**
 * CacaoPriceChart — flujo de precio del cacao con analítica de movimiento.
 * Cargado vía next/dynamic en CacaoNoticiero (recharts fuera del bundle inicial).
 * Selector de rango + área coloreada por tendencia + métricas del período.
 * Toggle de unidad: USD/t internacional ↔ S//kg en chacra Ciudad Constitución (est.),
 * para leer el precio en la moneda y el eslabón que le importa al acopiador.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from "recharts";
import { TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, Activity } from "@buleje/design-system/icons";
import { CHACRA_CC_SECO_FACTOR } from "@/lib/cacao/cacao-precio-regional";

interface PricePoint { t: number; c: number }
const RANGES = [
  { key: "1S", days: 7 }, { key: "1M", days: 30 }, { key: "3M", days: 90 }, { key: "6M", days: 180 }, { key: "1A", days: 9999 },
] as const;
type Unit = "usd" | "sol";

const fmt = (v: number | null, d = 0) => (v == null ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d }));

export default function CacaoPriceChart({
  series,
  usdPen = null,
  onPointSelect,
  selectedT = null,
}: {
  series: PricePoint[];
  usdPen?: number | null;
  /** Click en un punto del gráfico → devuelve el USD/t y el timestamp de ese día. */
  onPointSelect?: (usdPerTonne: number, t: number) => void;
  /** Timestamp del punto seleccionado (para marcarlo). null = ninguno. */
  selectedT?: number | null;
}) {
  const [range, setRange] = useState<string>("3M");
  const [unit, setUnit] = useState<Unit>("usd");
  const [showMA, setShowMA] = useState(false);
  const [showForecast, setShowForecast] = useState(false);
  const [show52, setShow52] = useState(false);
  const canSol = typeof usdPen === "number" && usdPen > 0;
  const isSol = unit === "sol" && canSol;
  const dec = isSol ? 2 : 0;
  const money = (v: number | null) => (isSol ? `S/ ${fmt(v, 2)}` : `USD ${fmt(v, 0)}`);
  const suffix = isSol ? "/kg" : "/t";

  const dayLabel = (t: number) =>
    new Date(t).toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });

  const view = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? 90;
    // factor de conversión a S//kg en chacra CC: (USD/t ÷ 1000) × FX × factor chacra.
    const factor = isSol && usdPen ? (usdPen / 1000) * CHACRA_CC_SECO_FACTOR : 1;
    const fullUnit = series.map((p) => p.c * factor); // serie completa (1 año) en la unidad
    // SMA sobre la serie COMPLETA → el inicio de la ventana usa datos previos.
    const smaAt = (w: number, i: number) => {
      if (i < w - 1) return null;
      let s = 0;
      for (let j = i - w + 1; j <= i; j++) s += fullUnit[j];
      return s / w;
    };
    const startIdx = Math.max(0, series.length - Math.min(days, series.length));
    const data = series.slice(startIdx).map((p, k) => {
      const gi = startIdx + k;
      return { t: p.t, c: p.c * factor, usd: p.c, sma7: smaAt(7, gi), sma30: smaAt(30, gi) };
    });
    if (data.length < 2) return null;
    const closes = data.map((p) => p.c);
    const first = closes[0], last = closes[closes.length - 1];
    const max = Math.max(...closes), min = Math.min(...closes);
    const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
    const variacion = ((last - first) / first) * 100;
    // volatilidad: desviación estándar de los retornos diarios — fracción y %.
    const rets: number[] = [];
    let up = 0, down = 0;
    for (let i = 1; i < closes.length; i++) {
      const r = (closes[i] - closes[i - 1]) / closes[i - 1];
      rets.push(r);
      if (closes[i] > closes[i - 1]) up++; else if (closes[i] < closes[i - 1]) down++;
    }
    const meanR = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
    const volFrac = Math.sqrt(rets.reduce((a, b) => a + (b - meanR) ** 2, 0) / (rets.length || 1));
    const vol = volFrac * 100;
    // 52 semanas = serie completa (1 año)
    const week52High = Math.max(...fullUnit), week52Low = Math.min(...fullUnit);
    // máx/mín del período (para los marcadores)
    const maxIdx = closes.indexOf(max), minIdx = closes.indexOf(min);
    // Proyección: regresión lineal sobre la ventana + banda de volatilidad (√t).
    const nWin = closes.length;
    const mx = (nWin - 1) / 2;
    let num = 0, den = 0;
    for (let i = 0; i < nWin; i++) { num += (i - mx) * (closes[i] - avg); den += (i - mx) ** 2; }
    const slope = den ? num / den : 0;
    const lastT = data[data.length - 1].t;
    const dayMs = nWin > 1 ? (lastT - data[0].t) / (nWin - 1) : 86_400_000;
    const forecast = Array.from({ length: 30 }, (_, k) => {
      const step = k + 1;
      const mid = last + slope * step;
      const band = last * volFrac * Math.sqrt(step);
      return { t: lastT + step * dayMs, label: dayLabel(lastT + step * dayMs), fc: Math.max(0, mid), fcLo: Math.max(0, mid - band), fcHi: mid + band };
    });
    const chartData = data.map((p) => ({ ...p, label: dayLabel(p.t) }));
    // Datos a renderizar: si hay proyección, ancla el último punto real y concatena.
    const renderData = showForecast
      ? [...chartData.map((p, i) => (i === chartData.length - 1 ? { ...p, fc: p.c, fcLo: p.c, fcHi: p.c } : p)), ...forecast]
      : chartData;
    // Dominio Y: base + overlays visibles (52sem / proyección) para que no se salgan.
    const span = max - min;
    const pad = isSol ? Math.max(0.15, span * 0.12) : Math.max(50, span * 0.1);
    let ylo = min - pad, yhi = max + pad;
    if (show52) { ylo = Math.min(ylo, week52Low); yhi = Math.max(yhi, week52High); }
    if (showForecast) {
      ylo = Math.min(ylo, ...forecast.map((f) => f.fcLo));
      yhi = Math.max(yhi, ...forecast.map((f) => f.fcHi));
    }
    const yDomain: [number, number] = [Math.max(0, ylo), yhi];
    return { chartData, renderData, first, last, max, min, avg, variacion, vol, up, down, n: data.length, yDomain, week52High, week52Low, maxPoint: chartData[maxIdx], minPoint: chartData[minIdx] };
  }, [series, range, isSol, usdPen, show52, showForecast]);

  const up = (view?.variacion ?? 0) > 0, down = (view?.variacion ?? 0) < 0;
  // Recharts pinta el SVG con valores concretos: resolvemos los tokens del DS a
  // su color real (las CSS var() no resuelven confiable como atributo SVG).
  const rootRef = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState({ up: "#00A0A0", down: "#ef4444", neutral: "#9ca3af", accent: "#00A0A0", ma1: "#0ea5e9", ma2: "#f59e0b" });
  useEffect(() => {
    const cs = getComputedStyle(rootRef.current ?? document.body);
    const pick = (names: string[], fb: string) => { for (const n of names) { const v = cs.getPropertyValue(n).trim(); if (v) return v; } return fb; };
    setPalette({
      up: pick(["--data-success-500", "--data-success-600"], "#00A0A0"),
      down: pick(["--data-error-500", "--color-danger"], "#ef4444"),
      neutral: pick(["--text-tertiary"], "#9ca3af"),
      accent: pick(["--accent"], "#00A0A0"),
      ma1: pick(["--data-info-500", "--data-info-600"], "#0ea5e9"),
      ma2: pick(["--data-warning-500", "--data-warning-600"], "#f59e0b"),
    });
  }, []);
  const color = up ? palette.up : down ? palette.down : palette.neutral;
  const selLabel = selectedT != null ? view?.chartData.find((d) => d.t === selectedT)?.label ?? null : null;

  return (
    <div ref={rootRef} className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Activity className="h-4 w-4 text-[var(--accent)]" />
          {isSol ? "Flujo de precio · en chacra Ciudad Constitución (S//kg est.)" : "Flujo de precio · ICE cocoa (USD/t)"}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {canSol && (
            <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
              <button type="button" onClick={() => setUnit("usd")} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${!isSol ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>USD/t</button>
              <button type="button" onClick={() => setUnit("sol")} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${isSol ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>S//kg chacra</button>
            </div>
          )}
          <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
            {RANGES.map((r) => (
              <button key={r.key} type="button" onClick={() => setRange(r.key)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${range === r.key ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>{r.key}</button>
            ))}
          </div>
          <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-0.5">
            <OverlayToggle active={showMA} onClick={() => setShowMA((v) => !v)} label="MM" title="Medias móviles 7 y 30 días" />
            <OverlayToggle active={showForecast} onClick={() => setShowForecast((v) => !v)} label="Proy." title="Proyección a 30 días (regresión + banda)" />
            <OverlayToggle active={show52} onClick={() => setShow52((v) => !v)} label="52sem" title="Máximo y mínimo de 52 semanas" />
          </div>
        </div>
      </div>

      {!view ? (
        <p className="py-12 text-center text-sm text-[var(--text-tertiary)]">Sin datos suficientes para este rango.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-3">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ${up ? "bg-[var(--data-success-100)] text-[var(--data-success-900)]" : down ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"}`}>
              {up ? <TrendingUp className="h-4 w-4" /> : down ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {up ? "+" : ""}{view.variacion.toFixed(1)}% en {range}
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">de {money(view.first)} a {money(view.last)}{suffix}</span>
            {isSol && <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">estimado en chacra CC</span>}
          </div>

          {onPointSelect && (
            <p className="mb-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Tocá un punto del gráfico para fijar ese precio en los indicadores de arriba.</p>
          )}
          <ResponsiveContainer width="100%" height={240} minWidth={0}>
            <AreaChart
              data={view.renderData}
              margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
              style={onPointSelect ? { cursor: "pointer" } : undefined}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={((e: any) => {
                const pl = e?.activePayload?.[0]?.payload;
                // Ignorar clicks sobre los puntos de proyección (no tienen precio real).
                if (pl && pl.usd != null && onPointSelect) onPointSelect(pl.usd as number, pl.t as number);
              }) as never}
            >
              <defs>
                <linearGradient id="cacaoPriceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.12)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={40} stroke="rgba(107,114,128,0.4)" />
              <YAxis domain={view.yDomain} tick={{ fontSize: 10 }} width={isSol ? 44 : 48} tickFormatter={(v: number) => fmt(v, dec)} stroke="rgba(107,114,128,0.4)" />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={((v: number, name: string) => [`${money(Number(v))}${suffix}`, name]) as any}
                contentStyle={{ borderRadius: "12px", border: "1px solid var(--rule-base)", background: "var(--surface-raised)", color: "var(--text-primary)", fontSize: "12px" }}
              />
              <ReferenceLine y={view.avg} stroke="var(--text-tertiary)" strokeDasharray="4 4" strokeOpacity={0.5} />
              {show52 && (
                <>
                  <ReferenceLine y={view.week52High} stroke={palette.down} strokeDasharray="2 3" strokeOpacity={0.6} label={{ value: `máx 52s ${money(view.week52High)}`, position: "insideTopLeft", fontSize: 9, fill: palette.down }} />
                  <ReferenceLine y={view.week52Low} stroke={palette.up} strokeDasharray="2 3" strokeOpacity={0.6} label={{ value: `mín 52s ${money(view.week52Low)}`, position: "insideBottomLeft", fontSize: 9, fill: palette.up }} />
                </>
              )}
              {selLabel && <ReferenceLine x={selLabel} stroke={palette.accent} strokeWidth={2} />}
              <Area type="monotone" dataKey="c" name="Precio" stroke={color} strokeWidth={2} fill="url(#cacaoPriceGrad)" dot={false} activeDot={{ r: 5, fill: palette.accent }} />
              {showMA && <Line type="monotone" dataKey="sma7" name="MM 7" stroke={palette.ma1} strokeWidth={1.5} dot={false} connectNulls />}
              {showMA && <Line type="monotone" dataKey="sma30" name="MM 30" stroke={palette.ma2} strokeWidth={1.5} dot={false} connectNulls />}
              {showForecast && <Line type="monotone" dataKey="fcHi" name="Proy. alta" stroke={palette.accent} strokeWidth={1} strokeDasharray="2 3" strokeOpacity={0.5} dot={false} connectNulls />}
              {showForecast && <Line type="monotone" dataKey="fcLo" name="Proy. baja" stroke={palette.accent} strokeWidth={1} strokeDasharray="2 3" strokeOpacity={0.5} dot={false} connectNulls />}
              {showForecast && <Line type="monotone" dataKey="fc" name="Proyección" stroke={palette.accent} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />}
              {view.maxPoint && <ReferenceDot x={view.maxPoint.label} y={view.max} r={4} fill={palette.up} stroke="var(--surface-raised)" strokeWidth={1.5} label={{ value: money(view.max), position: "top", fontSize: 9, fill: palette.up }} />}
              {view.minPoint && <ReferenceDot x={view.minPoint.label} y={view.min} r={4} fill={palette.down} stroke="var(--surface-raised)" strokeWidth={1.5} label={{ value: money(view.min), position: "bottom", fontSize: 9, fill: palette.down }} />}
            </AreaChart>
          </ResponsiveContainer>

          {/* Métricas del movimiento */}
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--rule-soft)] pt-3 sm:grid-cols-5">
            <Metric label="Máximo" value={money(view.max)} />
            <Metric label="Mínimo" value={money(view.min)} />
            <Metric label="Promedio" value={money(view.avg)} hint="línea punteada" />
            <Metric label="Volatilidad" value={`${view.vol.toFixed(1)}%`} hint="cuánto salta/día" />
            <Metric label="Días sube / baja" value={`${view.up} / ${view.down}`} arrows />
          </div>
        </>
      )}
    </div>
  );
}

function OverlayToggle({ active, onClick, label, title }: { active: boolean; onClick: () => void; label: string; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${active ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
    >
      {label}
    </button>
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
