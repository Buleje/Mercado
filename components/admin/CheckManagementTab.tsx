"use client";

import { useState, useMemo } from "react";
import {
  Wallet, Download, Search, Eye, X,
  Calendar, AlertTriangle, Clock,
  ArrowUpDown, Ban,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type CheckType = "recibido" | "emitido";
type CheckStatus = "en-cartera" | "depositado" | "cobrado" | "pagado" | "rebotado" | "por-depositar";

type Check = {
  id: string;
  number: string;
  bank: string;
  type: CheckType;
  amount: number;
  issueDate: string;
  dueDate: string;
  depositDate?: string;
  status: CheckStatus;
  party: string; // client or supplier
  notes: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const STATUS_MAP: Record<CheckStatus, { label: string; color: string; bg: string }> = {
  "en-cartera":    { label: "En cartera",    color: "text-blue-600",    bg: "bg-blue-100 dark:bg-blue-900/30" },
  "por-depositar": { label: "Por depositar", color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  depositado:      { label: "Depositado",    color: "text-violet-600",  bg: "bg-violet-100 dark:bg-violet-900/30" },
  cobrado:         { label: "Cobrado",       color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  pagado:          { label: "Pagado",        color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  rebotado:        { label: "Rebotado",      color: "text-red-600",     bg: "bg-red-100 dark:bg-red-900/30" },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const CHECKS: Check[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function CheckManagementTab() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<CheckType | "todos">("todos");
  const [filterStatus, setFilterStatus] = useState<CheckStatus | "todos">("todos");
  const [detail, setDetail] = useState<Check | null>(null);

  const stats = useMemo(() => {
    const received = CHECKS.filter(c => c.type === "recibido" && !["cobrado", "rebotado"].includes(c.status));
    const issued = CHECKS.filter(c => c.type === "emitido" && !["pagado"].includes(c.status));
    const receivedTotal = received.reduce((s, c) => s + c.amount, 0);
    const issuedTotal = issued.reduce((s, c) => s + c.amount, 0);
    const bounced = CHECKS.filter(c => c.status === "rebotado").length;
    const toDeposit = CHECKS.filter(c => c.status === "por-depositar").length;
    return { receivedTotal, issuedTotal, bounced, toDeposit };
  }, []);

  const filtered = useMemo(() => {
    let list = CHECKS;
    if (filterType !== "todos") list = list.filter(c => c.type === filterType);
    if (filterStatus !== "todos") list = list.filter(c => c.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.party.toLowerCase().includes(q) || c.number.includes(q) || c.bank.toLowerCase().includes(q));
    }
    return list;
  }, [search, filterType, filterStatus]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Gestión de Cheques
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Portafolio de cheques recibidos y emitidos, depósitos y rebotes</p>
        </div>
        <button onClick={() => exportToCSV(CHECKS.map(c => ({ numero: c.number, banco: c.bank, tipo: c.type, monto: c.amount, emision: c.issueDate, vencimiento: c.dueDate, deposito: c.depositDate || "-", estado: STATUS_MAP[c.status].label, entidad: c.party })), "cheques")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Recibidos en cartera", value: fmt(stats.receivedTotal), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: ArrowUpDown },
          { label: "Emitidos pendientes", value: fmt(stats.issuedTotal), color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", icon: Clock },
          { label: "Por depositar", value: String(stats.toDeposit), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", icon: Calendar },
          { label: "Rebotados", value: String(stats.bounced), color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", icon: Ban },
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

      {stats.bounced > 0 && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 rounded-xl p-3 flex flex-wrap items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">Alerta: {stats.bounced} cheque(s) rebotado(s)</p>
            <p className="text-xs text-red-600/80">Revisar y contactar a los clientes correspondientes</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por entidad, número, banco..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value as typeof filterType)} className="px-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos</option>
          <option value="recibido">Recibidos</option>
          <option value="emitido">Emitidos</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} className="px-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">Nro</th><th className="px-2 sm:px-4 py-2 sm:py-3">Banco</th><th className="px-2 sm:px-4 py-2 sm:py-3">Tipo</th><th className="px-2 sm:px-4 py-2 sm:py-3">Entidad</th><th className="px-2 sm:px-4 py-2 sm:py-3">Monto</th><th className="px-2 sm:px-4 py-2 sm:py-3">Vencimiento</th><th className="px-2 sm:px-4 py-2 sm:py-3">Estado</th><th className="px-2 sm:px-4 py-2 sm:py-3"></th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className={cn("border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20", c.status === "rebotado" && "bg-red-50/50 dark:bg-red-950/10")}>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono text-xs font-bold text-gray-700 dark:text-foreground">{c.number}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-gray-600 dark:text-muted">{c.bank}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", c.type === "recibido" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600")}>{c.type === "recibido" ? "Recibido" : "Emitido"}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-800 dark:text-foreground">{c.party}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-gray-800 dark:text-foreground">{fmt(c.amount)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-gray-500 flex items-center gap-1"><Calendar className="h-3 w-3" />{c.dueDate}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", STATUS_MAP[c.status].bg, STATUS_MAP[c.status].color)}>{STATUS_MAP[c.status].label}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(c)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-3 sm:p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Cheque #{detail.number}</h3>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[["Banco", detail.bank], ["Tipo", detail.type === "recibido" ? "Recibido" : "Emitido"], ["Entidad", detail.party], ["Monto", fmt(detail.amount)], ["Emisión", detail.issueDate], ["Vencimiento", detail.dueDate], ["Depósito", detail.depositDate || "-"], ["Estado", STATUS_MAP[detail.status].label]].map(([k, v]) => (
                <div key={k as string}><p className="text-xs text-gray-400">{k as string}</p><p className="font-bold text-gray-800 dark:text-foreground">{v as string}</p></div>
              ))}
            </div>
            {detail.notes && <p className="text-xs text-gray-400 italic border-t border-gray-100 dark:border-card-border pt-2">{detail.notes}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
