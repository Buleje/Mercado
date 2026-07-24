"use client";

/**
 * LiquidacionModal — arma el comprobante de liquidación del lote para un
 * comprador: datos del cliente + desglose por especie en vivo, y lo exporta
 * a impresión, PDF o WhatsApp. Reusa el precio por especie del cubicador.
 */
import { useEffect, useMemo, useState } from "react";
import { Download, MessageCircle, Printer, Receipt, X } from "@buleje/design-system/icons";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  construirLiquidacion, liquidacionAHtml, liquidacionAWhatsApp,
  type DatosLiquidacion,
} from "@/lib/forestal/cubicacion-liquidacion";
import { exportarLiquidacionPDF } from "@/lib/forestal/cubicador-export";

const soles = (n: number) => n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Imprime un HTML independiente vía iframe oculto (sin popup, sin dejar rastro). */
function imprimirHtml(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) { iframe.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  iframe.contentWindow?.focus();
  setTimeout(() => {
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1500);
  }, 300);
}

export default function LiquidacionModal({
  rows, precioDe, clienteInicial = "", notaInicial = "", emisor, onCerrar,
}: {
  rows: PiezaCubicada[];
  precioDe: (r: PiezaCubicada) => number;
  clienteInicial?: string;
  notaInicial?: string;
  emisor?: string;
  onCerrar: () => void;
}) {
  const [cliente, setCliente] = useState(clienteInicial);
  const [documento, setDocumento] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState(notaInicial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const liq = useMemo(() => construirLiquidacion(rows, precioDe), [rows, precioDe]);
  const datos = (): DatosLiquidacion => ({ cliente: cliente.trim(), documento: documento.trim() || undefined, fecha, nota: nota.trim() || undefined, emisor });
  const conValor = liq.total > 0;

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[5vh]" onClick={onCerrar}>
      <div className="w-full max-w-2xl rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
            <Receipt className="h-5 w-5 text-[var(--accent)]" /> Liquidación para el cliente
          </h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Datos del comprobante */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Cliente</span>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre del comprador" className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">RUC / DNI (opcional)</span>
            <input value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" placeholder="—" className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Nota (opcional)</span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Forma de pago, entrega…" className="h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
          </label>
        </div>

        {/* Preview del desglose por especie */}
        <div className="mt-4 overflow-x-auto rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--accent-soft)]/30">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                <th className="px-3 py-2">Especie</th>
                <th className="px-3 py-2 text-right">Piezas</th>
                <th className="px-3 py-2 text-right">Pie tablar</th>
                {conValor && <th className="px-3 py-2 text-right">S/ / PT</th>}
                {conValor && <th className="px-3 py-2 text-right">Subtotal</th>}
              </tr>
            </thead>
            <tbody>
              {liq.lineas.map((l) => (
                <tr key={l.especie} className="border-t border-[var(--accent)]/15">
                  <td className="px-3 py-2 font-bold text-[var(--text-primary)]">{l.especie}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{l.piezas}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{soles(l.pieTablar)}</td>
                  {conValor && <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">S/ {soles(l.precioPt)}</td>}
                  {conValor && <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--accent)]">S/ {soles(l.subtotal)}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--accent)]/40 font-bold text-[var(--text-primary)]">
                <td className="px-3 py-2">Total · {liq.totalPiezas} piezas</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{liq.totalPiezas}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--accent)]">{soles(liq.totalPt)} PT</td>
                {conValor && <td />}
                {conValor && <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--accent)]">S/ {soles(liq.total)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
        {!conValor && (
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">Poné un precio (general o por especie) en el cubicador para ver los montos.</p>
        )}

        {/* Acciones */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => imprimirHtml(liquidacionAHtml(datos(), liq))} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button type="button" onClick={() => { void exportarLiquidacionPDF(datos(), liq); }} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <Download className="h-4 w-4" /> PDF
          </button>
          <button type="button" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(liquidacionAWhatsApp(datos(), liq))}`, "_blank")} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-95">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
