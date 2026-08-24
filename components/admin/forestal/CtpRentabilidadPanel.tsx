"use client";

/**
 * CtpRentabilidadPanel — P&L del período (ADR-141): venta − COGS = margen.
 * Convierte el libro de compliance en herramienta de gestión. El COGS ya se
 * deriva de la cadena (y se congela al cierre → márgenes estables); acá se
 * captura el valor de venta y se compone el margen, honesto: sin venta o sin
 * costo ⇒ margen desconocido (NUNCA 0).
 */

import { useCallback, useEffect, useState } from "react";
import { CardTitle, DataTable, StatCard } from "@buleje/design-system";
import { PanelSkeleton } from "./ctp-shared";
import { AlertCircle, Award, CheckCircle2, Coins, Loader2, Sparkles, TrendingDown, TrendingUp, Wallet } from "@buleje/design-system/icons";
import { BulejeWaterfallChart, type WaterfallStep } from "@/components/ui-system/charts";
import CtpValorizarIngresos from "./CtpValorizarIngresos";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";

interface PnlDespacho { id: string; lineNo: number; producto: string; gtfSalida: string | null; valorVenta: number | null; cogs: number | null; margen: number | null; margenPct: number | null; motivo: string }
interface Pnl {
  despachos: number; completos: number; sinVenta: number; sinCosto: number;
  ventasTotal: number; cogsTotal: number; margenTotal: number; margenPct: number | null; moneda: string;
  porProducto: { producto: string; ventas: number; cogs: number; margen: number; margenPct: number | null }[];
  porDespacho: PnlDespacho[];
}

