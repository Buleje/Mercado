"use client";

import { useState, useMemo } from "react";
import {
  Building2, Download, Search, X,
  CheckCircle, AlertTriangle, Link2, Eye,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReconciliationStatus = "conciliado" | "pendiente" | "discrepancia";

type BankMove = {
  id: string;
  date: string;
  description: string;
  reference: string;
  amount: number;
  type: "ingreso" | "egreso";
  bankAccount: string;
  status: ReconciliationStatus;
  systemRef: string;  // referencia cruzada al sistema  
  notes: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

const STATUS_META: Record<ReconciliationStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  conciliado:   { label: "Conciliado",    color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30", icon: CheckCircle },
  pendiente:    { label: "Pendiente",     color: "text-amber-700 dark:text-amber-400",    bg: "bg-amber-100 dark:bg-amber-900/30",    icon: AlertTriangle },
  discrepancia: { label: "Discrepancia",  color: "text-red-700 dark:text-red-400",         bg: "bg-red-100 dark:bg-red-900/30",        icon: AlertTriangle },
};

const BANK_ACCOUNTS: { id: string; name: string; number: string }[] = [];

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: BankMove[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function BankReconciliationTab() {
  const [moves, setMoves] = useState<BankMove[]>(SEED);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ReconciliationStatus | "todos">("todos");
  const [filterAccount, setFilterAccount] = useState("todos");
  const [filterType, setFilterType] = useState<"todos" | "ingreso" | "egreso">("todos");
  const [detail, setDetail] = useState<BankMove | null>(null);

  const processed = useMemo(() => {
    let list = [...moves];
    if (filterStatus !== "todos") list = list.filter(m => m.status === filterStatus);
    if (filterAccount !== "todos") list = list.filter(m => m.bankAccount === filterAccount);
    if (filterType !== "todos") list = list.filter(m => m.type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m => m.description.toLowerCase().includes(q) || m.reference.toLowerCase().includes(q) || m.systemRef.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [moves, filterStatus, filterAccount, filterType, search]);

  const stats = useMemo(() => {
    const conciliados = moves.filter(m => m.status === "conciliado").length;
    const pendientes = moves.filter(m => m.status === "pendiente").length;
    const discrepancias = moves.filter(m => m.status === "discrepancia").length;
    const ingresos = moves.filter(m => m.type === "ingreso").reduce((s, m) => s + m.amount, 0);
    const egresos = moves.filter(m => m.type === "egreso").reduce((s, m) => s + m.amount, 0);
    return { conciliados, pendientes, discrepancias, ingresos, egresos, neto: ingresos - egresos, pctConciliado: moves.length > 0 ? (conciliados / moves.length) * 100 : 0 };
  }, [moves]);

  function reconcile(id: string) {
    setMoves(prev => prev.map(m => m.id === id ? { ...m, status: "conciliado" as ReconciliationStatus } : m));
  }

  function accountName(id: string) {
    return BANK_ACCOUNTS.find(a => a.id === id)?.name ?? id;
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" /> Conciliación Bancaria
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Cruce de movimientos bancarios vs registros del sistema</p>
        </div>
        <button onClick={() => exportToCSV(processed.map(m => ({ fecha: m.date, descripcion: m.description, referencia: m.reference, tipo: m.type, monto: m.amount, cuenta: accountName(m.bankAccount), estado: m.status, ref_sistema: m.systemRef, notas: m.notes })), "conciliacion-bancaria")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {[
          { label: "Conciliados", value: String(stats.conciliados), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Pendientes", value: String(stats.pendientes), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
          { label: "Discrepancias", value: String(stats.discrepancias), color: "text-red-500", bg: "bg-red-50 dark:bg-red-950/30" },
          { label: "Total ingresos", value: fmt(stats.ingresos), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
          { label: "Total egresos", value: fmt(stats.egresos), color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
          { label: "% Conciliado", value: `${stats.pctConciliado.toFixed(0)}%`, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(stats.pendientes > 0 || stats.discrepancias > 0) && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-700 dark:text-amber-400 text-sm">Movimientos sin conciliar</p>
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-0.5">
              {stats.pendientes > 0 && <span>{stats.pendientes} pendiente(s) de cruce. </span>}
              {stats.discrepancias > 0 && <span className="font-bold">{stats.discrepancias} con discrepancia — requieren revisión manual.</span>}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Descripción, referencia..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ReconciliationStatus | "todos")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as ReconciliationStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todas las cuentas</option>
          {BANK_ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.name} {a.number}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value as "todos" | "ingreso" | "egreso")} className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los tipos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Egresos</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface/50 border-b border-gray-200 dark:border-card-border">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Estado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Fecha</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Descripción</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Cuenta</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs font-bold text-gray-500 dark:text-muted uppercase">Tipo</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-gray-500 dark:text-muted uppercase">Monto</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-gray-500 dark:text-muted uppercase">Ref. Sistema</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {processed.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Sin movimientos.</td></tr>}
              {processed.map(m => {
                const meta = STATUS_META[m.status];
                const Icon = meta.icon;
                return (
                  <tr key={m.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30 transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", meta.bg, meta.color)}><Icon className="h-3 w-3" />{meta.label}</span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(m.date)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-gray-800 dark:text-foreground">{m.description}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-500 dark:text-muted">{accountName(m.bankAccount)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", m.type === "ingreso" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400")}>
                        {m.type === "ingreso" ? "+ Ingreso" : "- Egreso"}
                      </span>
                    </td>
                    <td className={cn("px-2 sm:px-4 py-2 sm:py-3 text-right font-bold", m.type === "ingreso" ? "text-emerald-600" : "text-red-500")}>{m.type === "ingreso" ? "+" : "-"}{fmt(m.amount)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-mono text-gray-400">{m.systemRef || <span className="italic text-amber-500">sin cruce</span>}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex flex-wrap gap-1">
                        {m.status !== "conciliado" && (
                          <button onClick={() => reconcile(m.id)} title="Marcar conciliado" className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20">
                            <Link2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => setDetail(m)} className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-sm">Detalle del movimiento</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Fecha", fmtDate(detail.date)], ["Descripción", detail.description],
                ["Referencia banco", detail.reference], ["Tipo", detail.type === "ingreso" ? "Ingreso" : "Egreso"],
                ["Monto", fmt(detail.amount)], ["Cuenta", accountName(detail.bankAccount)],
                ["Estado", STATUS_META[detail.status].label], ["Ref. sistema", detail.systemRef || "—"],
                ["Notas", detail.notes || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 sm:gap-4">
                  <span className="text-gray-500 dark:text-muted">{k}</span>
                  <span className="font-semibold text-gray-800 dark:text-foreground text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
