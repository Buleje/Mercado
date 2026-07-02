"use client";

/**
 * CacaoLiquidaciones — cuentas por pagar al productor. Worklist de quién tiene
 * saldo pendiente (liquidación − abonado), ordenado por lo que más se debe, con
 * pago batch (salda todos sus lotes o un monto parcial oldest-first) y atajo de
 * WhatsApp para coordinar el pago. Reusa la acción pago_acopio a nivel productor.
 * Brandon 2026-07-02.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HandCoins, Coins, Users, Search, RefreshCw, Download, AlertCircle, CheckCircle2, MessageCircle, Loader2, Clock, ChevronDown, Printer,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { openPrintable } from "@/lib/cacao/cacao-print";

interface LoteRow { id: string; loteCode: string | null; fecha: string; kg: number; total: number; abonado: number; saldo: number; estadoPago: string }
interface Grupo {
  producerId: string; nombre: string; codigo: string | null; sector: string | null; telefono: string | null;
  lotes: LoteRow[]; nLotes: number; totalSaldo: number; totalDebido: number; totalAbonado: number; oldest: string | null;
}
interface Resp { groups: Grupo[]; totals: { productores: number; lotes: number; saldo: number } }

const n2 = (v: number) => v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fdate = (iso: string | null) => { if (!iso) return "—"; try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }); } catch { return iso; } };
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
  const [search, setSearch] = useState("");
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

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.nombre.toLowerCase().includes(q) || (g.codigo ?? "").toLowerCase().includes(q) || (g.sector ?? "").toLowerCase().includes(q));
  }, [groups, search]);

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
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total a pagar" value={`S/ ${n2(totals?.saldo ?? 0)}`} subValue={(totals?.saldo ?? 0) > 0 ? "saldo pendiente" : "al día"} icon={Coins} emphasis={(totals?.saldo ?? 0) > 0 ? "warning" : "success"} />
        <StatCard label="Productores por pagar" value={String(totals?.productores ?? 0)} icon={Users} emphasis="neutral" />
        <StatCard label="Lotes pendientes" value={String(totals?.lotes ?? 0)} icon={HandCoins} emphasis="neutral" />
      </div>

      {error && <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Error:</strong> {error}</div></div>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-12 min-w-[200px] flex-1 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4">
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar productor por nombre, código o sector…" className="w-full bg-transparent text-base text-[var(--text-primary)] outline-none" />
        </div>
        <button type="button" onClick={exportCsv} disabled={view.length === 0} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"><Download className="h-4 w-4" />CSV</button>
        <button type="button" onClick={load} className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><RefreshCw className="h-4 w-4" />Actualizar</button>
      </div>

      {loading && groups.length === 0 ? (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] p-10 text-center text-[var(--text-tertiary)]"><RefreshCw className="mx-auto h-6 w-6 animate-spin" /><p className="mt-2 text-sm">Cargando…</p></div>
      ) : view.length === 0 ? (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-12 text-center text-[var(--text-tertiary)]">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[var(--data-success-50)] text-[var(--data-success-700)]"><CheckCircle2 className="h-7 w-7" /></span>
          <p className="text-base font-bold text-[var(--text-primary)]">{search ? "Sin resultados" : "Todo al día"}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm">{search ? "Ningún productor coincide con tu búsqueda." : "No le debés liquidación a ningún productor. Cada lote de acopio está pagado."}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {view.map((g) => {
            const dias = diasDesde(g.oldest);
            const isOpen = expanded === g.producerId;
            return (
              <li key={g.producerId} className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button type="button" onClick={() => setExpanded(isOpen ? null : g.producerId)} className="flex min-w-[160px] flex-1 items-center gap-2 text-left" aria-expanded={isOpen} aria-label={`Ver lotes de ${g.nombre}`}>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    <span>
                      <span className="block font-medium text-[var(--text-primary)]">{g.nombre}</span>
                      <span className="block text-xs text-[var(--text-tertiary)]"><span className="font-mono">{g.codigo ?? "—"}</span> · {g.nLotes} lote{g.nLotes === 1 ? "" : "s"}{g.sector ? ` · ${g.sector}` : ""}</span>
                    </span>
                  </button>
                  {dias != null && dias >= 30 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-100)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-900)]"><Clock className="h-3 w-3" />{dias} días</span>
                  )}
                  <div className="text-right">
                    <div className="font-mono text-lg font-bold tabular-nums text-[var(--data-warning-700)]">S/ {n2(g.totalSaldo)}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">de S/ {n2(g.totalDebido)}</div>
                  </div>
                  {g.telefono && (
                    <a href={waLink(g.telefono, g.nombre, g.totalSaldo)} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]" aria-label={`WhatsApp a ${g.nombre}`}><MessageCircle className="h-4 w-4" /></a>
                  )}
                  <button type="button" onClick={() => setPayFor(g)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90"><HandCoins className="h-4 w-4" />Pagar</button>
                </div>
                {isOpen && (
                  <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2">
                    <table className="w-full text-sm">
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
                    </table>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {payFor && <PagoLiquidacionModal grupo={payFor} onClose={() => setPayFor(null)} onPaid={() => { setPayFor(null); load(); }} />}
    </div>
  );
}

/** Constancia de pago imprimible (firmable en campo). HTML autocontenido con su
 *  propio window.print(); openPrintable lo abre vía iframe robusto. */
