"use client";

import { useState, useMemo } from "react";
import {
  FileText, Download, Search, Eye, X, Trophy,
  Clock,
  ArrowUpDown, Send,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type RFQStatus = "abierta" | "evaluando" | "adjudicada" | "cerrada" | "cancelada";

type QuoteDetails = {
  supplier: string;
  unitPrice: number;
  leadDays: number;
  qualityScore: number; // 1-5
  paymentTerms: string;
  notes: string;
};

type RFQ = {
  id: string;
  ref: string;
  product: string;
  quantity: number;
  unit: string;
  createdAt: string;
  deadline: string;
  status: RFQStatus;
  quotes: QuoteDetails[];
  winner?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const STATUS_MAP: Record<RFQStatus, { label: string; color: string; bg: string }> = {
  abierta:     { label: "Abierta",     color: "text-emerald-600",    bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  evaluando:   { label: "Evaluando",   color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  adjudicada:  { label: "Adjudicada",  color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  cerrada:     { label: "Cerrada",     color: "text-gray-600",    bg: "bg-gray-100 dark:bg-gray-800/30" },
  cancelada:   { label: "Cancelada",   color: "text-red-600",     bg: "bg-red-100 dark:bg-red-900/30" },
};

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

// ── Seed Data ─────────────────────────────────────────────────────────────────

const RFQS: RFQ[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function RFQTab() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<RFQStatus | "todos">("todos");
  const [detail, setDetail] = useState<RFQ | null>(null);
  const [sortBy, setSortBy] = useState<"price" | "lead" | "quality">("price");

  const stats = useMemo(() => {
    const open = RFQS.filter(r => r.status === "abierta").length;
    const evaluating = RFQS.filter(r => r.status === "evaluando").length;
    const awarded = RFQS.filter(r => r.status === "adjudicada" || r.status === "cerrada").length;
    const avgQuotes = RFQS.length ? (RFQS.reduce((s, r) => s + r.quotes.length, 0) / RFQS.length).toFixed(1) : "0";
    return { open, evaluating, awarded, avgQuotes };
  }, []);

  const filtered = useMemo(() => {
    let list = RFQS;
    if (filterStatus !== "todos") list = list.filter(r => r.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.product.toLowerCase().includes(q) || r.ref.toLowerCase().includes(q));
    }
    return list;
  }, [search, filterStatus]);

  const sortedQuotes = useMemo(() => {
    if (!detail) return [];
    const q = [...detail.quotes];
    if (sortBy === "price") q.sort((a, b) => a.unitPrice - b.unitPrice);
    else if (sortBy === "lead") q.sort((a, b) => a.leadDays - b.leadDays);
    else q.sort((a, b) => b.qualityScore - a.qualityScore);
    return q;
  }, [detail, sortBy]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Cotizaciones Comparativas (RFQ)
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Solicita y compara cotizaciones de múltiples proveedores</p>
        </div>
        <button onClick={() => exportToCSV(RFQS.map(r => ({ ref: r.ref, producto: r.product, cantidad: r.quantity, unidad: r.unit, creado: r.createdAt, limite: r.deadline, estado: STATUS_MAP[r.status].label, cotizaciones: r.quotes.length, ganador: r.winner || "-" })), "cotizaciones-rfq")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Abiertas", value: String(stats.open), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: Send },
          { label: "Evaluando", value: String(stats.evaluating), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", icon: Clock },
          { label: "Adjudicadas/Cerradas", value: String(stats.awarded), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: Trophy },
          { label: "Promedio cotizaciones", value: stats.avgQuotes, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30", icon: ArrowUpDown },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-2xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5", color)} />
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto o referencia..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as RFQStatus | "todos")} className="px-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">Ref</th><th className="px-2 sm:px-4 py-2 sm:py-3">Producto</th><th className="px-2 sm:px-4 py-2 sm:py-3">Cant.</th><th className="px-2 sm:px-4 py-2 sm:py-3">Creado</th><th className="px-2 sm:px-4 py-2 sm:py-3">Límite</th><th className="px-2 sm:px-4 py-2 sm:py-3">Cotizaciones</th><th className="px-2 sm:px-4 py-2 sm:py-3">Estado</th><th className="px-2 sm:px-4 py-2 sm:py-3">Ganador</th><th className="px-2 sm:px-4 py-2 sm:py-3"></th></tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono text-xs font-bold text-gray-700 dark:text-foreground">{r.ref}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-800 dark:text-foreground">{r.product}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-600 dark:text-muted">{r.quantity} {r.unit}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500">{r.createdAt}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500">{r.deadline}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-center font-bold text-gray-700 dark:text-foreground">{r.quotes.length}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", STATUS_MAP[r.status].bg, STATUS_MAP[r.status].color)}>{STATUS_MAP[r.status].label}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-600 dark:text-muted">{r.winner || "-"}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(r)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal — Comparison Matrix */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-2xl space-y-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.ref} — {detail.product}</h3>
                <p className="text-xs text-gray-400">{detail.quantity} {detail.unit} · Límite: {detail.deadline}</p>
              </div>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>

            {detail.quotes.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Sin cotizaciones recibidas</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs font-bold text-gray-500 dark:text-muted mt-1">Ordenar por:</span>
                  {(["price", "lead", "quality"] as const).map(s => (
                    <button key={s} onClick={() => setSortBy(s)} className={cn("text-xs px-2 py-1 rounded-lg font-bold", sortBy === s ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted")}>
                      {s === "price" ? "Precio" : s === "lead" ? "Plazo" : "Calidad"}
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Precio unit.</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Plazo</th><th className="px-3 py-2">Calidad</th><th className="px-3 py-2">Pago</th></tr></thead>
                    <tbody>
                      {sortedQuotes.map((q, i) => (
                        <tr key={q.supplier} className={cn("border-t border-gray-100 dark:border-card-border", i === 0 && sortBy === "price" && "bg-emerald-50 dark:bg-emerald-950/20", detail.winner === q.supplier && "ring-2 ring-primary ring-inset")}>
                          <td className="px-3 py-2 font-bold text-gray-800 dark:text-foreground flex items-center gap-1">{detail.winner === q.supplier && <Trophy className="h-3.5 w-3.5 text-amber-500" />}{q.supplier}</td>
                          <td className="px-3 py-2 font-bold text-gray-700 dark:text-foreground">{fmt(q.unitPrice)}</td>
                          <td className="px-3 py-2 font-bold text-gray-700 dark:text-foreground">{fmt(q.unitPrice * detail.quantity)}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-muted">{q.leadDays} días</td>
                          <td className="px-3 py-2 text-amber-500 text-xs">{stars(q.qualityScore)}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{q.paymentTerms}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
