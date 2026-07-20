"use client";

/**
 * CtpRentabilidadPanel — P&L del período (ADR-141): venta − COGS = margen.
 * Convierte el libro de compliance en herramienta de gestión. El COGS ya se
 * deriva de la cadena (y se congela al cierre → márgenes estables); acá se
 * captura el valor de venta y se compone el margen, honesto: sin venta o sin
 * costo ⇒ margen desconocido (NUNCA 0).
 */

import { useCallback, useEffect, useState } from "react";
import { CardTitle, StatCard } from "@buleje/design-system";
import { AlertCircle, CheckCircle2, Coins, Loader2, TrendingUp, Wallet } from "@buleje/design-system/icons";
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

  if (error && !pnl) return <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Error:</strong> {error}</div></div>;
  if (!pnl) return <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando P&L…</p>;

  return (
    <div className="space-y-5">
      {error && <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div>{error}</div></div>}

      {/* Resumen — StatCard del DS (mismo patrón que Ingresos/Producción/Saldos) */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard icon={Coins} label="Ventas" value={money(pnl.ventasTotal, pnl.moneda)} subValue={`${pnl.completos} despachos costeados`} emphasis="neutral" />
        <StatCard icon={Wallet} label="COGS" value={money(pnl.cogsTotal, pnl.moneda)} subValue="costo de lo vendido" emphasis="neutral" />
        <StatCard icon={TrendingUp} label="Margen" value={money(pnl.margenTotal, pnl.moneda)} subValue={pct(pnl.margenPct)} emphasis={pnl.margenTotal < 0 ? "error" : "success"} />
        <StatCard icon={AlertCircle} label="Incompletos" value={`${pnl.sinVenta + pnl.sinCosto}`} subValue={`${pnl.sinVenta} sin venta · ${pnl.sinCosto} sin costo`} emphasis={pnl.sinVenta + pnl.sinCosto > 0 ? "warning" : "neutral"} />
      </div>

      {(pnl.sinVenta > 0 || pnl.sinCosto > 0) && (
        <p className="rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-xs text-[var(--data-warning-700)]">El margen cubre solo los {pnl.completos} despachos con venta Y costo conocidos. {pnl.sinVenta} sin valor de venta y {pnl.sinCosto} sin costo (falta factura o atribución) NO se suman — no se inventa margen.</p>
      )}

      {/* Por producto */}
      {pnl.porProducto.length > 0 && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle as="h3" className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Margen por producto</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-[var(--text-tertiary)]"><tr><th className="py-1.5 pr-2 font-bold">Producto</th><th className="py-1.5 px-2 text-right font-bold">Ventas</th><th className="py-1.5 px-2 text-right font-bold">COGS</th><th className="py-1.5 px-2 text-right font-bold">Margen</th><th className="py-1.5 pl-2 text-right font-bold">%</th></tr></thead>
              <tbody>
                {pnl.porProducto.map((p, i) => (
                  <tr key={i} className="border-t border-[var(--rule-soft)]">
                    <td className="py-1.5 pr-2 text-[var(--text-primary)]">{p.producto}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-secondary)]">{money(p.ventas, pnl.moneda)}</td>
                    <td className="py-1.5 px-2 text-right text-[var(--text-secondary)]">{money(p.cogs, pnl.moneda)}</td>
                    <td className={`py-1.5 px-2 text-right font-bold ${p.margen < 0 ? "text-[var(--data-error-700)]" : "text-[var(--text-primary)]"}`}>{money(p.margen, pnl.moneda)}</td>
                    <td className="py-1.5 pl-2 text-right text-[var(--text-secondary)]">{pct(p.margenPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                    <input inputMode="decimal" value={val} onChange={(e) => setDraft((dr) => ({ ...dr, [d.id]: e.target.value }))} placeholder="venta" className="h-11 w-28 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]" />
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

