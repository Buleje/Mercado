"use client";

/**
 * CacaoMarketPulse — franja "terminal financiero" de la vista Mercado (v6).
 * Pulso intradía REAL (velas 5 min de la sesión de hoy), rango del día, FX con
 * su variación, y stats precisos multi-horizonte (1S/1M/3M/1A, racha, RSI 14,
 * volatilidad, posición 52s) desde el motor compartido cacao-lecturas. Abajo,
 * el registro de lecturas de la sesión (cada auto-actualización queda anotada
 * con su hora y su delta — "cómo se movió mientras yo miraba").
 */
import { useMemo } from "react";
import { Activity, TrendingUp, TrendingDown, Minus, Clock } from "@buleje/design-system/icons";
import { computeMarketStats, type PricePointLike } from "@/lib/cacao/cacao-lecturas";
import { CHACRA_CC_COMPRA_OFICIAL_FACTOR, COMPRA_LOCAL_PCT } from "@/lib/cacao/cacao-precio-regional";
import CacaoChartPresent from "./CacaoChartPresent";

export interface LecturaSesion { t: number; usd: number; pen: number | null }

const fmt = (v: number | null, d = 0) => (v == null ? "—" : v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d }));
const hora = (t: number | string) => new Date(t).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
const pctStr = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;

