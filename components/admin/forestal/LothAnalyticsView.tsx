"use client";

/**
 * LothAnalyticsView — la lectura del aprovechamiento del LO-TH.
 *
 * Rediseño 2026-07-22. La versión anterior era una pila de cinco cajas del
 * mismo peso visual (KPIs planos, "cascada", dos tablas por especie y un
 * bloque de costeo con la configuración adentro): todo pesaba igual, así que
 * nada se leía primero, y el funnel presentaba como pérdida del 45% lo que era
 * una bifurcación del flujo.
 *
 * Ahora el contenido está en tres niveles:
 *   1. VEREDICTO — ¿el libro está para mostrar o para corregir?
 *   2. FLUJO — ¿dónde terminó cada m³ y dónde se perdió?
 *   3. DETALLE — rentabilidad por especie y el cuadro por especie.
 *
 * El modelo del flujo y el ranking viven en `lib/forestal/loth-analitica.ts`
 * (puro, con tests). La configuración de costos se movió a un modal: es un
 * ajuste ocasional que ocupaba un tercio del panel.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, AlertTriangle, TrendingUp, Gauge, Coins, CalendarClock,
  Calculator, Save, Download, Ban, TreePine,
} from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  construirFlujo, rankingRentabilidad, veredictoLibro, type CosteoRowRaw,
} from "@/lib/forestal/loth-analitica";
import { FlujoPanel, Kpi, RankingPanel, VeredictoBanner, fm } from "./loth-analitica-piezas";

interface Funnel {
  taladoM3: number; trozadoM3: number; despachoTrozaM3: number;
  consumidoM3: number; productoCantidad: number; despachoProductoM3: number;
}
interface Analytics {
  hasPlan: boolean;
  plan: { id: string; planNumber: string | null; titularName: string; estado: string; vigenciaHasta: string | null; costos: { extraccionM3: number; transformacionM3: number; fleteM3: number } } | null;
  aprovechamiento: { funnel: Funnel; bySpecies: { species: string; cites: boolean; taladoM3: number; trozadoM3: number; rendimientoPct: number; mermaM3: number }[]; rendimientoGlobalPct: number };
  balance: { rows: { species: string; movilizado: number; saldo: number; valorMovilizado: number }[]; pagoDerechoTotal: number; valorTotal: number } | null;
  anomalias: { level: "error" | "warn"; code: string; message: string; species?: string }[];
  projection: { ritmoDiaM3: number; diasParaAgotar: number; fechaAgotamientoISO: string | null } | null;
  lateCount: number;
  costeo: { rows: CosteoRowRaw[]; ingresoTotal: number; costoTotal: number; margenTotal: number; margenPctTotal: number; costoOperativoM3: number } | null;
  especiesNoAutorizadas?: string[];
}

const fdate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }) : "—");

// ─── Export CSV (BOM UTF-8 para Excel es-PE) ────────────────────────────────
function buildAnalyticsCsv(d: Analytics): string {
  const rows: (string | number)[][] = [];
  const push = (...cells: (string | number)[]) => rows.push(cells);
  push("Análisis del Libro de Operaciones · Títulos Habilitantes");
  push("Plan", d.plan?.titularName ?? "—", d.plan?.planNumber ?? "");
  push("");
  push("Indicador", "Valor");
  push("Rendimiento de aprovechamiento (%)", d.aprovechamiento.rendimientoGlobalPct);
  push("Valor movilizado (S/)", (d.balance?.valorTotal ?? 0).toFixed(2));
  push("Pago derecho total (S/)", (d.balance?.pagoDerechoTotal ?? 0).toFixed(2));
  push("Anomalías", d.anomalias.length);
  if ((d.especiesNoAutorizadas ?? []).length > 0) push("Especies fuera del plan", (d.especiesNoAutorizadas ?? []).join(" · "));
  push("");
  // El flujo se exporta con el mismo modelo que se dibuja: las dos ramas de la
  // bifurcación van marcadas como tales, no como pasos consecutivos.
  const flujo = construirFlujo(d.aprovechamiento.funnel);
  push("Flujo del aprovechamiento (m³)");
  push("Etapa", "m³", "% del total", "% de su origen");
  flujo.nodos.forEach((n) => push(n.label, n.m3.toFixed(4), n.pctDelTotal, n.pctDelPadre ?? ""));
  if (flujo.mermas.length > 0) {
    push("");
    push("Mermas", "m³", "%");
    flujo.mermas.forEach((m) => push(m.label, m.m3.toFixed(4), m.pct));
  }
  push("");
  push("Rendimiento por especie");
  push("Especie", "Talado m³", "Trozado m³", "Rendimiento %", "Merma m³");
  d.aprovechamiento.bySpecies.forEach((s) =>
    push(s.species, s.taladoM3.toFixed(4), s.trozadoM3.toFixed(4), s.rendimientoPct, s.mermaM3.toFixed(4)));
  if (d.balance) {
    push("");
    push("Valorización y saldo por especie");
    push("Especie", "Movilizado m³", "Saldo m³", "Valor movilizado S/");
    d.balance.rows.forEach((r) =>
      push(r.species, r.movilizado.toFixed(4), r.saldo.toFixed(4), r.valorMovilizado.toFixed(2)));
  }
  if (d.costeo && d.costeo.rows.length > 0) {
    push("");
    push("Costeo y margen por m³");
    push("Especie", "Precio/m³", "Costo/m³", "Margen/m³", "Margen %", "Margen total");
    d.costeo.rows.forEach((c) =>
      push(c.species, c.precioVentaM3.toFixed(2), c.costoTotalM3.toFixed(2), c.margenM3.toFixed(2), c.margenPct, c.margen.toFixed(2)));
    push("TOTAL", "", "", "", d.costeo.margenPctTotal, d.costeo.margenTotal.toFixed(2));
  }
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // BOM UTF-8 explícito para que Excel es-PE lea bien los acentos.
  return "﻿" + rows.map((r) => r.map((c) => esc(String(c))).join(",")).join("\r\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function LothAnalyticsView({ reloadSignal }: { reloadSignal?: number } = {}) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costForm, setCostForm] = useState({ extraccionM3: "", transformacionM3: "", fleteM3: "" });
  const [savingCosts, setSavingCosts] = useState(false);
  const [costosAbierto, setCostosAbierto] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/plan?analytics=1", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      const a: Analytics = (await r.json()).analytics;
      setData(a);
      if (a.plan?.costos) setCostForm({
        extraccionM3: a.plan.costos.extraccionM3 ? String(a.plan.costos.extraccionM3) : "",
        transformacionM3: a.plan.costos.transformacionM3 ? String(a.plan.costos.transformacionM3) : "",
        fleteM3: a.plan.costos.fleteM3 ? String(a.plan.costos.fleteM3) : "",
      });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, reloadSignal]);

  async function saveCosts() {
    if (!data?.plan?.id) return;
    setSavingCosts(true); setError(null);
    try {
      const r = await fetch("/api/admin/forestal/plan", {
        method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({
          id: data.plan.id,
          costoExtraccionM3: costForm.extraccionM3 ? Number(costForm.extraccionM3) : null,
          costoTransformacionM3: costForm.transformacionM3 ? Number(costForm.transformacionM3) : null,
          costoFleteM3: costForm.fleteM3 ? Number(costForm.fleteM3) : null,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      setCostosAbierto(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSavingCosts(false); }
  }

  const flujo = useMemo(() => (data ? construirFlujo(data.aprovechamiento.funnel) : null), [data]);
  const ranking = useMemo(() => (data?.costeo ? rankingRentabilidad(data.costeo.rows) : []), [data]);
  const veredicto = useMemo(() => {
    if (!data) return null;
    return veredictoLibro({
      errores: data.anomalias.filter((a) => a.level === "error").length,
      alertas: data.anomalias.filter((a) => a.level === "warn").length,
      especiesFueraDePlan: (data.especiesNoAutorizadas ?? []).length,
      saldoNegativo: (data.balance?.rows ?? []).some((r) => r.saldo < 0),
      diasParaAgotar: data.projection?.diasParaAgotar ?? null,
      margenPctTotal: data.costeo?.margenPctTotal ?? null,
    });
  }, [data]);

  /** Cuadro por especie: rendimiento y saldo eran dos tablas con la misma clave. */
  const porEspecie = useMemo(() => {
    if (!data) return [];
    const saldo = new Map((data.balance?.rows ?? []).map((r) => [r.species, r]));
    const nombres = new Set<string>([
      ...data.aprovechamiento.bySpecies.map((s) => s.species),
      ...(data.balance?.rows ?? []).map((r) => r.species),
    ]);
    return [...nombres].map((species) => {
      const ap = data.aprovechamiento.bySpecies.find((s) => s.species === species);
      const ba = saldo.get(species);
      return {
        species,
        cites: ap?.cites ?? false,
        taladoM3: ap?.taladoM3 ?? 0,
        trozadoM3: ap?.trozadoM3 ?? 0,
        rendimientoPct: ap?.rendimientoPct ?? null,
        mermaM3: ap?.mermaM3 ?? 0,
        movilizado: ba?.movilizado ?? 0,
        saldo: ba?.saldo ?? null,
        valorMovilizado: ba?.valorMovilizado ?? 0,
      };
    }).sort((a, b) => b.movilizado - a.movilizado || b.taladoM3 - a.taladoM3);
  }, [data]);

  if (loading && !data) return <div className="p-8 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Calculando…</p></div>;
  if (error && !data) return <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>;
  if (!data || !flujo || !veredicto) return null;

  const rendGlobal = data.aprovechamiento.rendimientoGlobalPct;
  const dias = data.projection?.diasParaAgotar ?? null;
  const margenPct = data.costeo?.margenPctTotal ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-tertiary)]">
          {data.hasPlan
            ? <>Plan activo: <b className="text-[var(--text-secondary)]">{data.plan?.titularName}</b>{data.plan?.planNumber ? ` · ${data.plan.planNumber}` : ""}</>
            : "Sin plan activo — la proyección y el balance requieren un Plan de Manejo configurado."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {data.hasPlan && (
            <button type="button" onClick={() => setCostosAbierto(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
              <Calculator className="h-4 w-4" /> Costos operativos
            </button>
          )}
          <button type="button" onClick={() => downloadCsv(`analitica-libro-th-${(data.plan?.planNumber ?? "sin-plan").replace(/[^\w-]+/g, "-")}.csv`, buildAnalyticsCsv(data))} className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Download className="h-4 w-4" /> CSV</button>
          <button type="button" onClick={load} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar</button>
        </div>
      </div>

      {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">{error}</div>}

      {/* 1 · VEREDICTO */}
      <VeredictoBanner v={veredicto} />

      {(data.especiesNoAutorizadas ?? []).length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <b>Especie(s) con operaciones fuera del plan autorizado:</b>{" "}
            {(data.especiesNoAutorizadas ?? []).join(", ")}. Aprovechar una especie que no figura en la resolución es infracción — regularizá el plan o el registro.
          </div>
        </div>
      )}

      {/* Anomalías concretas, si las hay: las graves primero. */}
      {data.anomalias.length > 0 && (
        <div className="space-y-2">
          {[...data.anomalias].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1)).map((a, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3 text-sm ${a.level === "error" ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]" : "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"}`}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div><b className="uppercase tracking-wide text-[length:var(--ts-2xs)]">{a.level === "error" ? "Grave" : "Alerta"}</b> · {a.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* KPIs con contexto: cada número dice contra qué se compara. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Rendimiento de trozado" valor={`${rendGlobal}`} sufijo="%"
          contexto={rendGlobal >= 60 ? "Por encima del 60% esperado para trozado" : "Por debajo del 60% que se espera del trozado"}
          icon={TrendingUp} tono={rendGlobal >= 60 ? "success" : "warning"} barra={rendGlobal}
        />
        <Kpi
          label="Valor movilizado" valor={`S/ ${fm(data.balance?.valorTotal ?? 0)}`}
          contexto={`Derecho de aprovechamiento a pagar: S/ ${fm(data.balance?.pagoDerechoTotal ?? 0)}`}
          icon={Coins}
        />
        <Kpi
          label="Margen del aprovechamiento"
          valor={margenPct != null ? `${margenPct}` : "—"} sufijo={margenPct != null ? "%" : undefined}
          contexto={data.costeo ? `S/ ${fm(data.costeo.margenTotal)} sobre S/ ${fm(data.costeo.ingresoTotal)} de ingreso` : "Cargá precios y costos para verlo"}
          icon={Gauge}
          tono={margenPct == null ? "neutral" : margenPct >= 25 ? "success" : margenPct >= 0 ? "warning" : "error"}
          barra={margenPct != null ? Math.max(0, margenPct) : null}
        />
        <Kpi
          label="Saldo autorizado" valor={dias != null ? `${dias}` : "—"} sufijo={dias != null ? "días" : undefined}
          contexto={dias != null ? `Al ritmo actual se agota el ${fdate(data.projection?.fechaAgotamientoISO ?? null)}` : "Sin ritmo de extracción todavía"}
          icon={CalendarClock} tono={dias != null && dias < 60 ? "warning" : "neutral"}
        />
      </div>

      {/* 2 · FLUJO */}
      <FlujoPanel f={flujo} />

      {/* 3 · DETALLE — rentabilidad por especie */}
      {data.hasPlan && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle as="h3" className="text-base text-[var(--text-primary)]">¿Qué especie deja plata?</CardTitle>
            {data.costeo && (
              <span className="text-xs text-[var(--text-tertiary)]">
                Margen total <b className={`font-mono tabular-nums ${data.costeo.margenTotal >= 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"}`}>S/ {fm(data.costeo.margenTotal)}</b> · costo operativo S/ {fm(data.costeo.costoOperativoM3)}/m³
              </span>
            )}
          </div>
          {ranking.length > 0 ? (
            <RankingPanel rows={ranking} />
          ) : (
            <p className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-6 text-center text-sm text-[var(--text-tertiary)]">
              Cargá el precio de venta en las especies del plan y los costos operativos para ver el margen.
            </p>
          )}
        </section>
      )}

      {/* Cuadro por especie: rendimiento + saldo en una sola tabla. */}
      {porEspecie.length > 0 && (
        <section className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]">
          <div className="flex flex-wrap items-center gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
            <TreePine className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            <CardTitle as="h3" className="text-sm text-[var(--text-primary)]">Cuadro por especie</CardTitle>
            <span className="text-xs text-[var(--text-tertiary)]">— lo talado, lo que rindió y cuánto queda autorizado</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-sunken)] text-left">
              <tr>
                <Th>Especie</Th>
                <Th className="text-right">Talado (m³)</Th>
                <Th className="text-right">Trozado (m³)</Th>
                <Th className="text-right">Rendimiento</Th>
                <Th className="text-right">Movilizado (m³)</Th>
                <Th className="text-right">Saldo (m³)</Th>
                <Th className="text-right">Valor movilizado</Th>
              </tr>
            </thead>
            <tbody>
              {porEspecie.map((s) => (
                <tr key={s.species} className="border-t border-[var(--rule-soft)]">
                  <Td>
                    <span className="font-medium text-[var(--text-primary)]">{s.species}</span>
                    {s.cites && <span className="ml-2 rounded bg-[var(--data-error-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">CITES</span>}
                  </Td>
                  <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{s.taladoM3 > 0 ? fm(s.taladoM3, 4) : "—"}</Td>
                  <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">{s.trozadoM3 > 0 ? fm(s.trozadoM3, 4) : "—"}</Td>
                  <Td className="text-right">
                    {s.rendimientoPct != null && s.taladoM3 > 0 ? (
                      <span className={`font-mono font-bold tabular-nums ${s.rendimientoPct >= 60 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}>{s.rendimientoPct}%</span>
                    ) : <span className="text-[var(--text-tertiary)]">—</span>}
                  </Td>
                  <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{fm(s.movilizado, 4)}</Td>
                  <Td className="text-right font-mono tabular-nums">
                    {s.saldo == null ? <span className="text-[var(--text-tertiary)]">—</span> : (
                      <span className={s.saldo < 0 ? "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]"}>{fm(s.saldo, 4)}</span>
                    )}
                  </Td>
                  <Td className="text-right font-mono tabular-nums text-[var(--text-primary)]">S/ {fm(s.valorMovilizado)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Costos operativos: ajuste ocasional, en modal (antes ocupaba un tercio
          del panel de costeo, entre los KPI y la tabla). */}
      <AdminModal
        open={costosAbierto}
        onClose={() => setCostosAbierto(false)}
        title="Costos operativos por m³"
        description="Se aplican a todas las especies para calcular el margen. El derecho (VEN) sale de cada especie del plan."
        icon={Calculator}
        variant="wide"
      >
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <CostInput label="Extracción" hint="tala + arrastre + patio" value={costForm.extraccionM3} onChange={(v) => setCostForm((f) => ({ ...f, extraccionM3: v }))} />
            <CostInput label="Transformación" hint="aserrío" value={costForm.transformacionM3} onChange={(v) => setCostForm((f) => ({ ...f, transformacionM3: v }))} />
            <CostInput label="Flete" hint="transporte a destino" value={costForm.fleteM3} onChange={(v) => setCostForm((f) => ({ ...f, fleteM3: v }))} />
          </div>
          <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Margen por m³ = precio de venta − (derecho VEN + extracción + transformación + flete).
            {data.costeo && <> Hoy el costo operativo suma <b className="font-mono tabular-nums">S/ {fm(data.costeo.costoOperativoM3)}</b> por m³.</>}
          </p>
          <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-3">
            <button type="button" onClick={() => setCostosAbierto(false)} className="h-11 rounded-xl px-4 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button type="button" onClick={saveCosts} disabled={savingCosts} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:bg-[var(--accent-600)] disabled:opacity-50">
              {savingCosts ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar costos
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

function CostInput({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">{label} <span className="font-normal text-[var(--text-tertiary)]">(S/ por m³)</span></span>
      <input type="number" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]" />
      <span className="mt-1 block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</span>
    </label>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}
