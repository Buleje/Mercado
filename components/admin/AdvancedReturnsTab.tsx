"use client";

import { useState, useMemo } from "react";
import {
  RotateCcw, Download, Search, Eye, X, Package,
  AlertTriangle, CheckCircle2, DollarSign, Clock,
  XCircle, RefreshCw,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

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

const REASON_META: Record<ReturnReason, { label: string; color: string; bg: string }> = {
  defectuoso:        { label: "Defectuoso",         color: "text-red-600",     bg: "bg-red-100 dark:bg-red-900/30" },
  vencido:           { label: "Vencido",             color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  equivocado:        { label: "Producto equivocado", color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/30" },
  insatisfecho:      { label: "Insatisfecho",        color: "text-violet-600",  bg: "bg-violet-100 dark:bg-violet-900/30" },
  "dañado-transporte": { label: "Dañado en transporte", color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900/30" },
  duplicado:         { label: "Pedido duplicado",    color: "text-gray-600",    bg: "bg-gray-100 dark:bg-gray-800/30" },
};

const DECISION_META: Record<ReturnDecision, { label: string; color: string }> = {
  reembolso: { label: "Reembolso",   color: "text-emerald-600" },
  reemplazo: { label: "Reemplazo",   color: "text-blue-600" },
  credito:   { label: "Crédito",     color: "text-violet-600" },
  rechazado: { label: "Rechazado",   color: "text-red-600" },
  pendiente: { label: "Pendiente",   color: "text-amber-600" },
};

const INSPECTION_META: Record<InspectionResult, { label: string; color: string }> = {
  aprobado:   { label: "Aprobado",  color: "text-emerald-600" },
  parcial:    { label: "Parcial",   color: "text-amber-600" },
  rechazado:  { label: "Rechazado", color: "text-red-600" },
  pendiente:  { label: "Pendiente", color: "text-gray-500" },
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <RotateCcw className="h-6 w-6 text-primary" /> Devoluciones Avanzadas
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">RMA, inspección, decisiones y estadísticas por motivo</p>
        </div>
        <button onClick={() => exportToCSV(records.map(r => ({ fecha: r.date, pedido: r.orderRef, cliente: r.clientName, producto: r.product, cantidad: r.quantity, valor: r.totalValue, motivo: REASON_META[r.reason].label, decision: DECISION_META[r.decision].label, inspeccion: INSPECTION_META[r.inspection].label, restock: r.restocked ? "Sí" : "No" })), "devoluciones")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Valor en devoluciones", value: fmt(stats.totalValue), color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
          { label: "Reembolsado", value: fmt(stats.refunded), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Restockeados", value: String(stats.restocked), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Pendientes", value: String(stats.pending), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Reason distribution */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5">
        <h3 className="font-extrabold text-sm text-gray-900 dark:text-foreground flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-amber-500" /> Motivos de devolución</h3>
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cliente, producto, pedido..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterReason} onChange={e => setFilterReason(e.target.value as ReturnReason | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los motivos</option>
          {(Object.keys(REASON_META) as ReturnReason[]).map(r => <option key={r} value={r}>{REASON_META[r].label}</option>)}
        </select>
        <select value={filterDecision} onChange={e => setFilterDecision(e.target.value as ReturnDecision | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todas las decisiones</option>
          {(Object.keys(DECISION_META) as ReturnDecision[]).map(d => <option key={d} value={d}>{DECISION_META[d].label}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Pedido</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Decisión</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3 text-gray-500">{r.date}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-foreground">{r.orderRef}</td>
                  <td className="px-4 py-3 font-bold text-gray-800 dark:text-foreground">{r.product}<br/><span className="text-xs text-gray-400">{r.clientName}</span></td>
                  <td className="px-4 py-3 font-bold text-red-600">{fmt(r.totalValue)}</td>
                  <td className="px-4 py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", REASON_META[r.reason].bg, REASON_META[r.reason].color)}>{REASON_META[r.reason].label}</span></td>
                  <td className="px-4 py-3"><span className={cn("text-xs font-bold", DECISION_META[r.decision].color)}>{DECISION_META[r.decision].label}</span></td>
                  <td className="px-4 py-3"><button onClick={() => setDetail(r)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5 inline" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.product}</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[["Pedido", detail.orderRef], ["Fecha", detail.date], ["Cliente", detail.clientName], ["Cantidad", String(detail.quantity)], ["Precio unitario", fmt(detail.unitPrice)], ["Valor total", fmt(detail.totalValue)], ["Motivo", REASON_META[detail.reason].label], ["Decisión", DECISION_META[detail.decision].label], ["Inspección", INSPECTION_META[detail.inspection].label], ["Restockeado", detail.restocked ? "Sí" : "No"], ["Procesado por", detail.processedBy]].map(([k, v]) => (
                <div key={k}><p className="text-xs text-gray-400">{k}</p><p className="font-bold text-gray-800 dark:text-foreground">{v}</p></div>
              ))}
            </div>
            {detail.notes && (
              <div><p className="text-xs text-gray-400 mb-1">Notas</p><p className="text-sm text-gray-700 dark:text-foreground bg-gray-50 dark:bg-surface rounded-xl p-3">{detail.notes}</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
