"use client";

import { CardTitle, LoadingState } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import {
  X, BookOpen, Download, Loader2, ArrowUpCircle, ArrowDownCircle, Calendar,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-excel";

// ── Types ────────────────────────────────────────────────────────────────────

type KardexMovimiento = {
  id: string;
  fecha: string;
  tipo: string;
  cantidad: number;
  entrada: number;
  salida: number;
  saldo: number;
  referencia: string;
  usuario: string;
  notas: string;
};

type KardexResponse = {
  producto: { id: number; name: string; unit: string; stock: number };
  movimientos: KardexMovimiento[];
  resumen: { totalEntradas: number; totalSalidas: number; saldoFinal: number };
};

type Props = {
  productId: number;
  productName?: string;
  onClose: () => void;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, { label: string; color: string; dir: "in" | "out" }> = {
  compra:           { label: "Compra",       color: "text-[var(--data-success)] dark:text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", dir: "in" },
  devolucion:       { label: "Devolución",   color: "text-[var(--data-success)] dark:text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",           dir: "in" },
  ajuste_positivo:  { label: "Ajuste (+)",   color: "text-[var(--data-info)] dark:text-[var(--data-info)] bg-[var(--data-info-50)] dark:bg-sky-950/30",               dir: "in" },
  venta:            { label: "Venta POS",    color: "text-[var(--data-warning)] dark:text-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-amber-950/30",       dir: "out" },
  venta_online:     { label: "Venta Online", color: "text-[var(--data-warning)] dark:text-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-orange-950/30",   dir: "out" },
  ajuste_negativo:  { label: "Ajuste (-)",   color: "text-[var(--data-error)] dark:text-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-red-950/30",               dir: "out" },
  merma:            { label: "Pérdida",      color: "text-[var(--text-secondary)] dark:text-[var(--text-primary)] bg-[var(--surface-sunken)]",           dir: "out" },
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function KardexModal({ productId, productName, onClose }: Props) {
  const [data, setData] = useState<KardexResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(thirtyDaysAgoStr);
  const [to, setTo] = useState(todayStr);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ productId: String(productId) });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/inventory/kardex?${params}`);
      if (!res.ok) throw new Error("Error al cargar kardex");
      const json = await res.json();
      setData(json);
    } catch {
      setError("No se pudo cargar el kardex");
    }
    setLoading(false);
  }, [productId, from, to]);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    if (!data || data.movimientos.length === 0) return;
    const rows = data.movimientos.map((m) => ({
      Fecha: fmtDate(m.fecha),
      Tipo: TYPE_LABELS[m.tipo]?.label ?? m.tipo,
      Referencia: m.referencia,
      Entrada: m.entrada,
      Salida: m.salida,
      Saldo: m.saldo,
      Usuario: m.usuario,
      Notas: m.notas,
    }));
    exportToExcel(rows, `kardex-${data.producto.name.replace(/\s+/g, "_")}-${todayStr()}`, "Kardex");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-card rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--rule-soft)] dark:border-card-border shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground">
              Kardex — {productName ?? data?.producto.name ?? `#${productId}`}
            </CardTitle>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors">
            <X className="h-5 w-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-card-border shrink-0">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="text-xs border border-[var(--rule-base)] dark:border-card-border rounded-lg px-2 py-1.5 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="text-xs border border-[var(--rule-base)] dark:border-card-border rounded-lg px-2 py-1.5 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={!data || data.movimientos.length === 0}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-soft)] text-white text-xs font-bold hover:bg-[var(--accent-soft)] transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Exportar Excel
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <LoadingState />
          )}

          {error && (
            <div className="text-center py-16">
              <p className="text-sm text-[var(--data-error)]">{error}</p>
              <button onClick={load} className="mt-2 text-xs text-primary font-bold hover:underline">Reintentar</button>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 rounded-xl p-3 text-center">
                  <p className="text-lg font-extrabold text-[var(--data-success)] dark:text-[var(--data-success)]">{data.resumen.totalEntradas}</p>
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success)]/70 uppercase">Total entradas</p>
                </div>
                <div className="bg-[var(--data-error-50)] dark:bg-red-950/30 border border-[var(--data-error)] dark:border-[var(--data-error)] rounded-xl p-3 text-center">
                  <p className="text-lg font-extrabold text-[var(--data-error)] dark:text-[var(--data-error)]">{data.resumen.totalSalidas}</p>
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error)]/70 uppercase">Total salidas</p>
                </div>
                <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 rounded-xl p-3 text-center">
                  <p className="text-lg font-extrabold text-[var(--data-success)] dark:text-[var(--data-success)]">{data.resumen.saldoFinal}</p>
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-success)]/70 uppercase">Saldo final</p>
                </div>
              </div>

              {/* Movements table */}
              {data.movimientos.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="h-10 w-10 text-[var(--text-tertiary)] dark:text-muted mx-auto mb-2" />
                  <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Sin movimientos en este período</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-xs">
                    <thead>
                      <tr className="border-b border-[var(--rule-base)] dark:border-card-border">
                        <th className="text-left py-2 font-bold text-[var(--text-tertiary)]">Fecha</th>
                        <th className="text-left py-2 font-bold text-[var(--text-tertiary)]">Tipo</th>
                        <th className="text-left py-2 font-bold text-[var(--text-tertiary)]">Referencia</th>
                        <th className="text-right py-2 font-bold text-[var(--text-tertiary)]">Entrada</th>
                        <th className="text-right py-2 font-bold text-[var(--text-tertiary)]">Salida</th>
                        <th className="text-right py-2 font-bold text-[var(--text-tertiary)]">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movimientos.map((m) => {
                        const meta = TYPE_LABELS[m.tipo] ?? { label: m.tipo, color: "text-[var(--text-secondary)] bg-gray-100", dir: "out" };
                        return (
                          <tr key={m.id} className="border-t border-gray-50 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                            <td className="py-2 text-[var(--text-secondary)] dark:text-muted">{fmtDate(m.fecha)}</td>
                            <td className="py-2">
                              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold", meta.color)}>
                                {meta.dir === "in" ? <ArrowUpCircle className="h-2.5 w-2.5" /> : <ArrowDownCircle className="h-2.5 w-2.5" />}
                                {meta.label}
                              </span>
                            </td>
                            <td className="py-2 text-[var(--text-secondary)] dark:text-muted truncate max-w-[120px]">{m.referencia || "—"}</td>
                            <td className={cn("py-2 text-right font-bold", m.entrada > 0 ? "text-[var(--data-success)] dark:text-[var(--data-success)]" : "text-[var(--text-tertiary)] dark:text-muted")}>
                              {m.entrada > 0 ? `+${m.entrada}` : "—"}
                            </td>
                            <td className={cn("py-2 text-right font-bold", m.salida > 0 ? "text-[var(--data-error)] dark:text-[var(--data-error)]" : "text-[var(--text-tertiary)] dark:text-muted")}>
                              {m.salida > 0 ? `-${m.salida}` : "—"}
                            </td>
                            <td className="py-2 text-right font-extrabold text-[var(--text-primary)] dark:text-foreground">{m.saldo}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[var(--rule-base)] dark:border-card-border font-bold">
                        <td colSpan={3} className="py-2 text-[var(--text-primary)] dark:text-foreground">Totales</td>
                        <td className="py-2 text-right text-[var(--data-success)] dark:text-[var(--data-success)]">+{data.resumen.totalEntradas}</td>
                        <td className="py-2 text-right text-[var(--data-error)] dark:text-[var(--data-error)]">-{data.resumen.totalSalidas}</td>
                        <td className="py-2 text-right text-primary font-extrabold">{data.resumen.saldoFinal}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
