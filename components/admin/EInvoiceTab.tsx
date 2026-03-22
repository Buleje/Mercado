"use client";

import { useState, useMemo } from "react";
import {
  FileText, Download, Search, Eye, X, CheckCircle2,
  XCircle, Clock, Send, AlertTriangle, Receipt,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type DocType = "boleta" | "factura" | "nota-credito" | "nota-debito";
type DocStatus = "emitido" | "aceptado" | "rechazado" | "anulado" | "pendiente";

type EDocument = {
  id: string;
  serie: string;
  number: string;
  date: string;
  type: DocType;
  status: DocStatus;
  clientName: string;
  clientRUC: string;
  subtotal: number;
  igv: number;
  total: number;
  items: number;
  sunatResponse: string;
  relatedDoc?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const TYPE_META: Record<DocType, { label: string; color: string; bg: string }> = {
  boleta:         { label: "Boleta",          color: "text-blue-600",     bg: "bg-blue-100 dark:bg-blue-900/30" },
  factura:        { label: "Factura",         color: "text-emerald-600",  bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  "nota-credito": { label: "Nota de crédito", color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  "nota-debito":  { label: "Nota de débito",  color: "text-violet-600",  bg: "bg-violet-100 dark:bg-violet-900/30" },
};

const STATUS_META: Record<DocStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  emitido:   { label: "Emitido",   color: "text-blue-600",    icon: Send },
  aceptado:  { label: "Aceptado",  color: "text-emerald-600", icon: CheckCircle2 },
  rechazado: { label: "Rechazado", color: "text-red-600",     icon: XCircle },
  anulado:   { label: "Anulado",   color: "text-gray-500",    icon: XCircle },
  pendiente: { label: "Pendiente", color: "text-amber-600",   icon: Clock },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: EDocument[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function EInvoiceTab() {
  const [docs] = useState(SEED);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<DocType | "todos">("todos");
  const [filterStatus, setFilterStatus] = useState<DocStatus | "todos">("todos");
  const [detail, setDetail] = useState<EDocument | null>(null);

  const filtered = useMemo(() => {
    let list = [...docs];
    if (filterType !== "todos") list = list.filter(d => d.type === filterType);
    if (filterStatus !== "todos") list = list.filter(d => d.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.clientName.toLowerCase().includes(q) || d.number.includes(q) || d.serie.toLowerCase().includes(q));
    }
    return list;
  }, [docs, filterType, filterStatus, search]);

  const stats = useMemo(() => {
    const accepted = docs.filter(d => d.status === "aceptado");
    const totalEmitted = docs.filter(d => !["anulado"].includes(d.status)).reduce((s, d) => s + d.total, 0);
    const totalIGV = docs.filter(d => !["anulado"].includes(d.status)).reduce((s, d) => s + d.igv, 0);
    const pending = docs.filter(d => d.status === "pendiente").length;
    const rejected = docs.filter(d => d.status === "rechazado").length;
    return { accepted: accepted.length, totalEmitted, totalIGV, pending, rejected, total: docs.length };
  }, [docs]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> Facturación Electrónica
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Comprobantes electrónicos SUNAT — Boletas, facturas, notas</p>
        </div>
        <button onClick={() => exportToCSV(docs.map(d => ({ serie: d.serie, numero: d.number, fecha: d.date, tipo: TYPE_META[d.type].label, estado: STATUS_META[d.status].label, cliente: d.clientName, ruc: d.clientRUC, subtotal: d.subtotal, igv: d.igv, total: d.total })), "e-facturacion")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total emitido", value: fmt(stats.totalEmitted), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "IGV acumulado", value: fmt(stats.totalIGV), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
          { label: "Pendientes SUNAT", value: String(stats.pending), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Rechazados", value: String(stats.rejected), color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* IGV summary card */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5">
        <h3 className="font-extrabold text-sm text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2 mb-3"><FileText className="h-4 w-4 text-primary" /> Resumen tributario del mes</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-sm">
          <div><p className="text-xs text-gray-400">Boletas emitidas</p><p className="font-bold text-gray-800 dark:text-foreground">{docs.filter(d => d.type === "boleta").length}</p></div>
          <div><p className="text-xs text-gray-400">Facturas emitidas</p><p className="font-bold text-gray-800 dark:text-foreground">{docs.filter(d => d.type === "factura").length}</p></div>
          <div><p className="text-xs text-gray-400">Notas de crédito</p><p className="font-bold text-gray-800 dark:text-foreground">{docs.filter(d => d.type === "nota-credito").length}</p></div>
          <div><p className="text-xs text-gray-400">Notas de débito</p><p className="font-bold text-gray-800 dark:text-foreground">{docs.filter(d => d.type === "nota-debito").length}</p></div>
        </div>
      </div>

      {stats.rejected > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-2xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">Hay {stats.rejected} comprobante(s) rechazados por SUNAT</p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">Revise los errores y reenvíe los documentos corregidos antes de la declaración mensual.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cliente, serie, número..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value as DocType | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los tipos</option>
          {(Object.keys(TYPE_META) as DocType[]).map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as DocStatus | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as DocStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      {/* Documents table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">Serie-Nro</th><th className="px-2 sm:px-4 py-2 sm:py-3">Fecha</th><th className="px-2 sm:px-4 py-2 sm:py-3">Tipo</th><th className="px-2 sm:px-4 py-2 sm:py-3">Cliente</th><th className="px-2 sm:px-4 py-2 sm:py-3">Total</th><th className="px-2 sm:px-4 py-2 sm:py-3">Estado</th><th className="px-2 sm:px-4 py-2 sm:py-3"></th></tr></thead>
            <tbody>
              {filtered.map(d => {
                const StatusIcon = STATUS_META[d.status].icon;
                return (
                  <tr key={d.id} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20 transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono font-bold text-gray-800 dark:text-foreground">{d.serie}-{d.number}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500">{d.date}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", TYPE_META[d.type].bg, TYPE_META[d.type].color)}>{TYPE_META[d.type].label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-700 dark:text-foreground">{d.clientName}<br/><span className="text-xs text-gray-400">{d.clientRUC}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-800 dark:text-foreground">{fmt(d.total)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("flex items-center gap-1 text-xs font-bold", STATUS_META[d.status].color)}><StatusIcon className="h-3 w-3" />{STATUS_META[d.status].label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(d)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5 inline" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.serie}-{detail.number}</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[["Tipo", TYPE_META[detail.type].label], ["Fecha", detail.date], ["Cliente", detail.clientName], ["RUC", detail.clientRUC], ["Subtotal", fmt(detail.subtotal)], ["IGV (18%)", fmt(detail.igv)], ["Total", fmt(detail.total)], ["Items", String(detail.items)], ["Estado", STATUS_META[detail.status].label]].map(([k, v]) => (
                <div key={k}><p className="text-xs text-gray-400">{k}</p><p className="font-bold text-gray-800 dark:text-foreground">{v}</p></div>
              ))}
              {detail.relatedDoc && <div><p className="text-xs text-gray-400">Doc. relacionado</p><p className="font-bold text-gray-800 dark:text-foreground">{detail.relatedDoc}</p></div>}
            </div>
            <div><p className="text-xs text-gray-400 mb-1">Respuesta SUNAT</p><p className="text-sm text-gray-700 dark:text-foreground bg-gray-50 dark:bg-surface rounded-xl p-3 font-mono text-xs">{detail.sunatResponse}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}
