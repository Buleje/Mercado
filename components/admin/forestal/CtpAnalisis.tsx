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
  Boxes,
  Layers,
  Minus,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
} from "@buleje/design-system/icons";
import { BulejeBarChart } from "@/components/ui-system/charts";
import { SERIES_PALETTE } from "@/components/ui-system/charts/palette";
import type { ReordenProyeccion, TendenciaMes } from "@/lib/db/forest-ctp.db";

const n2 = (v: number) => v.toFixed(2);

export default function CtpAnalisis() {
  const [reorden, setReorden] = useState<ReordenProyeccion[] | null>(null);
  const [tendencias, setTendencias] = useState<TendenciaMes[] | null>(null);
  const [loading, setLoading] = useState(true);
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
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const resumen = useMemo(() => computeResumen(tendencias), [tendencias]);
  const chartData = useMemo(
    () => (tendencias ?? []).map((t) => ({
      mes: mesCorto(t.mes),
      Ingresado: t.ingresoM3,
      Consumido: t.consumidoM3,
      Rendimiento: t.rendimiento,
    })),
    [tendencias],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--text-tertiary)]">Reorden predictivo (¿cuándo me quedo sin madera?) y tendencias de los últimos 6 meses. Derivado del libro, sin configurar nada.</p>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar</button>
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}
      {loading && !reorden && <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Calculando…</p></div>}

      {/* Resumen ejecutivo: tramo reciente vs tramo previo (mitades del rango cargado). */}
      {resumen && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <DeltaStat label="Ingresado" hint={`suma últimos ${resumen.monthsRecent}m`} value={n2(resumen.ingresado)} unit="m³" icon={Layers} delta={resumen.ingresadoDelta} deltaSuffix="%" priorLabel={`${resumen.monthsPrior}m previos`} tone="directional" />
          <DeltaStat label="Producido" hint={`suma últimos ${resumen.monthsRecent}m`} value={n2(resumen.producido)} unit="" icon={Boxes} delta={resumen.producidoDelta} deltaSuffix="%" priorLabel={`${resumen.monthsPrior}m previos`} tone="directional" />
          <DeltaStat label="Rendimiento prom." hint={`ponderado últimos ${resumen.monthsRecent}m`} value={resumen.rendimiento.toFixed(1)} unit="%" icon={Scale} delta={resumen.rendimientoDelta} deltaSuffix=" pts" priorLabel={`${resumen.monthsPrior}m previos`} tone="neutral" />
        </div>
      )}

      {reorden && (
        <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <div className="border-b-2 border-[var(--rule-base)] px-4 py-3">
            <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><TrendingUp className="h-4 w-4" /> Reorden predictivo de materia prima</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Días de stock al ritmo de consumo de los últimos 90 días. Repone antes de que llegue a cero.</p>
          </div>
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
                {reorden.map((r) => {
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
          <ChartCard
            title="Flujo mensual de materia prima (m³)"
            subtitle="Ingresado vs. consumido en producción — si consumís más de lo que entra, el saldo cae."
            legend={[{ label: "Ingresado", color: SERIES_PALETTE[0] }, { label: "Consumido", color: SERIES_PALETTE[1] }]}
          >
            <BulejeBarChart
              data={chartData}
              xKey="mes"
              series={[{ key: "Ingresado", label: "Ingresado" }, { key: "Consumido", label: "Consumido" }]}
              height={220}
              barSize={18}
              format={(v) => `${Number(v).toFixed(2)} m³`}
            />
          </ChartCard>
          <ChartCard
            title="Rendimiento promedio por mes (%)"
            subtitle="Salida / entrada ponderado por volumen. Un salto brusco hacia arriba puede ser sobre-declaración (revisá Cumplimiento)."
          >
            <BulejeBarChart
              data={chartData}
              xKey="mes"
              series={[{ key: "Rendimiento", label: "Rendimiento" }]}
              height={220}
              barSize={26}
              format={(v) => `${Number(v).toFixed(1)}%`}
            />
          </ChartCard>
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
  label, hint, value, unit, icon: Icon, delta, deltaSuffix, priorLabel, tone,
}: {
  label: string; hint: string; value: string; unit: string;
  icon: typeof Layers; delta: number | null; deltaSuffix: string;
  priorLabel: string; tone: "directional" | "neutral";
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
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
        <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{value}</span>
        {unit && <span className="text-sm font-medium text-[var(--text-tertiary)]">{unit}</span>}
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
