"use client";

/**
 * CtpAnalisis — pestaña "Análisis": mira hacia ADELANTE (reorden predictivo) y
 * hacia ATRÁS (tendencias mensuales), con lectura ejecutiva.
 *
 * - Resumen: totales del tramo reciente + delta vs el tramo previo (mitad vieja
 *   vs mitad nueva de los meses cargados). Da la tendencia de un vistazo.
 * - Reorden: por especie, cuántos días de materia prima quedan al ritmo de
 *   consumo reciente. Para reponer ANTES de quedarse sin madera.
 * - Tendencias: flujo (ingresado vs. consumido) y rendimiento mes a mes con ejes,
 *   grid y tooltip del DS (BulejeBarChart). Todo derivado del libro, sin snapshots.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Layers,
  Minus,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
} from "@buleje/design-system/icons";
import { BulejeComposedChart, BulejeLineChart, BulejeDonutChart, BulejeSparkline } from "@/components/ui-system/charts";
import { SERIES_PALETTE } from "@/components/ui-system/charts/palette";
import { Btn } from "./ctp-shared";
import type { ReordenProyeccion, TendenciaMes } from "@/lib/db/forest-ctp.db";

const n2 = (v: number) => v.toFixed(2);
const r2 = (v: number) => Math.round(v * 100) / 100;

export default function CtpAnalisis() {
  const [reorden, setReorden] = useState<ReordenProyeccion[] | null>(null);
  const [tendencias, setTendencias] = useState<TendenciaMes[] | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * FIX 2026-08-22: el guard de carga era `loading && !reorden` — `reorden` se
   * setea con el primer `await r1.json()`, pero `tendencias` recién con el
   * SEGUNDO `await r2.json()` unas líneas más abajo. Entre uno y otro, React
   * ya podía renderizar con `tendencias` todavía en `null`: el Resumen y los
   * gráficos de tendencia (ambos con guard `tendencias &&`) desaparecían un
   * instante y volvían a aparecer solos. Mismo patrón que
   * LothCompliancePanel, acá sin verdicto falso pero sí un parpadeo real.
   * `ready` cubre TODO `load()`, no sólo el primer fetch.
   */
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/admin/forestal/ctp?reorden=1", { credentials: "include" }),
        fetch("/api/admin/forestal/ctp?tendencias=1&meses=6", { credentials: "include" }),
      ]);
      if (!r1.ok) throw new Error((await r1.json().catch(() => ({}))).message ?? `HTTP ${r1.status}`);
      if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).message ?? `HTTP ${r2.status}`);
      setReorden((await r1.json()).reorden ?? []);
      setTendencias((await r2.json()).tendencias ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); setReady(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const resumen = useMemo(() => computeResumen(tendencias), [tendencias]);
  const chartData = useMemo(
    () => (tendencias ?? []).map((t) => ({
      mes: mesCorto(t.mes),
      Ingresado: t.ingresoM3,
      Consumido: t.consumidoM3,
      // Balance del mes = lo que entró − lo que se consumió. Cruce en 0 = si la
      // planta repone o se está comiendo su stock. Mismo eje (m³) que las barras.
      Balance: r2(t.ingresoM3 - t.consumidoM3),
      Producido: t.producido,
      Despachado: t.despachado,
      Rendimiento: t.rendimiento,
    })),
    [tendencias],
  );

  // Series planas para los sparklines de cada KPI (tendencia de 6 meses de un vistazo).
  const spark = useMemo(() => ({
    ingreso: (tendencias ?? []).map((t) => t.ingresoM3),
    producido: (tendencias ?? []).map((t) => t.producido),
    rendimiento: (tendencias ?? []).map((t) => t.rendimiento),
  }), [tendencias]);

  // Composición del stock actual de materia prima por especie (top 6 + otras),
  // derivada del reorden — de qué está hecho lo que hoy tenés en patio.
  const stockData = useMemo(() => {
    const rows = (reorden ?? []).filter((r) => r.saldo > 0).sort((a, b) => b.saldo - a.saldo);
    const TOP = 6;
    const out = rows.slice(0, TOP).map((r) => ({ name: r.especie, value: r.saldo }));
    const resto = rows.slice(TOP);
    if (resto.length) out.push({ name: `Otras (${resto.length})`, value: r2(resto.reduce((a, r) => a + r.saldo, 0)) });
    return out;
  }, [reorden]);
  const stockTotal = useMemo(() => stockData.reduce((a, d) => a + d.value, 0), [stockData]);

  // Reorden ordenado por urgencia: lo que se agota primero, arriba (el output que
  // más importa — "¿qué madera me falta?"). Sin días de agotar (no se consume) al fondo.
  const reordenSorted = useMemo(() => {
    if (!reorden) return null;
    return [...reorden].sort((a, b) => (a.diasHastaAgotar ?? Infinity) - (b.diasHastaAgotar ?? Infinity));
  }, [reorden]);

  // Síntesis accionable de la reposición: cuántas especies críticas (≤14 días) o
  // por reponer este mes (≤30), y cuál es la más urgente.
  const reordenInsight = useMemo(() => {
    if (!reordenSorted) return null;
    const conDias = reordenSorted.filter((r): r is ReordenProyeccion & { diasHastaAgotar: number } => r.diasHastaAgotar != null);
    return {
      criticas: conDias.filter((r) => r.diasHastaAgotar <= 14),
      pronto: conDias.filter((r) => r.diasHastaAgotar > 14 && r.diasHastaAgotar <= 30),
    };
  }, [reordenSorted]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--text-tertiary)]">Reorden predictivo (¿cuándo me quedo sin madera?) y tendencias de los últimos 6 meses. Derivado del libro, sin configurar nada.</p>
        <Btn variant="secondary" size="md" onClick={() => void load()} disabled={loading} className="shrink-0"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar</Btn>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {loading && !ready && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Calculando…</p></div>}

      {/* Resumen ejecutivo: tramo reciente vs tramo previo (mitades del rango cargado). */}
      {resumen && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DeltaStat label="Ingresado" hint={`suma últimos ${resumen.monthsRecent}m`} value={n2(resumen.ingresado)} unit="m³" icon={Layers} delta={resumen.ingresadoDelta} deltaSuffix="%" priorLabel={`${resumen.monthsPrior}m previos`} tone="directional" spark={spark.ingreso} />
          <DeltaStat label="Producido" hint={`suma últimos ${resumen.monthsRecent}m`} value={n2(resumen.producido)} unit="" icon={Boxes} delta={resumen.producidoDelta} deltaSuffix="%" priorLabel={`${resumen.monthsPrior}m previos`} tone="directional" spark={spark.producido} />
          <DeltaStat label="Rendimiento prom." hint={`ponderado últimos ${resumen.monthsRecent}m`} value={resumen.rendimiento.toFixed(1)} unit="%" icon={Scale} delta={resumen.rendimientoDelta} deltaSuffix=" pts" priorLabel={`${resumen.monthsPrior}m previos`} tone="neutral" spark={spark.rendimiento} />
        </div>
      )}

      {reorden && (
        <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <div className="border-b-2 border-[var(--rule-base)] px-4 py-3">
            <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><TrendingUp className="h-4 w-4" /> Reorden predictivo de materia prima</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Días de stock al ritmo de consumo de los últimos 90 días. Repone antes de que llegue a cero.</p>
          </div>
          {reorden.length > 0 && reordenInsight && (() => {
            const b = reordenBanner(reordenInsight);
            const s = REORDEN_BANNER[b.tone];
            return (
              <div className={`flex items-center gap-2 border-b-2 border-[var(--rule-base)] px-4 py-2.5 text-sm font-medium ${s.cls}`}>
                <s.Icon className="h-4 w-4 shrink-0" />
                <span>{b.text}</span>
              </div>
            );
          })()}
          {reorden.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-tertiary)]">Sin materia prima ni consumo registrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] text-left">
                <tr>
                  <th className="px-4 py-3 font-bold text-[var(--text-primary)]">Especie</th>
                  <th className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">Stock (m³)</th>
                  <th className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">Consumo/mes</th>
                  <th className="px-4 py-3 text-right font-bold text-[var(--text-primary)]">Se agota en</th>
                </tr>
              </thead>
              <tbody>
                {(reordenSorted ?? reorden).map((r) => {
                  const u = urgencia(r.diasHastaAgotar);
                  return (
                    <tr key={r.especie} className="border-t border-[var(--rule-soft)]">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)]">{r.especie}{r.cites && <span className="rounded-full bg-[var(--data-error-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}</span>
                        {r.scientific && <div className="text-xs italic text-[var(--text-tertiary)]">{r.scientific}</div>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(r.saldo)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{r.ratePorDia > 0 ? n2(r.ratePorDia * 30) : "—"}</td>
                      <td className="px-4 py-3 text-right"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${u.cls}`}>{u.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tendencias && tendencias.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Flujo: barras entrada/consumo + línea de balance del mes (mismo eje
              m³, cruce en 0). Composed = una sola lectura de "¿repongo o me como
              el stock?". */}
          <ChartCard
            title="Flujo mensual de materia prima (m³)"
            subtitle="Ingresado vs. consumido, y el balance del mes: si la línea cae bajo 0, consumís más de lo que entra."
          >
            <BulejeComposedChart
              data={chartData}
              xKey="mes"
              bars={[
                { key: "Ingresado", label: "Ingresado", color: "accent", yAxis: "left" },
                { key: "Consumido", label: "Consumido", color: "amber", yAxis: "left" },
              ]}
              lines={[{ key: "Balance", label: "Balance del mes", color: "purple", yAxis: "left" }]}
              height={240}
              leftAxisFormat={(v) => `${v}`}
              tooltipFormat={(v) => `${Number(v).toFixed(2)} m³`}
            />
          </ChartCard>
          {/* Rendimiento = tasa en el tiempo → línea (no barras): la pendiente ES
              la lectura. */}
          <ChartCard
            title="Rendimiento promedio por mes (%)"
            subtitle="Salida / entrada ponderado por volumen. Un salto brusco hacia arriba puede ser sobre-declaración (revisá Cumplimiento)."
          >
            <BulejeLineChart
              data={chartData}
              xKey="mes"
              series={[{ key: "Rendimiento", label: "Rendimiento" }]}
              height={240}
              showDots
              format={(v) => `${Number(v).toFixed(1)}%`}
            />
          </ChartCard>
        </div>
      )}

      {/* Lado de salida + composición del patio. */}
      {((tendencias && tendencias.length > 0) || stockData.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Producción vs despacho: el ciclo de salida. En unidades de producto
              (no m³) → chart aparte del flujo de materia prima para no mezclar. */}
          {tendencias && tendencias.length > 0 && (
            <ChartCard
              title="Producción vs. despacho por mes"
              subtitle="Lo transformado vs. lo que salió, en unidades de producto declaradas — va aparte del flujo (m³) para no mezclar unidades."
            >
              <BulejeComposedChart
                data={chartData}
                xKey="mes"
                bars={[
                  { key: "Producido", label: "Producido", color: "info", yAxis: "left" },
                  { key: "Despachado", label: "Despachado", color: "primary", yAxis: "left" },
                ]}
                height={240}
                leftAxisFormat={(v) => `${v}`}
                tooltipFormat={(v) => `${Number(v).toFixed(2)}`}
              />
            </ChartCard>
          )}

          {/* Composición del stock actual por especie: de qué está hecho el patio hoy. */}
          {stockData.length > 0 && (
            <ChartCard
              title="Stock de materia prima por especie"
              subtitle={`${n2(stockTotal)} m³ en patio hoy, repartidos entre ${stockData.length} ${stockData.length === 1 ? "especie" : "grupos de especie"}.`}
            >
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                <div className="w-full max-w-[15rem] shrink-0">
                  <BulejeDonutChart data={stockData} height={200} format={(v) => `${Number(v).toFixed(2)} m³`} />
                </div>
                {/* Leyenda con valor + % (identidad nunca por color solo — dataviz). */}
                <ul className="grid w-full flex-1 grid-cols-1 gap-1.5">
                  {stockData.map((s, i) => (
                    <li key={s.name} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5 text-sm">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES_PALETTE[i % SERIES_PALETTE.length] }} aria-hidden="true" />
                        <span className="truncate text-[var(--text-secondary)]">{s.name}</span>
                      </span>
                      <span className="shrink-0 font-mono tabular-nums text-[var(--text-tertiary)]">
                        {n2(s.value)} <span className="text-[length:var(--ts-2xs)]">({stockTotal > 0 ? Math.round((s.value / stockTotal) * 100) : 0}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
}

interface Resumen {
  monthsRecent: number; monthsPrior: number;
  ingresado: number; ingresadoDelta: number | null;
  producido: number; producidoDelta: number | null;
  rendimiento: number; rendimientoDelta: number | null;
}

/** Parte el rango de meses en dos mitades y compara reciente vs previo. */
function computeResumen(t: TendenciaMes[] | null): Resumen | null {
  if (!t || t.length === 0) return null;
  const mid = Math.floor(t.length / 2);
  const prior = t.slice(0, mid);
  const recent = t.slice(mid);
  const sum = (arr: TendenciaMes[], k: "ingresoM3" | "producido") => arr.reduce((a, x) => a + x[k], 0);
  // Rendimiento ponderado por volumen consumido (igual que el KPI de Producción).
  const wRend = (arr: TendenciaMes[]) => {
    let w = 0, p = 0;
    for (const x of arr) { if (x.rendimiento > 0 && x.consumidoM3 > 0) { w += x.rendimiento * x.consumidoM3; p += x.consumidoM3; } }
    return p > 0 ? w / p : 0;
  };
  const pctDelta = (a: number, b: number): number | null => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
  const ingR = sum(recent, "ingresoM3"), ingP = sum(prior, "ingresoM3");
  const prodR = sum(recent, "producido"), prodP = sum(prior, "producido");
  const rendR = wRend(recent), rendP = wRend(prior);
  return {
    monthsRecent: recent.length,
    monthsPrior: prior.length,
    ingresado: ingR, ingresadoDelta: pctDelta(ingR, ingP),
    producido: prodR, producidoDelta: pctDelta(prodR, prodP),
    rendimiento: rendR,
    // Delta en puntos porcentuales (un % no se compara en %).
    rendimientoDelta: rendR > 0 && rendP > 0 ? Math.round((rendR - rendP) * 10) / 10 : null,
  };
}

/** Tile de KPI con delta vs. tramo previo. tone="neutral" = la subida no implica
 *  "mejor" (ej. rendimiento, donde subir puede ser sobre-declaración). */
function DeltaStat({
  label, hint, value, unit, icon: Icon, delta, deltaSuffix, priorLabel, tone, spark,
}: {
  label: string; hint: string; value: string; unit: string;
  icon: typeof Layers; delta: number | null; deltaSuffix: string;
  priorLabel: string; tone: "directional" | "neutral"; spark?: number[];
}) {
  const up = delta != null && delta > 0;
  const DeltaIcon = delta == null || delta === 0 ? Minus : up ? TrendingUp : TrendingDown;
  const deltaCls =
    delta == null || delta === 0
      ? "text-[var(--text-tertiary)]"
      : tone === "neutral"
        ? "text-[var(--text-secondary)]"
        : up
          ? "text-[var(--data-success-700)]"
          : "text-[var(--data-error-700)]";
  // El sparkline colorea según dirección salvo en tone neutral (donde subir no es "mejor").
  const sparkTrend: "up" | "down" | "neutral" = tone === "neutral" || delta == null || delta === 0 ? "neutral" : up ? "up" : "down";
  const sparkData = spark && spark.length >= 2 && spark.some((v) => v > 0) ? spark : null;
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
        <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{value}</span>
          {unit && <span className="text-sm font-medium text-[var(--text-tertiary)]">{unit}</span>}
        </div>
        {sparkData && <div className="shrink-0"><BulejeSparkline data={sparkData} trend={sparkTrend} width={72} height={28} /></div>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className={`inline-flex items-center gap-1 text-xs font-bold ${deltaCls}`}>
          <DeltaIcon className="h-3.5 w-3.5" />
          {delta == null ? "sin base previa" : `${delta > 0 ? "+" : ""}${delta}${deltaSuffix}`}
        </span>
        {delta != null && <span className="text-xs text-[var(--text-tertiary)]">vs {priorLabel}</span>}
      </div>
      <div className="mt-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</div>
    </div>
  );
}

/** Marco de chart con título + leyenda opcional (dataviz: ≥2 series ⇒ leyenda). */
function ChartCard({ title, subtitle, legend, children }: {
  title: string; subtitle?: string;
  legend?: { label: string; color: string }[];
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">{title}</CardTitle>
        {legend && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {legend.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} aria-hidden="true" />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {subtitle && <p className="mb-2 text-xs text-[var(--text-tertiary)]">{subtitle}</p>}
      {children}
    </div>
  );
}

/** Estilos del banner de reposición por tono (mismo lenguaje que el resto del CTP). */
const REORDEN_BANNER: Record<"error" | "warning" | "success", { cls: string; Icon: typeof AlertCircle }> = {
  error: { cls: "bg-[var(--data-error-50)] text-[var(--data-error-700)]", Icon: AlertCircle },
  warning: { cls: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)]", Icon: AlertTriangle },
  success: { cls: "bg-[var(--data-success-50)] text-[var(--data-success-700)]", Icon: CheckCircle2 },
};

/** Síntesis en una línea: qué reponer y con qué urgencia. La más crítica, nombrada. */
function reordenBanner(insight: { criticas: (ReordenProyeccion & { diasHastaAgotar: number })[]; pronto: (ReordenProyeccion & { diasHastaAgotar: number })[] }): { tone: "error" | "warning" | "success"; text: string } {
  const { criticas, pronto } = insight;
  if (criticas.length > 0) {
    const top = criticas[0];
    const extra = criticas.length > 1 ? ` (+${criticas.length - 1} más)` : "";
    return { tone: "error", text: `${criticas.length} ${criticas.length === 1 ? "especie se agota" : "especies se agotan"} en ≤14 días — la más urgente: ${top.especie} en ${top.diasHastaAgotar} ${top.diasHastaAgotar === 1 ? "día" : "días"}${extra}. Reponé ya.` };
  }
  if (pronto.length > 0) {
    const names = pronto.slice(0, 3).map((r) => r.especie).join(", ");
    return { tone: "warning", text: `${pronto.length} ${pronto.length === 1 ? "especie" : "especies"} por reponer este mes: ${names}${pronto.length > 3 ? ` y ${pronto.length - 3} más` : ""}.` };
  }
  return { tone: "success", text: "Stock holgado — ninguna especie se agota en los próximos 30 días." };
}

function urgencia(dias: number | null): { label: string; cls: string } {
  if (dias == null) return { label: "no se agota", cls: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" };
  if (dias <= 14) return { label: `${dias} días`, cls: "bg-[var(--data-error-100)] text-[var(--data-error-700)]" };
  if (dias <= 30) return { label: `${dias} días`, cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]" };
  return { label: `${dias} días`, cls: "bg-[var(--data-success-100)] text-[var(--data-success-700)]" };
}

function mesCorto(ym: string): string {
  const [y, m] = ym.split("-");
  const nombres = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${nombres[Number(m)] ?? m}'${y.slice(2)}`;
}
