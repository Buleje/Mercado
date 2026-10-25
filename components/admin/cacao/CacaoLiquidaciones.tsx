"use client";

/**
 * CacaoLiquidaciones — cuentas por pagar al productor. Worklist de quién tiene
 * saldo pendiente (liquidación − abonado), ordenado por lo que más se debe, con
 * pago batch (salda todos sus lotes o un monto parcial oldest-first) y atajo de
 * WhatsApp para coordinar el pago. Reusa la acción pago_acopio a nivel productor.
 * Brandon 2026-07-02.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  HandCoins, Coins, Users, RefreshCw, Download, AlertCircle, CheckCircle2, MessageCircle, Clock, ChevronDown,
} from "@buleje/design-system/icons";
import { DataTable, StatCard } from "@buleje/design-system";
import PagoLiquidacionModal from "./PagoLiquidacionModal";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna } from "@/components/admin/shared/use-orden-columna";
import { COLUMNAS_LIQUIDACIONES, ORDEN_LIQUIDACIONES, kgDe, type Grupo } from "./columnas-filtro-liquidaciones";
import { formatDate, formatNumber } from "@/lib/format";

interface Resp { groups: Grupo[]; totals: { productores: number; lotes: number; saldo: number } }

const n2 = (v: number) => formatNumber(v, 2);
const fdate = (iso: string | null) => { if (!iso) return "—"; try { return formatDate(iso, { soloFecha: true }); } catch { return iso; } };
const diasDesde = (iso: string | null) => { if (!iso) return null; const ms = Date.now() - new Date(iso).getTime(); return Math.max(0, Math.floor(ms / 86_400_000)); };
const waLink = (tel: string, nombre: string, saldo: number) => {
  const num = tel.replace(/\D/g, "");
  const full = num.length <= 9 ? `51${num}` : num;
  const msg = encodeURIComponent(`Hola ${nombre}, tengo lista tu liquidación de cacao por S/ ${n2(saldo)}. ¿Coordinamos el pago?`);
  return `https://wa.me/${full}?text=${msg}`;
};

export default function CacaoLiquidaciones() {
  const [groups, setGroups] = useState<Grupo[]>([]);
  const [totals, setTotals] = useState<Resp["totals"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<Grupo | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/admin/cacao?view=liquidaciones", { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: Resp = await r.json();
      setGroups(d.groups ?? []);
      setTotals(d.totals ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Orden de llegada = lo que más se debe primero; el clic en un título lo cambia.
  const base = useMemo(() => [...groups].sort((x, y) => y.totalSaldo - x.totalSaldo), [groups]);
  const f = useFiltrosTabla(base, COLUMNAS_LIQUIDACIONES);
  const ord = useOrdenColumna(ORDEN_LIQUIDACIONES);
  const view = ord.ordenar(f.filtradas);
  const sumaVista = useMemo(() => view.reduce((a, g) => ({ debido: a.debido + g.totalDebido, abonado: a.abonado + g.totalAbonado, saldo: a.saldo + g.totalSaldo, kg: a.kg + kgDe(g), lotes: a.lotes + g.nLotes }), { debido: 0, abonado: 0, saldo: 0, kg: 0, lotes: 0 }), [view]);

  // Deuda que más tiempo lleva esperando — priorizar por antigüedad, no solo monto.
  const aging = useMemo(() => {
    let maxDias = 0;
    let quien: string | null = null;
    for (const g of groups) {
      const d = diasDesde(g.oldest);
      if (d != null && d > maxDias) { maxDias = d; quien = g.nombre; }
    }
    return { maxDias, quien };
  }, [groups]);

  function exportCsv() {
    const head = ["Codigo", "Productor", "Sector", "Telefono", "Lotes pendientes", "Debido", "Abonado", "Saldo", "Deuda mas antigua"];
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = view.map((g) => [g.codigo, g.nombre, g.sector, g.telefono, g.nLotes, n2(g.totalDebido), n2(g.totalAbonado), n2(g.totalSaldo), g.oldest ? g.oldest.slice(0, 10) : ""].map(esc).join(","));
    const csv = "﻿" + [head.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `cacao-liquidaciones-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total a pagar" value={`S/ ${n2(totals?.saldo ?? 0)}`} subValue={(totals?.saldo ?? 0) > 0 ? "saldo pendiente" : "al día"} icon={Coins} emphasis={(totals?.saldo ?? 0) > 0 ? "warning" : "success"} />
        <StatCard label="Productores por pagar" value={String(totals?.productores ?? 0)} icon={Users} emphasis="neutral" />
        <StatCard label="Lotes pendientes" value={String(totals?.lotes ?? 0)} icon={HandCoins} emphasis="neutral" />
        <StatCard label="Deuda más antigua" value={aging.maxDias > 0 ? `${aging.maxDias} días` : "—"} subValue={aging.quien ?? "al día"} icon={Clock} emphasis={aging.maxDias >= 30 ? "warning" : "neutral"} />
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1" />
        <button type="button" onClick={exportCsv} disabled={view.length === 0} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Download className="h-4 w-4" />CSV</button>
        <button type="button" onClick={load} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><RefreshCw className="h-4 w-4" />Actualizar</button>
      </div>

      {loading && groups.length === 0 ? (
        <div className="rounded-2xl border border-[var(--rule-base)] p-10 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--data-success-50)] text-[var(--data-success-700)]"><CheckCircle2 className="h-7 w-7" /></span>
          <p className="text-base font-bold text-[var(--text-primary)]">Todo al día</p>
          <p className="mx-auto mt-1 max-w-sm text-sm">No le debes liquidación a ningún productor. Cada lote de acopio está pagado.</p>
        </div>
      ) : (
        <>
          <BarraFiltrosTabla vistas="cacao-liquidaciones" f={f} />
          <div className="overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
            <DataTable className="w-full">
              <thead>
                <tr>
                  <ThColumna label="Productor" ids={["productor"]} f={f} orden={ord} ordenId="productor" />
                  <ThColumna label="Lotes" ids={["lotes"]} f={f} derecha orden={ord} ordenId="lotes" />
                  <ThColumna label="Kg" ids={["kg"]} f={f} derecha orden={ord} ordenId="kg" />
                  <ThColumna label="A pagar" ids={["debido"]} f={f} derecha orden={ord} ordenId="debido" />
                  <ThColumna label="Pagado" ids={["abonado"]} f={f} derecha orden={ord} ordenId="abonado" />
                  <ThColumna label="Saldo" ids={["saldo"]} f={f} derecha orden={ord} ordenId="saldo" />
                  <ThColumna label="Desde" ids={["desde"]} f={f} derecha orden={ord} ordenId="desde" />
                  <th data-label="Acciones"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {view.length === 0 && <SinCoincidenciasFila colSpan={8} />}
                {view.map((g) => {
                  const dias = diasDesde(g.oldest);
                  const isOpen = expanded === g.producerId;
                  return (
                    <Fragment key={g.producerId}>
                      <tr>
                        <td>
                          <button type="button" onClick={() => setExpanded(isOpen ? null : g.producerId)} className="flex items-center gap-2 text-left" aria-expanded={isOpen} aria-label={`Ver lotes de ${g.nombre}`}>
                            <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                            <span>
                              <span className="block font-medium text-[var(--text-primary)]">{g.nombre}</span>
                              <span className="block text-xs text-[var(--text-tertiary)]"><span className="font-mono">{g.codigo ?? "—"}</span>{g.sector ? ` · ${g.sector}` : ""}</span>
                            </span>
                          </button>
                        </td>
                        <td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{g.nLotes}</td>
                        <td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(kgDe(g))}</td>
                        <td className="whitespace-nowrap text-right font-mono tabular-nums text-[var(--text-secondary)]">S/ {n2(g.totalDebido)}</td>
                        <td className="whitespace-nowrap text-right font-mono tabular-nums text-[var(--text-secondary)]">S/ {n2(g.totalAbonado)}</td>
                        <td className="whitespace-nowrap text-right font-mono font-bold tabular-nums text-[var(--data-warning-700)]">S/ {n2(g.totalSaldo)}</td>
                        <td className="whitespace-nowrap text-right text-xs text-[var(--text-tertiary)]">
                          {fdate(g.oldest)}
                          {dias != null && dias >= 30 && (
                            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]"><Clock className="h-3 w-3" />{dias} días</span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-2">
                            {g.telefono && (
                              <a href={waLink(g.telefono, g.nombre, g.totalSaldo)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]" aria-label={`WhatsApp a ${g.nombre}`}><MessageCircle className="h-4 w-4" /></a>
                            )}
                            <button type="button" onClick={() => setPayFor(g)} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-sm hover:opacity-90"><HandCoins className="h-4 w-4" />Pagar</button>
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} className="bg-[var(--surface-sunken)]">
                            <DataTable className="w-full text-sm">
                              <thead><tr className="text-left text-xs text-[var(--text-tertiary)]"><th className="py-1 font-bold">Lote</th><th className="py-1 font-bold">Fecha</th><th className="py-1 text-right font-bold">Kg</th><th className="py-1 text-right font-bold">Debido</th><th className="py-1 text-right font-bold">Abonado</th><th className="py-1 text-right font-bold">Saldo</th></tr></thead>
                              <tbody>
                                {g.lotes.map((l) => (
                                  <tr key={l.id} className="border-t border-[var(--rule-soft)]">
                                    <td className="py-1.5 font-mono text-xs text-[var(--text-secondary)]">{l.loteCode ?? l.id.slice(0, 6)}</td>
                                    <td className="py-1.5 text-xs text-[var(--text-tertiary)]">{fdate(l.fecha)}</td>
                                    <td className="py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(l.kg)}</td>
                                    <td className="py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(l.total)}</td>
                                    <td className="py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{n2(l.abonado)}</td>
                                    <td className="py-1.5 text-right font-mono font-bold tabular-nums text-[var(--data-warning-700)]">{n2(l.saldo)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </DataTable>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              {view.length > 0 && (
                <tfoot>
                  <tr className="font-bold text-[var(--text-primary)]">
                    <td>{f.activos > 0 ? "Total de lo que se ve" : "Total"} · {view.length} productor{view.length === 1 ? "" : "es"}</td>
                    <td className="text-right font-mono tabular-nums">{sumaVista.lotes}</td>
                    <td className="text-right font-mono tabular-nums">{n2(sumaVista.kg)}</td>
                    <td className="whitespace-nowrap text-right font-mono tabular-nums">S/ {n2(sumaVista.debido)}</td>
                    <td className="whitespace-nowrap text-right font-mono tabular-nums">S/ {n2(sumaVista.abonado)}</td>
                    <td className="whitespace-nowrap text-right font-mono tabular-nums text-[var(--data-warning-700)]">S/ {n2(sumaVista.saldo)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </DataTable>
          </div>
        </>
      )}

      {payFor && <PagoLiquidacionModal grupo={payFor} onClose={() => setPayFor(null)} onPaid={() => { setPayFor(null); load(); }} />}
    </div>
  );
}
