"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import {
  Banknote, CheckCircle, Clock, Download, Search, Eye, X,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PayrollStatus = "pendiente" | "pagado" | "observacion";

type PayrollLine = {
  id: string;
  employeeId: string;
  employeeName: string;
  role: string;
  department: string;
  month: string;       // "2026-03"
  baseSalary: number;
  overtime: number;
  bonuses: number;
  grossSalary: number;
  snpOrAfp: number;    // 13% AFP / 10% ONP
  incomeTax: number;   // 5th category
  otherDiscounts: number;
  netSalary: number;
  paymentDate?: string;
  paymentMethod: "efectivo" | "transferencia" | "cheque";
  status: PayrollStatus;
  notes: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const MONTHS = ["2026-03", "2026-02", "2026-01", "2025-12"];
const MONTH_LABELS: Record<string, string> = {
  "2026-03": "Marzo 2026", "2026-02": "Febrero 2026",
  "2026-01": "Enero 2026", "2025-12": "Diciembre 2025",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PayrollTab() {
  const [selectedMonth, setSelectedMonth] = useState("2026-03");
  const [payroll, setPayroll] = useState<PayrollLine[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<PayrollStatus | "todos">("todos");
  const [detail, setDetail] = useState<PayrollLine | null>(null);

  const monthPayroll = useMemo(() => {
    let list = payroll.filter(p => p.month === selectedMonth);
    if (filterStatus !== "todos") list = list.filter(p => p.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.employeeName.toLowerCase().includes(q) || p.department.toLowerCase().includes(q));
    }
    return list;
  }, [payroll, selectedMonth, filterStatus, search]);

  const totals = useMemo(() => ({
    gross: monthPayroll.reduce((s, p) => s + p.grossSalary, 0),
    afp: monthPayroll.reduce((s, p) => s + p.snpOrAfp, 0),
    tax: monthPayroll.reduce((s, p) => s + p.incomeTax, 0),
    net: monthPayroll.reduce((s, p) => s + p.netSalary, 0),
    pending: monthPayroll.filter(p => p.status === "pendiente").length,
    paid: monthPayroll.filter(p => p.status === "pagado").length,
  }), [monthPayroll]);

  function markPaid(id: string) {
    setPayroll(prev => prev.map(p => p.id === id ? { ...p, status: "pagado", paymentDate: new Date().toISOString().slice(0, 10) } : p));
    if (detail?.id === id) setDetail(prev => prev ? { ...prev, status: "pagado", paymentDate: new Date().toISOString().slice(0, 10) } : null);
  }

  function markAllPaid() {
    const ids = monthPayroll.filter(p => p.status === "pendiente").map(p => p.id);
    const today = new Date().toISOString().slice(0, 10);
    setPayroll(prev => prev.map(p => ids.includes(p.id) ? { ...p, status: "pagado", paymentDate: today } : p));
  }

  const STATUS_META: Record<PayrollStatus, { label: string; color: string; bg: string }> = {
    pendiente:   { label: "Pendiente",   color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30"   },
    pagado:      { label: "Pagado",      color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",bg: "bg-primary/10 dark:bg-primary/15"},
    observacion: { label: "Observación", color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",        bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30"        },
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" /> Nómina
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Planilla mensual, descuentos AFP/ONP y control de pagos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => exportToCSV(monthPayroll.map(p => ({ empleado: p.employeeName, cargo: p.role, departamento: p.department, mes: MONTH_LABELS[p.month] ?? p.month, salario_base: p.baseSalary, horas_extra: p.overtime, bonificaciones: p.bonuses, bruto: p.grossSalary, afp_snp: p.snpOrAfp, renta_5ta: p.incomeTax, neto: p.netSalary, estado: p.status, fecha_pago: p.paymentDate ?? "" })), `nomina-${selectedMonth}`)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          {totals.pending > 0 && (
            <button onClick={markAllPaid} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-white text-sm font-semibold hover:bg-primary/10 transition-colors">
              <CheckCircle className="h-4 w-4" /> Pagar todos ({totals.pending})
            </button>
          )}
        </div>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {MONTHS.map(m => (
          <button key={m} onClick={() => setSelectedMonth(m)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-semibold rounded-lg transition-colors", selectedMonth === m ? "bg-primary text-white" : "bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-accent")}>
            {MONTH_LABELS[m] ?? m}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <div className="rounded-xl bg-primary/10 dark:bg-primary/15 p-4">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Total bruto</p>
          <p className="text-lg font-extrabold text-[var(--data-success-500)]">{fmt(totals.gross)}</p>
        </div>
        <div className="rounded-xl bg-[var(--data-warning-50)] dark:bg-amber-950/30 p-4">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Descuentos (AFP+IR)</p>
          <p className="text-lg font-extrabold text-[var(--data-warning-500)]">{fmt(totals.afp + totals.tax)}</p>
        </div>
        <div className="rounded-xl bg-primary/10 dark:bg-primary/15 p-4">
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Total neto a pagar</p>
          <p className="text-lg font-extrabold text-[var(--data-success-500)]">{fmt(totals.net)}</p>
        </div>
        <div className={cn("rounded-xl p-4", totals.pending > 0 ? "bg-[var(--data-warning-50)] dark:bg-amber-950/30" : "bg-primary/10 dark:bg-primary/15")}>
          <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{totals.pending > 0 ? "Pagos pendientes" : "Todo pagado"}</p>
          <p className={cn("text-lg font-extrabold", totals.pending > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--data-success-500)]")}>{totals.pending > 0 ? `${totals.pending} empleado(s)` : `${totals.paid} pagados`}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as PayrollStatus | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as PayrollStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Empleado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Bruto</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--data-warning-500)]">AFP/ONP</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--data-warning-500)]">Renta 5ta</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--data-success-500)]">Neto</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Estado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {monthPayroll.map(p => {
                const sm = STATUS_META[p.status];
                return (
                  <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30">
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <p className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{p.employeeName}</p>
                      <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{p.role} · {p.department}</p>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(p.grossSalary)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-[var(--data-warning-500)]">{fmt(p.snpOrAfp)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-[var(--data-warning-500)]">{fmt(p.incomeTax)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold text-[var(--data-success-500)]">{fmt(p.netSalary)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                      <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full", sm.bg, sm.color)}>
                        {p.status === "pagado" ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {sm.label}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button onClick={() => setDetail(p)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors" title="Ver detalle">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {p.status === "pendiente" && (
                          <button onClick={() => markPaid(p.id)} className="px-2.5 py-1 text-xs rounded-lg bg-primary/10 text-white font-semibold hover:bg-primary/10 transition-colors">
                            Pagar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-surface/50 border-t-2 border-[var(--rule-base)] dark:border-[var(--rule-base)]">
              <tr>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] uppercase">TOTAL {MONTH_LABELS[selectedMonth]}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(totals.gross)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold text-[var(--data-warning-500)]">{fmt(totals.afp)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold text-[var(--data-warning-500)]">{fmt(totals.tax)}</td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold text-[var(--data-success-500)]">{fmt(totals.net)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Payslip detail modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Boleta de pago</CardTitle>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 text-sm space-y-2">
              <p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{detail.employeeName}</p>
              <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{detail.role} · {detail.department} · {MONTH_LABELS[detail.month] ?? detail.month}</p>
            </div>
            <div className="space-y-2 text-sm">
              <Row label="Salario base" value={fmt(detail.baseSalary)} />
              {detail.overtime > 0 && <Row label="Horas extra" value={`+${fmt(detail.overtime)}`} vcolor="text-[var(--data-success-500)]" />}
              {detail.bonuses > 0 && <Row label="Bonificaciones" value={`+${fmt(detail.bonuses)}`} vcolor="text-[var(--data-success-500)]" />}
              <div className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] pt-2">
                <Row label="Salario bruto" value={fmt(detail.grossSalary)} bold />
              </div>
              <Row label="AFP / ONP (13%)" value={`-${fmt(detail.snpOrAfp)}`} vcolor="text-[var(--data-warning-600)]" />
              {detail.incomeTax > 0 && <Row label="Renta 5ta cat." value={`-${fmt(detail.incomeTax)}`} vcolor="text-[var(--data-warning-600)]" />}
              {detail.otherDiscounts > 0 && <Row label="Otros descuentos" value={`-${fmt(detail.otherDiscounts)}`} vcolor="text-[var(--data-error-500)]" />}
              <div className="border-t-2 border-[var(--rule-base)] dark:border-[var(--rule-base)] pt-2">
                <Row label="SALARIO NETO" value={fmt(detail.netSalary)} bold accent />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {detail.status === "pendiente" && (
                <button onClick={() => markPaid(detail.id)} className="flex-1 py-2.5 text-sm rounded-lg bg-primary/10 text-white font-semibold hover:bg-primary/10">Marcar como pagado</button>
              )}
              {detail.status === "pagado" && (
                <p className="text-xs text-[var(--data-success-500)] font-semibold text-center w-full">Pagado el {detail.paymentDate}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, accent, vcolor }: { label: string; value: string; bold?: boolean; accent?: boolean; vcolor?: string }) {
  return (
    <div className="flex justify-between">
      <span className={cn("text-[var(--text-secondary)] dark:text-muted", bold && "font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]")}>{label}</span>
      <span className={cn("font-semibold", bold && "font-extrabold", accent ? "text-[var(--data-success-500)] text-base" : vcolor ?? "text-[var(--text-primary)] dark:text-[var(--text-primary)]")}>{value}</span>
    </div>
  );
}
