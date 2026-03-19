"use client";

import { useState, useMemo } from "react";
import { RotateCcw, Package, Clock, CheckCircle, XCircle, AlertTriangle, Search, Filter, Download, ArrowRight, Eye } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type Return = {
  id: string; orderId: string; customer: string; reason: string; items: { name: string; qty: number; price: number }[];
  status: "solicitada" | "aprobada" | "recogida" | "inspeccion" | "completada" | "rechazada";
  requestDate: string; resolvedDate: string | null; refundAmount: number; notes: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  solicitada: { label: "Solicitada", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  aprobada: { label: "Aprobada", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  recogida: { label: "En recojo", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
  inspeccion: { label: "Inspección", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  completada: { label: "Completada", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  rechazada: { label: "Rechazada", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const REASONS = ["Producto dañado", "Producto equivocado", "No satisface expectativas", "Fecha vencida", "Duplicado", "Otro"];

const SEED: Return[] = [];

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }); }
function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }

export default function ReturnLogisticsTab() {
  const [returns] = useState(SEED);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);

  const filtered = useMemo(() => {
    let list = returns;
    if (filterStatus !== "all") list = list.filter(r => r.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.customer.toLowerCase().includes(q) || r.orderId.toLowerCase().includes(q));
    }
    return list;
  }, [returns, filterStatus, search]);

  const pending = returns.filter(r => !["completada", "rechazada"].includes(r.status)).length;
  const totalRefund = returns.filter(r => r.status === "completada").reduce((s, r) => s + r.refundAmount, 0);
  const rejectedPct = returns.length > 0 ? ((returns.filter(r => r.status === "rechazada").length / returns.length) * 100).toFixed(0) : "0";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2"><RotateCcw className="h-6 w-6 text-primary" /> Logística Inversa</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Gestión de devoluciones, recojos y reembolsos</p>
        </div>
        <button onClick={() => exportToCSV(filtered.map(r => ({ pedido: r.orderId, cliente: r.customer, razon: r.reason, estado: STATUS_CONFIG[r.status].label, monto: r.refundAmount })), "devoluciones")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Devoluciones activas", value: pending, color: "text-amber-500" },
          { label: "Total devoluciones", value: returns.length, color: "text-blue-500" },
          { label: "Reembolsado (mes)", value: fmt(totalRefund), color: "text-red-500" },
          { label: "Tasa rechazo", value: `${rejectedPct}%`, color: "text-violet-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" placeholder="Buscar por pedido o cliente…" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="h-4 w-4 text-gray-400" />
          {["all", "solicitada", "aprobada", "recogida", "inspeccion", "completada", "rechazada"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold transition-colors", filterStatus === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>{s === "all" ? "Todas" : STATUS_CONFIG[s].label}</button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(r => (
          <div key={r.id} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{r.orderId}</h4>
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", STATUS_CONFIG[r.status].color)}>{STATUS_CONFIG[r.status].label}</span>
                  <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 dark:bg-surface px-2 py-0.5 rounded-full">{r.reason}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted">{r.customer} · {r.items.length} producto{r.items.length > 1 ? "s" : ""}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {r.items.map((item, i) => (
                    <span key={i} className="text-[10px] bg-gray-50 dark:bg-surface px-2 py-1 rounded-lg text-gray-600 dark:text-muted">
                      {item.name} x{item.qty} ({fmt(item.price)})
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-extrabold text-red-600">{fmt(r.refundAmount)}</p>
                <p className="text-[10px] text-gray-400 mt-1">Solicitud: {fmtDate(r.requestDate)}</p>
                {r.resolvedDate && <p className="text-[10px] text-emerald-600">Resuelto: {fmtDate(r.resolvedDate)}</p>}
              </div>
            </div>
            {r.notes && (
              <div className="mt-3 flex items-start gap-2 text-xs bg-blue-50 dark:bg-blue-950/10 text-blue-700 dark:text-blue-400 px-3 py-2 rounded-xl">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {r.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-muted">No se encontraron devoluciones</p>
        </div>
      )}
    </div>
  );
}
