"use client";

import { useState, useMemo } from "react";
import {
  DollarSign, Download, Search, Eye, X,
  Phone, Mail, Clock, Calendar,
  UserX, ShieldAlert, FileText,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type DebtStatus = "al-dia" | "mora-leve" | "mora-moderada" | "mora-grave" | "incobrable";
type RiskLevel = "bajo" | "medio" | "alto" | "crítico";

type CollectionAction = {
  date: string;
  type: "llamada" | "email" | "visita" | "carta";
  result: string;
};

type DebtRecord = {
  id: string;
  customer: string;
  invoiceRef: string;
  amount: number;
  paid: number;
  dueDate: string;
  daysOverdue: number;
  status: DebtStatus;
  riskLevel: RiskLevel;
  paymentPlan: boolean;
  actions: CollectionAction[];
  phone: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const STATUS_MAP: Record<DebtStatus, { label: string; color: string; bg: string }> = {
  "al-dia":          { label: "Al día",          color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  "mora-leve":       { label: "Mora leve",       color: "text-amber-600",   bg: "bg-amber-100 dark:bg-amber-900/30" },
  "mora-moderada":   { label: "Mora moderada",   color: "text-orange-600",  bg: "bg-orange-100 dark:bg-orange-900/30" },
  "mora-grave":      { label: "Mora grave",      color: "text-red-600",     bg: "bg-red-100 dark:bg-red-900/30" },
  incobrable:        { label: "Incobrable",      color: "text-gray-600",    bg: "bg-gray-100 dark:bg-gray-800/30" },
};

const RISK_MAP: Record<RiskLevel, { label: string; color: string }> = {
  bajo:     { label: "Bajo",    color: "text-emerald-600" },
  medio:    { label: "Medio",   color: "text-amber-600" },
  alto:     { label: "Alto",    color: "text-orange-600" },
  "crítico":{ label: "Crítico", color: "text-red-600" },
};

const ACTION_ICONS = { llamada: Phone, email: Mail, visita: UserX, carta: FileText };

// ── Seed Data ─────────────────────────────────────────────────────────────────

const DEBTS: DebtRecord[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function CollectionCenterTab() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<DebtStatus | "todos">("todos");
  const [detail, setDetail] = useState<DebtRecord | null>(null);

  const stats = useMemo(() => {
    const totalDebt = DEBTS.reduce((s, d) => s + (d.amount - d.paid), 0);
    const overdue = DEBTS.filter(d => d.daysOverdue > 0).reduce((s, d) => s + (d.amount - d.paid), 0);
    const withPlan = DEBTS.filter(d => d.paymentPlan).length;
    const critical = DEBTS.filter(d => d.riskLevel === "crítico" || d.riskLevel === "alto").length;
    return { totalDebt, overdue, withPlan, critical };
  }, []);

  const filtered = useMemo(() => {
    let list = DEBTS;
    if (filterStatus !== "todos") list = list.filter(d => d.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d => d.customer.toLowerCase().includes(q) || d.invoiceRef.toLowerCase().includes(q));
    }
    return list;
  }, [search, filterStatus]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" /> Centro de Cobros
          </h1>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Gestión de morosidad, planes de pago y scoring de riesgo</p>
        </div>
        <button onClick={() => exportToCSV(DEBTS.map(d => ({ cliente: d.customer, factura: d.invoiceRef, monto: d.amount, pagado: d.paid, saldo: d.amount - d.paid, vencimiento: d.dueDate, dias_mora: d.daysOverdue, estado: STATUS_MAP[d.status].label, riesgo: RISK_MAP[d.riskLevel].label, plan_pago: d.paymentPlan ? "Sí" : "No" })), "centro-cobros")} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Cartera total", value: fmt(stats.totalDebt), color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30", icon: DollarSign },
          { label: "En mora", value: fmt(stats.overdue), color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30", icon: Clock },
          { label: "Con plan de pago", value: String(stats.withPlan), color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: Calendar },
          { label: "Riesgo alto/crítico", value: String(stats.critical), color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30", icon: ShieldAlert },
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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente o factura..." className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} className="px-3 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-gray-700 dark:text-foreground">
          <option value="todos">Todos</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-bold text-gray-400 bg-gray-50 dark:bg-surface"><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Factura</th><th className="px-4 py-3">Saldo</th><th className="px-4 py-3">Días mora</th><th className="px-4 py-3">Riesgo</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Gestiones</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className={cn("border-t border-gray-100 dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20", d.riskLevel === "crítico" && "bg-red-50/50 dark:bg-red-950/10")}>
                  <td className="px-4 py-3 font-bold text-gray-800 dark:text-foreground">{d.customer}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-muted">{d.invoiceRef}</td>
                  <td className="px-4 py-3 font-bold text-gray-800 dark:text-foreground">{fmt(d.amount - d.paid)}</td>
                  <td className={cn("px-4 py-3 font-bold", d.daysOverdue === 0 ? "text-emerald-600" : d.daysOverdue <= 15 ? "text-amber-600" : d.daysOverdue <= 30 ? "text-orange-600" : "text-red-600")}>{d.daysOverdue}</td>
                  <td className="px-4 py-3"><span className={cn("text-xs font-bold", RISK_MAP[d.riskLevel].color)}>{RISK_MAP[d.riskLevel].label}</span></td>
                  <td className="px-4 py-3 text-xs">{d.paymentPlan ? <span className="text-emerald-600 font-bold">✓ Sí</span> : <span className="text-gray-400">No</span>}</td>
                  <td className="px-4 py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", STATUS_MAP[d.status].bg, STATUS_MAP[d.status].color)}>{STATUS_MAP[d.status].label}</span></td>
                  <td className="px-4 py-3 text-center text-xs text-gray-600 dark:text-muted">{d.actions.length}</td>
                  <td className="px-4 py-3"><button onClick={() => setDetail(d)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-6 w-full max-w-lg space-y-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.customer}</h3>
                <p className="text-xs text-gray-400">{detail.invoiceRef} · Tel: {detail.phone}</p>
              </div>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-gray-400" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-400">Monto original</p><p className="font-bold text-gray-800 dark:text-foreground">{fmt(detail.amount)}</p></div>
              <div><p className="text-xs text-gray-400">Pagado</p><p className="font-bold text-gray-800 dark:text-foreground">{fmt(detail.paid)}</p></div>
              <div><p className="text-xs text-gray-400">Saldo pendiente</p><p className="font-extrabold text-red-600">{fmt(detail.amount - detail.paid)}</p></div>
              <div><p className="text-xs text-gray-400">Días en mora</p><p className={cn("font-extrabold", detail.daysOverdue > 30 ? "text-red-600" : "text-amber-600")}>{detail.daysOverdue}</p></div>
              <div><p className="text-xs text-gray-400">Nivel de riesgo</p><p className={cn("font-bold", RISK_MAP[detail.riskLevel].color)}>{RISK_MAP[detail.riskLevel].label}</p></div>
              <div><p className="text-xs text-gray-400">Plan de pago</p><p className={cn("font-bold", detail.paymentPlan ? "text-emerald-600" : "text-gray-400")}>{detail.paymentPlan ? "Activo" : "Sin plan"}</p></div>
            </div>

            <div>
              <h4 className="font-bold text-sm text-gray-700 dark:text-foreground mb-2">Historial de gestiones ({detail.actions.length})</h4>
              {detail.actions.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Sin gestiones registradas</p>
              ) : (
                <div className="space-y-2">
                  {detail.actions.map((a, i) => {
                    const AIcon = ACTION_ICONS[a.type];
                    return (
                      <div key={i} className="bg-gray-50 dark:bg-surface rounded-lg p-3 flex items-start gap-2 text-xs">
                        <AIcon className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-gray-600 dark:text-muted">{a.result}</p>
                          <p className="text-gray-400 mt-0.5">{a.date} · {a.type}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
