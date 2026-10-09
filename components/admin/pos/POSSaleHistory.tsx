"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Receipt, Clock, History, Printer } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { fmt, type SaleRecord } from "@/components/admin/pos/pos-shared";

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

/** Historial de las ventas de hoy (panel lateral, F4). */
export default function POSSaleHistory({ showHistory, setShowHistory }: { showHistory: boolean; setShowHistory: (v: boolean) => void }) {
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchSalesHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/sales?today=1");
      const data = await res.json();
      setSalesHistory(Array.isArray(data) ? data : []);
    } catch { setSalesHistory([]); }
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    if (showHistory) {
      const timer = window.setTimeout(() => {
        void fetchSalesHistory();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [showHistory, fetchSalesHistory]);

  if (!showHistory) return null;
  return (
        <div className="fixed inset-y-0 right-0 z-modal w-80 bg-[var(--surface-raised)] border-l border-[var(--rule-base)] dark:border-[var(--rule-base)] flex flex-col">
          {/* Header */}
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">Historial del Turno</CardTitle>
            </div>
            <button aria-label="Cerrar"
              onClick={() => setShowHistory(false)}
              className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <X className="h-4 w-4 text-[var(--text-tertiary)] dark:text-muted" />
            </button>
          </div>

          {/* Total */}
          {!loadingHistory && salesHistory.length > 0 && (
            <div className="px-2 sm:px-4 py-2 sm:py-3 bg-primary/10 dark:bg-primary/15 border-b border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30">
              <p className="text-xs font-bold text-[var(--data-success-500)]">Total Ventas del Turno</p>
              <p className="text-xl sm:text-2xl font-extrabold text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                {fmt(salesHistory.reduce((sum, s) => sum + s.total, 0))}
              </p>
              <p className="text-xs text-[var(--data-success-500)] mt-0.5">{salesHistory.length} {salesHistory.length === 1 ? "venta" : "ventas"}</p>
            </div>
          )}

          {/* List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingHistory ? (
              <div className="flex items-center justify-center h-32 text-[var(--text-tertiary)] dark:text-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : salesHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[var(--text-tertiary)] dark:text-muted">
                <Receipt className="h-6 w-6 mb-1.5" />
                <p className="text-xs">Sin ventas hoy</p>
              </div>
            ) : (
              salesHistory.map(sale => (
                <SaleHistoryItem key={sale.id} sale={sale} />
              ))
            )}
          </div>
        </div>
  );
}