const CTP = "/api/admin/forestal/ctp";
const money = (n: number | null, m = "PEN") => n == null ? "—" : `${m === "PEN" ? "S/" : m} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => n == null ? "—" : `${n.toLocaleString("es-PE", { maximumFractionDigits: 1 })}%`;
const MOTIVO_LABEL: Record<string, string> = { sin_venta: "sin valor de venta", sin_costo: "sin costo (falta factura)", sin_atribucion: "sin origen atribuido", falta_costo: "falta factura de una guía", monedas_mezcladas: "monedas mezcladas", sin_cantidad: "sin cantidad" };

export default function CtpRentabilidadPanel({ period }: { period: CtpPeriod }) {
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ pnl: "1" });
      if (period.from) p.set("from", period.from);
      if (period.to) p.set("to", period.to);
      const r = await fetch(`${CTP}?${p}`, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setPnl(j.pnl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPnl(null);
    }
  }, [period.from, period.to]);
  useEffect(() => { void load(); }, [load]);

  /** Cuántos valores están tipeados y todavía no viajaron al servidor. */
  const pendientes = Object.keys(draft).length;

  /**
   * Guarda todo lo tipeado de una. Un panel de dinero NO auto-guarda —un
   * número a medio escribir se convertiría en el margen del mes—, pero perder
   * lo tipeado por cambiar de pestaña tampoco: por eso el aviso y este botón.
   */
  async function saveTodo() {
    for (const id of Object.keys(draft)) await saveVenta(id);
  }

  async function saveVenta(id: string) {
    const raw = draft[id];
    if (raw === undefined) return;
    const valorVenta = raw.trim() === "" ? null : Number(raw);
    if (valorVenta != null && !Number.isFinite(valorVenta)) { setError("Valor de venta inválido"); return; }
    setSavingId(id); setError(null);
    try {
      const r = await fetch(CTP, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include", body: JSON.stringify({ id, action: "set_venta", valorVenta }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setDraft((d) => { const n = { ...d }; delete n[id]; return n; });
      await load(); // recomputa totales
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }

  // Recargar o cerrar la pestaña con valores sin guardar pide confirmación: el
  // navegador no deja personalizar el texto, pero sí evita perderlos de golpe.
  useEffect(() => {
    if (pendientes === 0) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [pendientes]);

  if (error && !pnl) return <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Error:</strong> {error}</div></div>;
  if (!pnl) return <PanelSkeleton kpis={4} />;

  // Ranking + insight: qué producto deja plata y cuál la pierde. Se ordena por
  // margen (desc); el detalle de la tabla usa una barra proporcional al mayor
  // margen absoluto para leer la magnitud de un vistazo.
  const ranked = [...pnl.porProducto].sort((a, b) => b.margen - a.margen);
  const best = ranked[0] ?? null;
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  const maxAbsMargen = Math.max(1, ...ranked.map((p) => Math.abs(p.margen)));

  // Cascada del P&L: Ventas − COGS = Margen (solo con despachos completos).
  const waterfall: WaterfallStep[] = [
    { label: "Ventas", value: pnl.ventasTotal, type: "positive" },
    { label: "COGS", value: -pnl.cogsTotal, type: "negative" },
    { label: "Margen", value: pnl.margenTotal, type: "total" },
  ];
  const cur = pnl.moneda === "PEN" ? "S/" : pnl.moneda;

  return (
    <div className="space-y-5">
      {/* Lo tipeado y no guardado, dicho: antes se perdía al cambiar de pestaña
          sin que nada avisara. */}
      {pendientes > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-3 text-sm font-medium text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            {pendientes} valor(es) de venta sin guardar. Se pierden si salís de la pestaña.
          </span>
          <button
            type="button"
            onClick={() => void saveTodo()}
            disabled={savingId !== null}
            className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg border-2 border-[var(--data-warning-500)] px-3 text-sm font-bold text-[var(--data-warning-700)] hover:bg-[var(--data-warning-100)] disabled:opacity-50 dark:text-[var(--data-warning-500)] dark:hover:bg-transparent"
          >
            {savingId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
            Guardar todo
          </button>
        </div>
      )}

      {error && <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div>{error}</div></div>}

      {/* Resumen — StatCard del DS (mismo patrón que Ingresos/Producción/Saldos) */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard density="compact" icon={Coins} label="Ventas" value={money(pnl.ventasTotal, pnl.moneda)} subValue={`${pnl.completos} despachos costeados`} emphasis="neutral" />
        <StatCard density="compact" icon={Wallet} label="COGS" value={money(pnl.cogsTotal, pnl.moneda)} subValue="costo de lo vendido" emphasis="neutral" />
        <StatCard density="compact" icon={TrendingUp} label="Margen" value={money(pnl.margenTotal, pnl.moneda)} subValue={pct(pnl.margenPct)} emphasis={pnl.margenTotal < 0 ? "error" : "success"} />
        <StatCard density="compact" icon={AlertCircle} label="Incompletos" value={`${pnl.sinVenta + pnl.sinCosto}`} subValue={`${pnl.sinVenta} sin venta · ${pnl.sinCosto} sin costo`} emphasis={pnl.sinVenta + pnl.sinCosto > 0 ? "warning" : "neutral"} />
      </div>

      {(pnl.sinVenta > 0 || pnl.sinCosto > 0) && (
        <p className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-xs text-[var(--data-warning-700)]">El margen cubre solo los {pnl.completos} despachos con venta Y costo conocidos. {pnl.sinVenta} sin valor de venta y {pnl.sinCosto} sin costo (falta factura o atribución) NO se suman — no se inventa margen.</p>
      )}

      {/* Insight accionable: mejor y peor producto del período. */}
      {pnl.completos > 0 && best && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <span className="inline-flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--data-success-600)]" />
            <span className="text-[var(--text-tertiary)]">Más rentable:</span>
            <strong className="text-[var(--text-primary)]">{best.producto}</strong>
            <span className="font-bold text-[var(--data-success-700)]">{money(best.margen, pnl.moneda)}{best.margenPct != null ? ` · ${pct(best.margenPct)}` : ""}</span>
          </span>
          {worst && (
            <span className="inline-flex items-center gap-2 text-sm">
              {worst.margen < 0 ? <TrendingDown className="h-4 w-4 shrink-0 text-[var(--data-error-600)]" /> : <TrendingUp className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />}
              <span className="text-[var(--text-tertiary)]">{worst.margen < 0 ? "Pierde plata:" : "Menor margen:"}</span>
              <strong className="text-[var(--text-primary)]">{worst.producto}</strong>
              <span className={`font-bold ${worst.margen < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-secondary)]"}`}>{money(worst.margen, pnl.moneda)}{worst.margenPct != null ? ` · ${pct(worst.margenPct)}` : ""}</span>
            </span>
          )}
        </div>
      )}

      {/* Cascada del P&L: Ventas − COGS = Margen, de un vistazo. */}
      {pnl.completos > 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle as="h3" className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Cómo se compone el margen</CardTitle>
          <BulejeWaterfallChart steps={waterfall} currency={cur} height={230} />
        </div>
      )}

      {/* Por producto */}
      {pnl.porProducto.length > 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle as="h3" className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Margen por producto</CardTitle>
          <div className="overflow-x-auto">
            <DataTable className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[var(--text-tertiary)]"><tr><th className="py-1.5 pr-2 font-bold">Producto</th><th className="py-1.5 px-2 text-right font-bold">Ventas</th><th className="py-1.5 px-2 text-right font-bold">COGS</th><th className="py-1.5 px-2 text-right font-bold">Margen</th><th className="py-1.5 pl-2 text-right font-bold">%</th></tr></thead>
              <tbody>
                {ranked.map((p, i) => (
                  <tr key={i} className="border-t border-[var(--rule-soft)]">
                    <td className="py-1.5 pr-2 align-top">
                      <div className="flex items-center gap-1.5">
                        {i === 0 && ranked.length > 1 && p.margen > 0 && <Award className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-600)]" aria-label="más rentable" />}
                        <span className="text-[var(--text-primary)]">{p.producto}</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                        <div className={`h-full rounded-full ${p.margen < 0 ? "bg-[var(--data-error-500)]" : "bg-[var(--data-success-500)]"}`} style={{ width: `${Math.max(4, (Math.abs(p.margen) / maxAbsMargen) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right align-top text-[var(--text-secondary)]">{money(p.ventas, pnl.moneda)}</td>
                    <td className="py-1.5 px-2 text-right align-top text-[var(--text-secondary)]">{money(p.cogs, pnl.moneda)}</td>
                    <td className={`py-1.5 px-2 text-right align-top font-bold ${p.margen < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{money(p.margen, pnl.moneda)}</td>
                    <td className="py-1.5 pl-2 text-right align-top text-[var(--text-secondary)]">{pct(p.margenPct)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </div>
      )}

      {/* La entrada del circuito: qué costó la madera. Va ANTES de la venta
          porque es la mitad que faltaba —el COGS sale de acá— y porque el
          orden en pantalla es el del negocio: primero se compra, después se
          vende. */}
      <CtpValorizarIngresos period={period} />

      {/* Por despacho — venta editable */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <CardTitle as="h3" className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Despachos del período · registrá el valor de venta</CardTitle>
        {pnl.porDespacho.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">No hay despachos en el período.</p>
        ) : (
          <div className="space-y-2">
            {pnl.porDespacho.map((d) => {
              const val = draft[d.id] ?? (d.valorVenta != null ? String(d.valorVenta) : "");
              const dirty = draft[d.id] !== undefined;
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
                  <div className="min-w-[9rem] flex-1">
                    <p className="text-sm font-bold text-[var(--text-primary)]">#{d.lineNo} · {d.producto}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{d.gtfSalida ?? "sin GTF"} · COGS {money(d.cogs, pnl.moneda)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-[var(--text-tertiary)]">S/</span>
                    <input
                      inputMode="decimal"
                      value={val}
                      onChange={(e) => setDraft((dr) => ({ ...dr, [d.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); void saveVenta(d.id); }
                        if (e.key === "Escape") setDraft((dr) => { const n = { ...dr }; delete n[d.id]; return n; });
                      }}
                      aria-label={`Valor de venta del despacho ${d.id}`}
                      placeholder="venta" className="h-11 w-28 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]" />
                  </div>
                  <div className="min-w-[6rem] text-right">
                    <p className="text-xs text-[var(--text-tertiary)]">margen</p>
                    <p className={`text-sm font-bold ${d.margen == null ? "text-[var(--text-tertiary)]" : d.margen < 0 ? "text-[var(--data-error-700)]" : "text-[var(--data-success-700)]"}`} title={d.margen == null ? MOTIVO_LABEL[d.motivo] ?? d.motivo : ""}>{d.margen == null ? MOTIVO_LABEL[d.motivo] ?? "—" : `${money(d.margen, pnl.moneda)} · ${pct(d.margenPct)}`}</p>
                  </div>
                  <button type="button" onClick={() => void saveVenta(d.id)} disabled={savingId === d.id || !dirty} className="inline-flex h-11 items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40">
                    {savingId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Guardar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

