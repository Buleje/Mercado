"use client";

import { CardTitle } from "@buleje/design-system";
import { useState } from "react";
import { X, Loader2, Receipt, Clock, History, Printer } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { fmt, type SaleRecord } from "@/components/admin/pos/pos-shared";
import { etiquetaMedio, useResumenHoy, useVentasDelDia, VENTAS_POR_PAGINA } from "@/components/admin/pos/use-resumen-hoy";

// ── Sale History Item (Mejora 2: expandable) ─────────────────────────────────

function SaleHistoryItem({ sale }: { sale: SaleRecord }) {
  const [expanded, setExpanded] = useState(false);
  const time = formatTime(sale.createdAt);
  const itemCount = sale.items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <div className="bg-[var(--surface-sunken)] rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:border-primary transition-colors">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left p-3">
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-[var(--text-tertiary)] dark:text-muted" />
            <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{time}</span>
          </div>
          <span className="text-sm font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(sale.total)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{itemCount} {itemCount === 1 ? "articulo" : "articulos"}</span>
          <span className={cn(
            "text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full",
            sale.payment === "efectivo" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" :
            sale.payment === "yape" ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" :
            sale.payment === "plin" ? "bg-teal-50 text-[var(--accent-dark)] dark:text-[var(--accent)]" :
            sale.payment === "tarjeta" ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" :
            sale.payment === "fiado" ? "bg-[var(--data-warning-50)] text-[var(--data-warning-500)]" :
            "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
          )}>
            {sale.payment}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-2 space-y-1.5">
          {(sale as SaleRecord & { items: { name?: string; quantity: number }[] }).items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-[length:var(--ts-xs)]">
              <span className="text-[var(--text-secondary)] dark:text-muted truncate max-w-[140px]">
                {(item as { name?: string }).name || `Item ${idx + 1}`} x{item.quantity}
              </span>
            </div>
          ))}
          <div className="flex gap-1.5 pt-1">
            <a href={`/venta/${sale.id}/recibo`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors">
              <Printer className="h-3 w-3" /> Reimprimir
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/** Ventas de hoy (panel lateral, F4): cifras sumadas en el servidor + lista de 50 en 50. */
export default function POSSaleHistory({ showHistory, setShowHistory }: { showHistory: boolean; setShowHistory: (v: boolean) => void }) {
  const estado = useResumenHoy(0, showHistory);
  const r = estado.estado === "ok" ? estado.resumen : null;
  const { ventas, totalFilas, cargando, cargarMas, hayMas, lista } = useVentasDelDia(showHistory && r ? r.dia : null);

  if (!showHistory) return null;
  const sinDatos = estado.estado === "cargando" || !lista;
  return (
        <div className="fixed inset-y-0 right-0 z-modal w-80 max-w-full bg-[var(--surface-raised)] border-l border-[var(--rule-base)] dark:border-[var(--rule-base)] flex flex-col">
          {/* Header */}
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">Ventas de hoy</CardTitle>
            </div>
            <button aria-label="Cerrar"
              onClick={() => setShowHistory(false)}
              className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <X className="h-4 w-4 text-[var(--text-tertiary)] dark:text-muted" />
            </button>
          </div>

          {/* Total: sumado en el servidor (día de Lima), no en el navegador */}
          {r && r.ventas > 0 && (
            <div data-resumen-hoy className="px-2 sm:px-4 py-2 sm:py-3 bg-primary/10 dark:bg-primary/15 border-b border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
              <p className="text-xs font-bold text-[var(--data-success-500)]">{r.alcance === "tuyas" ? "Total de tus ventas" : "Total vendido hoy"}</p>
              <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                {fmt(r.total)}
              </p>
              <p className="text-xs text-[var(--data-success-500)] mt-0.5">
                {r.ventas} {r.ventas === 1 ? "venta" : "ventas"} · ticket prom. {fmt(r.ticketPromedio)}
              </p>
              {r.porMedio.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.porMedio.map((m) => (
                    <span key={m.medio} className="text-[length:var(--ts-2xs)] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                      {etiquetaMedio(m.medio)} {fmt(m.monto)}
                    </span>
                  ))}
                </div>
              )}
              {r.devuelto && r.devuelto.cantidad > 0 && (
                <p className="mt-1.5 text-[length:var(--ts-2xs)] text-[var(--data-warning-500)]">
                  Devuelto hoy: {fmt(r.devuelto.monto)} ({r.devuelto.cantidad}) · no se resta del total
                </p>
              )}
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {estado.estado === "error" ? (
              <div className="flex flex-col items-center justify-center h-32 text-[var(--text-tertiary)] dark:text-muted">
                <Receipt className="h-6 w-6 mb-1.5" />
                <p className="text-xs">No se pudo cargar. Cierra y vuelve a abrir.</p>
              </div>
            ) : sinDatos ? (
              <div className="flex items-center justify-center h-32 text-[var(--text-tertiary)] dark:text-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : ventas.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[var(--text-tertiary)] dark:text-muted">
                <Receipt className="h-6 w-6 mb-1.5" />
                <p className="text-xs">Sin ventas hoy</p>
              </div>
            ) : (
              <>
                {ventas.map(sale => (
                  <SaleHistoryItem key={sale.id} sale={sale} />
                ))}
                {hayMas && (
                  <button
                    type="button"
                    onClick={cargarMas}
                    disabled={cargando}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] px-3 py-2 rounded-lg border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-60"
                  >
                    {cargando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Ver {Math.min(VENTAS_POR_PAGINA, totalFilas - ventas.length)} más ({ventas.length} de {totalFilas})
                  </button>
                )}
              </>
            )}
          </div>
        </div>
  );
}
