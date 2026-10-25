"use client";

import { useState } from "react";
import { HandCoins, CheckCircle2, Loader2, Printer } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { membreteCacao, openPrintable } from "@/lib/cacao/cacao-print";
import { formatDateLong, formatNumber } from "@/lib/format";
import type { Grupo } from "./columnas-filtro-liquidaciones";

const n2 = (v: number) => formatNumber(v, 2);

/** Constancia de pago imprimible (firmable en campo). HTML autocontenido con su
 *  propio window.print(); openPrintable lo abre vía iframe robusto. */
function receiptHtml(grupo: Grupo, aplicado: number, saldoRestante: number, m: { estilos: string; cabecera: string; pie: string }): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }) as Record<string, string>)[c] ?? c);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Constancia de pago — ${esc(grupo.nombre)}</title>
<style>${m.estilos}*{box-sizing:border-box}body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:0;padding:32px}
.doc{max-width:520px;margin:0 auto}h1{font-size:20px;margin:0 0 2px}.muted{color:#555;font-size:13px;margin:0}
table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:8px 0;font-size:14px;border-bottom:1px solid #eee}
td.k{color:#555}td.v{text-align:right;font-weight:700}.total{font-size:22px;font-weight:800}
.firma{margin-top:56px;display:flex;justify-content:space-between;gap:24px}.firma div{flex:1;border-top:1px solid #333;padding-top:6px;text-align:center;font-size:12px;color:#555}</style>
</head><body><div class="doc">
${m.cabecera}
<table>
<tr><td class="k">Productor</td><td class="v">${esc(grupo.nombre)}</td></tr>
<tr><td class="k">Código</td><td class="v">${esc(grupo.codigo ?? "—")}</td></tr>
<tr><td class="k">Lotes en la cuenta</td><td class="v">${grupo.nLotes}</td></tr>
<tr><td class="k">Monto pagado</td><td class="v total">S/ ${n2(aplicado)}</td></tr>
<tr><td class="k">Saldo restante</td><td class="v">S/ ${n2(saldoRestante)}</td></tr>
</table>
<div class="firma"><div>Firma del productor</div><div>Firma / sello del acopiador</div></div>
${m.pie}
</div><script>window.onload=function(){window.print()}</script></body></html>`;
}

export default function PagoLiquidacionModal({ grupo, onClose, onPaid }: { grupo: Grupo; onClose: () => void; onPaid: () => void }) {
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
      const fecha = formatDateLong(new Date());
      setDone({ aplicado, saldoRestante, fecha });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setSubmitting(false); }
  }

  if (done) {
    return (
      <AdminModal open onClose={onPaid} variant="centered-sm" icon={CheckCircle2} title="Pago registrado" description={`Se registró el pago a ${grupo.nombre}.`}>
        <div className="space-y-4 text-center px-5 py-5 sm:px-6">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--data-success-50)] text-[var(--data-success-700)]"><CheckCircle2 className="h-7 w-7" /></span>
          <div>
            <p className="text-2xl font-extrabold text-[var(--text-primary)]">S/ {n2(done.aplicado)}</p>
            <p className="text-sm text-[var(--text-secondary)]">pagados a {grupo.nombre}. {done.saldoRestante > 0 ? `Queda S/ ${n2(done.saldoRestante)} pendiente.` : "Cuenta saldada."}</p>
          </div>
          <div className="flex justify-center gap-2">
            <button type="button" onClick={async () => openPrintable(receiptHtml(grupo, done.aplicado, done.saldoRestante, await membreteCacao("Constancia de pago · Cacao", { codigo: grupo.codigo, nombreSiFalta: "Acopio de cacao" })))} className="inline-flex h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"><Printer className="h-4 w-4" />Imprimir comprobante</button>
            <button type="button" onClick={onPaid} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-sm hover:opacity-90">Listo</button>
          </div>
        </div>
      </AdminModal>
    );
  }

  return (
    <AdminModal open onClose={onClose} variant="centered-sm" icon={HandCoins} title={`Pagar a ${grupo.nombre}`} description={`Saldo pendiente: S/ ${n2(grupo.totalSaldo)} en ${grupo.nLotes} lote${grupo.nLotes === 1 ? "" : "s"}.`}>
      <div className="space-y-4 px-5 py-5 sm:px-6">
        <div>
          <label htmlFor="cacao-liq-monto" className="mb-1 block text-sm font-bold text-[var(--text-primary)]">Monto a pagar (S/)</label>
          <input id="cacao-liq-monto" type="number" inputMode="decimal" step="0.01" min="0" max={grupo.totalSaldo} value={monto} onChange={(e) => setMonto(e.target.value)} className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" autoFocus />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setMonto(Number(grupo.totalSaldo).toFixed(2))} className="rounded-lg border border-[var(--rule-base)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]">Todo · S/ {n2(grupo.totalSaldo)}</button>
            <button type="button" onClick={() => setMonto((Number(grupo.totalSaldo) / 2).toFixed(2))} className="rounded-lg border border-[var(--rule-base)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]">Mitad</button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">Se reparte del lote más antiguo al más nuevo. El pago parcial deja el resto pendiente.</p>
        </div>
        {error && <div className="rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-sm text-[var(--data-error-700)]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-12 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">Cancelar</button>
          <button type="button" disabled={!valido || submitting} onClick={pagar} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}Registrar pago
          </button>
        </div>
      </div>
    </AdminModal>
  );
}