function receiptHtml(grupo: Grupo, aplicado: number, saldoRestante: number, fecha: string): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }) as Record<string, string>)[c] ?? c);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Constancia de pago — ${esc(grupo.nombre)}</title>
<style>*{box-sizing:border-box}body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:0;padding:32px}
.doc{max-width:520px;margin:0 auto}h1{font-size:20px;margin:0 0 2px}.muted{color:#555;font-size:13px;margin:0}
table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:8px 0;font-size:14px;border-bottom:1px solid #eee}
td.k{color:#555}td.v{text-align:right;font-weight:700}.total{font-size:22px;font-weight:800}
.firma{margin-top:56px;display:flex;justify-content:space-between;gap:24px}.firma div{flex:1;border-top:1px solid #333;padding-top:6px;text-align:center;font-size:12px;color:#555}</style>
</head><body><div class="doc">
<h1>Constancia de pago de liquidación</h1><p class="muted">Acopio de cacao · ${esc(fecha)}</p>
<table>
<tr><td class="k">Productor</td><td class="v">${esc(grupo.nombre)}</td></tr>
<tr><td class="k">Código</td><td class="v">${esc(grupo.codigo ?? "—")}</td></tr>
<tr><td class="k">Lotes en la cuenta</td><td class="v">${grupo.nLotes}</td></tr>
<tr><td class="k">Monto pagado</td><td class="v total">S/ ${n2(aplicado)}</td></tr>
<tr><td class="k">Saldo restante</td><td class="v">S/ ${n2(saldoRestante)}</td></tr>
</table>
<div class="firma"><div>Firma del productor</div><div>Firma / sello del acopiador</div></div>
</div><script>window.onload=function(){window.print()}</script></body></html>`;
}

function PagoLiquidacionModal({ grupo, onClose, onPaid }: { grupo: Grupo; onClose: () => void; onPaid: () => void }) {
  const [monto, setMonto] = useState(Number(grupo.totalSaldo).toFixed(2));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ aplicado: number; saldoRestante: number; fecha: string } | null>(null);
  const parsed = Number(monto);
  const valido = Number.isFinite(parsed) && parsed > 0 && parsed <= grupo.totalSaldo + 0.001;

  async function pagar() {
    if (submitting || !valido) return;
    setSubmitting(true); setError(null);
    try {
      const full = Math.abs(parsed - grupo.totalSaldo) < 0.01;
      const r = await fetch("/api/admin/cacao", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "pagar_liquidacion", producerId: grupo.producerId, monto: full ? null : parsed }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      const data = await r.json().catch(() => ({}));
      const aplicado = Number(data.aplicado ?? parsed);
      const saldoRestante = Number(data.saldoRestante ?? Math.max(0, grupo.totalSaldo - parsed));
      const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
      setDone({ aplicado, saldoRestante, fecha });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setSubmitting(false); }
  }

  if (done) {
    return (
      <AdminModal open onClose={onPaid} variant="centered-sm" icon={CheckCircle2} title="Pago registrado" description={`Se registró el pago a ${grupo.nombre}.`}>
        <div className="space-y-4 p-5 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--data-success-50)] text-[var(--data-success-700)]"><CheckCircle2 className="h-7 w-7" /></span>
          <div>
            <p className="text-2xl font-extrabold text-[var(--text-primary)]">S/ {n2(done.aplicado)}</p>
            <p className="text-sm text-[var(--text-secondary)]">pagados a {grupo.nombre}. {done.saldoRestante > 0 ? `Queda S/ ${n2(done.saldoRestante)} pendiente.` : "Cuenta saldada."}</p>
          </div>
          <div className="flex justify-center gap-2">
            <button type="button" onClick={() => openPrintable(receiptHtml(grupo, done.aplicado, done.saldoRestante, done.fecha))} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Printer className="h-4 w-4" />Imprimir comprobante</button>
            <button type="button" onClick={onPaid} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90">Listo</button>
          </div>
        </div>
      </AdminModal>
    );
  }

  return (
    <AdminModal open onClose={onClose} variant="centered-sm" icon={HandCoins} title={`Pagar a ${grupo.nombre}`} description={`Saldo pendiente: S/ ${n2(grupo.totalSaldo)} en ${grupo.nLotes} lote${grupo.nLotes === 1 ? "" : "s"}.`}>
      <div className="space-y-4 p-5">
        <div>
          <label htmlFor="cacao-liq-monto" className="mb-1 block text-sm font-bold text-[var(--text-primary)]">Monto a pagar (S/)</label>
          <input id="cacao-liq-monto" type="number" inputMode="decimal" step="0.01" min="0" max={grupo.totalSaldo} value={monto} onChange={(e) => setMonto(e.target.value)} className="h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" autoFocus />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setMonto(Number(grupo.totalSaldo).toFixed(2))} className="rounded-lg border border-[var(--rule-base)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]">Todo · S/ {n2(grupo.totalSaldo)}</button>
            <button type="button" onClick={() => setMonto((Number(grupo.totalSaldo) / 2).toFixed(2))} className="rounded-lg border border-[var(--rule-base)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]">Mitad</button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">Se reparte del lote más antiguo al más nuevo. El pago parcial deja el resto pendiente.</p>
        </div>
        {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">Cancelar</button>
          <button type="button" disabled={!valido || submitting} onClick={pagar} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}Registrar pago
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