export default function CacaoMarketPulse({
  value,
  prevClose,
  dayHigh,
  dayLow,
  asOf,
  series,
  intraday,
  usdPen,
  fxSeries,
  pricePenPerKg,
  lecturas,
  onPresent,
}: {
  value: number;
  prevClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  asOf: string;
  series: PricePointLike[];
  intraday: PricePointLike[];
  usdPen: number | null;
  fxSeries: PricePointLike[];
  pricePenPerKg: number | null;
  lecturas: LecturaSesion[];
  onPresent?: () => void;
}) {
  const stats = useMemo(() => computeMarketStats(series, usdPen), [series, usdPen]);
  const chg = prevClose != null ? value - prevClose : null;
  const chgPct = prevClose ? ((value - prevClose) / prevClose) * 100 : null;
  const up = (chg ?? 0) > 0, down = (chg ?? 0) < 0;
  const tone = up ? "var(--data-success-600)" : down ? "var(--data-error-600)" : "var(--text-tertiary)";

  // FX: variación del día contra el cierre previo de la serie diaria USD/PEN.
  const fxChgPct = useMemo(() => {
    if (!usdPen || fxSeries.length < 2) return null;
    const prev = fxSeries[fxSeries.length - 2].c;
    return prev > 0 ? ((usdPen - prev) / prev) * 100 : null;
  }, [usdPen, fxSeries]);

  const compraLocal = pricePenPerKg != null ? pricePenPerKg * CHACRA_CC_COMPRA_OFICIAL_FACTOR : null;
  // posición del último precio dentro del rango del día (para la barra)
  const posDia = dayLow != null && dayHigh != null && dayHigh > dayLow
    ? Math.min(100, Math.max(0, ((value - dayLow) / (dayHigh - dayLow)) * 100))
    : null;

  const horiz = Object.fromEntries((stats?.horizontes ?? []).map((h) => [h.key, h.pct])) as Partial<Record<"1S" | "1M" | "3M" | "1A", number>>;

  return (
    <div className="group relative rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Activity className="h-4 w-4 text-[var(--accent)]" />
          Pulso del mercado · sesión de hoy
        </h3>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
            <Clock className="h-3.5 w-3.5" /> dato {hora(asOf)}
          </span>
          {onPresent && <CacaoChartPresent title="Pulso del mercado" onClick={onPresent} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Intradía (velas 5 min) */}
        <div className="lg:col-span-3">
          <div className="flex flex-wrap items-end gap-3">
            <span className="font-mono text-3xl font-extrabold leading-none tabular-nums text-[var(--text-primary)]">USD {fmt(value)}</span>
            <span className="mb-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-bold" style={{ color: tone, background: "var(--surface-sunken)" }}>
              {up ? <TrendingUp className="h-4 w-4" /> : down ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              {chg != null ? `${chg > 0 ? "+" : ""}${fmt(chg)} · ` : ""}{chgPct != null ? pctStr(chgPct, 2) : "—"} hoy
            </span>
          </div>
          <IntradaySpark data={intraday} prevClose={prevClose} tone={tone} />
          <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            {intraday.length > 1
              ? `Sesión de hoy en velas de 5 min (${hora(intraday[0].t)}–${hora(intraday[intraday.length - 1].t)}) · línea punteada = cierre de ayer`
              : "Sin movimientos intradía todavía (mercado cerrado o recién abierto)."}
          </p>
        </div>

        {/* Columna derecha: rango del día · FX · compra local */}
        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
            <div className="mb-1 flex justify-between text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              <span>Rango del día</span>
              <span className="font-mono normal-case tracking-normal">{fmt(dayLow)} – {fmt(dayHigh)}</span>
            </div>
            {posDia != null ? (
              <div className="relative h-2 rounded-full bg-[var(--surface-canvas)]">
                <div className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: `${posDia}%`, background: tone }} />
                <div className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-[var(--surface-raised)] shadow" style={{ left: `${posDia}%`, background: tone }} />
              </div>
            ) : (
              <p className="text-xs text-[var(--text-tertiary)]">—</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Dólar hoy</div>
              <div className="mt-0.5 font-mono text-lg font-extrabold tabular-nums text-[var(--text-primary)]">S/ {usdPen != null ? usdPen.toFixed(4) : "—"}</div>
              {fxChgPct != null && <div className={`text-[length:var(--ts-2xs)] font-bold ${fxChgPct > 0 ? "text-[var(--data-success-700)]" : fxChgPct < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-tertiary)]"}`}>{pctStr(fxChgPct, 2)} vs ayer</div>}
            </div>
            <div className="rounded-xl bg-primary/10 px-3 py-2.5">
              <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">Compra local</div>
              <div className="mt-0.5 font-mono text-lg font-extrabold tabular-nums text-[var(--accent)]">S/ {compraLocal != null ? compraLocal.toFixed(2) : "—"}</div>
              <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{COMPRA_LOCAL_PCT}% del oficial · /kg seco</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats precisos multi-horizonte */}
      {stats && (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--rule-soft)] pt-3 sm:grid-cols-4 xl:grid-cols-8">
          {(["1S", "1M", "3M", "1A"] as const).map((k) => (
            <Tile key={k} label={k === "1S" ? "Semana" : k === "1M" ? "Mes" : k === "3M" ? "3 meses" : "Año"} value={horiz[k] != null ? pctStr(horiz[k]!) : "—"} tone={horiz[k] == null ? 0 : Math.sign(horiz[k]!)} />
          ))}
          <Tile label="Racha" value={stats.racha.dias >= 2 ? `${stats.racha.dias}d ${stats.racha.dir > 0 ? "↑" : "↓"}` : "—"} tone={stats.racha.dias >= 2 ? stats.racha.dir : 0} />
          <Tile label="RSI 14" value={stats.rsi14 != null ? String(stats.rsi14) : "—"} hint={stats.rsi14 == null ? undefined : stats.rsi14 >= 70 ? "sobrecomprado" : stats.rsi14 <= 30 ? "sobrevendido" : "neutro"} tone={stats.rsi14 == null ? 0 : stats.rsi14 >= 70 ? 1 : stats.rsi14 <= 30 ? -1 : 0} />
          <Tile label="Volatilidad" value={stats.vol30 != null ? `±${stats.vol30.toFixed(1)}%/d` : "—"} hint={stats.vol30 == null ? undefined : stats.vol30 >= 3 ? "nervioso" : stats.vol30 >= 1.5 ? "movido" : "tranquilo"} />
          <Tile label="Rango anual" value={stats.pos52 != null ? `${stats.pos52}%` : "—"} hint="0 = mín · 100 = máx" />
        </div>
      )}

      {/* Registro de lecturas de la sesión */}
      {lecturas.length > 0 && (
        <div className="mt-3 border-t border-[var(--rule-soft)] pt-3">
          <div className="mb-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Lecturas de esta sesión ({lecturas.length}) — cada actualización queda anotada
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {lecturas.slice(-12).map((l, i, arr) => {
              const prev = i > 0 ? arr[i - 1].usd : null;
              const d = prev != null ? l.usd - prev : null;
              const c = d == null || d === 0 ? "text-[var(--text-tertiary)]" : d > 0 ? "text-[var(--data-success-700)]" : "text-[var(--data-error-700)]";
              return (
                <span key={l.t} className="inline-flex shrink-0 items-baseline gap-1.5 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5 font-mono text-xs tabular-nums">
                  <span className="text-[var(--text-tertiary)]">{hora(l.t)}</span>
                  <span className="font-bold text-[var(--text-primary)]">{fmt(l.usd)}</span>
                  {d != null && d !== 0 && <span className={`font-bold ${c}`}>{d > 0 ? "▲" : "▼"}{fmt(Math.abs(d))}</span>}
                  {d === 0 && <span className={c}>=</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Sparkline intradía SVG (sin recharts): área + línea + baseline del cierre de ayer. */
function IntradaySpark({ data, prevClose, tone }: { data: PricePointLike[]; prevClose: number | null; tone: string }) {
  if (data.length < 2) return <div className="mt-2 h-[96px] rounded-xl bg-[var(--surface-sunken)]" aria-hidden />;
  const w = 640, h = 96, padY = 6;
  const vals = data.map((p) => p.c);
  const lo = Math.min(...vals, prevClose ?? Infinity);
  const hi = Math.max(...vals, prevClose ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (data.length - 1)) * w;
  const y = (v: number) => h - padY - ((v - lo) / span) * (h - padY * 2);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-[96px] w-full" preserveAspectRatio="none" aria-label="Movimiento intradía del precio">
      <polygon points={area} style={{ fill: tone, opacity: 0.12 }} />
      {prevClose != null && (
        <line x1={0} x2={w} y1={y(prevClose)} y2={y(prevClose)} style={{ stroke: "var(--text-tertiary)", strokeDasharray: "4 4", strokeOpacity: 0.6 }} />
      )}
      <polyline points={pts} style={{ fill: "none", stroke: tone, strokeWidth: 2 }} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={y(vals[vals.length - 1])} r={3.5} style={{ fill: tone, stroke: "var(--surface-raised)", strokeWidth: 1.5 }} />
    </svg>
  );
}

function Tile({ label, value, hint, tone = 0 }: { label: string; value: string; hint?: string; tone?: number }) {
  return (
    <div className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-center">
      <div className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</div>
      <div className={`mt-0.5 font-mono text-sm font-extrabold tabular-nums ${tone > 0 ? "text-[var(--data-success-700)]" : tone < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{value}</div>
      {hint && <div className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</div>}
    </div>
  );
}
