"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";

import { useState, useMemo } from "react";
import {
  RotateCcw, Download, Search, Eye, X,
  AlertTriangle,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import type { BadgeVariant } from "@/components/admin/shared/StatusBadge";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReturnReason = "defectuoso" | "vencido" | "equivocado" | "insatisfecho" | "dañado-transporte" | "duplicado";
type ReturnDecision = "reembolso" | "reemplazo" | "credito" | "rechazado" | "pendiente";
type InspectionResult = "aprobado" | "parcial" | "rechazado" | "pendiente";

type ReturnRecord = {
  id: string;
  date: string;
  orderRef: string;
  clientName: string;
  product: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  reason: ReturnReason;
  decision: ReturnDecision;
  inspection: InspectionResult;
  restocked: boolean;
  notes: string;
  processedBy: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const REASON_META: Record<ReturnReason, { label: string; color: string; bg: string; variant: BadgeVariant }> = {
  defectuoso:        { label: "Defectuoso",         color: "text-[var(--data-error-500)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30",     variant: "error" },
  vencido:           { label: "Vencido",             color: "text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30", variant: "warning" },
  equivocado:        { label: "Producto equivocado", color: "text-[var(--data-success-500)]",    bg: "bg-primary/10 dark:bg-primary/15",   variant: "info" },
  insatisfecho:      { label: "Insatisfecho",        color: "text-[var(--text-secondary)]",  bg: "bg-[var(--surface-sunken)]", variant: "pending" },
  "dañado-transporte": { label: "Dañado en transporte", color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30", variant: "warning" },
  duplicado:         { label: "Pedido duplicado",    color: "text-[var(--text-secondary)]",    bg: "bg-[var(--surface-sunken)]/30",   variant: "neutral" },
};

const DECISION_META: Record<ReturnDecision, { label: string; color: string }> = {
  reembolso: { label: "Reembolso",   color: "text-[var(--data-success-500)]" },
  reemplazo: { label: "Reemplazo",   color: "text-[var(--data-success-500)]" },
  credito:   { label: "Crédito",     color: "text-[var(--text-secondary)]" },
  rechazado: { label: "Rechazado",   color: "text-[var(--data-error-500)]" },
  pendiente: { label: "Pendiente",   color: "text-[var(--data-warning-500)]" },
};

const INSPECTION_META: Record<InspectionResult, { label: string; color: string }> = {
  aprobado:   { label: "Aprobado",  color: "text-[var(--data-success-500)]" },
  parcial:    { label: "Parcial",   color: "text-[var(--data-warning-500)]" },
  rechazado:  { label: "Rechazado", color: "text-[var(--data-error-500)]" },
  pendiente:  { label: "Pendiente", color: "text-[var(--text-secondary)]" },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: ReturnRecord[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdvancedReturnsTab() {
  const [records] = useState(SEED);
  const [search, setSearch] = useState("");
  const [filterReason, setFilterReason] = useState<ReturnReason | "todos">("todos");
  const [filterDecision, setFilterDecision] = useState<ReturnDecision | "todos">("todos");
  const [detail, setDetail] = useState<ReturnRecord | null>(null);

  const filtered = useMemo(() => {
    let list = [...records];
    if (filterReason !== "todos") list = list.filter(r => r.reason === filterReason);
    if (filterDecision !== "todos") list = list.filter(r => r.decision === filterDecision);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.clientName.toLowerCase().includes(q) || r.product.toLowerCase().includes(q) || r.orderRef.toLowerCase().includes(q));
    }
    return list;
  }, [records, filterReason, filterDecision, search]);

  const stats = useMemo(() => {
    const totalValue = records.reduce((s, r) => s + r.totalValue, 0);
    const refunded = records.filter(r => r.decision === "reembolso").reduce((s, r) => s + r.totalValue, 0);
    const restocked = records.filter(r => r.restocked).length;
    const pending = records.filter(r => r.decision === "pendiente").length;
    const byReason: Record<string, number> = {};
    records.forEach(r => { byReason[r.reason] = (byReason[r.reason] || 0) + 1; });
    const topReason = Object.entries(byReason).sort((a, b) => b[1] - a[1])[0];
    return { totalValue, refunded, restocked, pending, topReason, count: records.length };
  }, [records]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <RotateCcw className="h-6 w-6 text-primary" /> Devoluciones Avanzadas
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">RMA, inspección, decisiones y estadísticas por motivo</p>
        </div>
        <button onClick={() => exportToCSV(records.map(r => ({ fecha: r.date, pedido: r.orderRef, cliente: r.clientName, producto: r.product, cantidad: r.quantity, valor: r.totalValue, motivo: REASON_META[r.reason].label, decision: DECISION_META[r.decision].label, inspeccion: INSPECTION_META[r.inspection].label, restock: r.restocked ? "Sí" : "No" })), "devoluciones")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Valor en devoluciones", value: fmt(stats.totalValue), color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)] dark:bg-red-950/30" },
          { label: "Reembolsado", value: fmt(stats.refunded), color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
          { label: "Restockeados", value: String(stats.restocked), color: "text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15" },
          { label: "Pendientes", value: String(stats.pending), color: "text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Reason distribution */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5">
        <CardTitle className="font-extrabold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)]" /> Motivos de devolución</CardTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(Object.keys(REASON_META) as ReturnReason[]).map(reason => {
            const count = records.filter(r => r.reason === reason).length;
            const meta = REASON_META[reason];
            return (
              <div key={reason} className={cn("rounded-xl p-3 flex items-center justify-between", meta.bg)}>
                <span className={cn("text-xs font-bold", meta.color)}>{meta.label}</span>
                <span className={cn("text-lg font-extrabold", meta.color)}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cliente, producto, pedido..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
        </div>
        <select value={filterReason} onChange={e => setFilterReason(e.target.value as ReturnReason | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="todos">Todos los motivos</option>
          {(Object.keys(REASON_META) as ReturnReason[]).map(r => <option key={r} value={r}>{REASON_META[r].label}</option>)}
        </select>
        <select value={filterDecision} onChange={e => setFilterDecision(e.target.value as ReturnDecision | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="todos">Todas las decisiones</option>
          {(Object.keys(DECISION_META) as ReturnDecision[]).map(d => <option key={d} value={d}>{DECISION_META[d].label}</option>)}
        </select>
      </div>

      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs font-bold text-[var(--text-tertiary)] bg-[var(--surface-alt)] dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">Fecha</th><th className="px-2 sm:px-4 py-2 sm:py-3">Pedido</th><th className="px-2 sm:px-4 py-2 sm:py-3">Producto</th><th className="px-2 sm:px-4 py-2 sm:py-3">Valor</th><th className="px-2 sm:px-4 py-2 sm:py-3">Motivo</th><th className="px-2 sm:px-4 py-2 sm:py-3">Decisión</th><th className="px-2 sm:px-4 py-2 sm:py-3"></th></tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:bg-[var(--surface-alt)] dark:hover:bg-accent/20 transition-colors">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)]">{r.date}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono text-xs text-[var(--text-primary)] dark:text-[var(--text-primary)]">{r.orderRef}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{r.product}<br/><span className="text-xs text-[var(--text-tertiary)]">{r.clientName}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--data-error-500)]">{fmt(r.totalValue)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><StatusBadge variant={REASON_META[r.reason].variant} label={REASON_META[r.reason].label} /></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold", DECISION_META[r.decision].color)}>{DECISION_META[r.decision].label}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(r)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5 inline" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{detail.product}</CardTitle>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[["Pedido", detail.orderRef], ["Fecha", detail.date], ["Cliente", detail.clientName], ["Cantidad", String(detail.quantity)], ["Precio unitario", fmt(detail.unitPrice)], ["Valor total", fmt(detail.totalValue)], ["Motivo", REASON_META[detail.reason].label], ["Decisión", DECISION_META[detail.decision].label], ["Inspección", INSPECTION_META[detail.inspection].label], ["Restockeado", detail.restocked ? "Sí" : "No"], ["Procesado por", detail.processedBy]].map(([k, v]) => (
                <div key={k}><p className="text-xs text-[var(--text-tertiary)]">{k}</p><p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{v}</p></div>
              ))}
            </div>
            {detail.notes && (
              <div><p className="text-xs text-[var(--text-tertiary)] mb-1">Notas</p><p className="text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] bg-[var(--surface-alt)] dark:bg-surface rounded-xl p-3">{detail.notes}</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
