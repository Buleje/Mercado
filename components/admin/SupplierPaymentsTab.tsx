"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import {
  HandCoins, Download, Search, Eye, X,
  Calendar, CheckCircle2, Clock, AlertTriangle,
  BadgePercent, Banknote,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentStatus = "pendiente" | "programado" | "pagado" | "vencido" | "parcial";

type SupplierPayment = {
  id: string;
  invoiceRef: string;
  supplier: string;
  amount: number;
  paid: number;
  dueDate: string;
  paidDate?: string;
  paymentMethod: string;
  status: PaymentStatus;
  earlyDiscountPct?: number;
  earlyDiscountDeadline?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const STATUS_MAP: Record<PaymentStatus, { label: string; color: string; bg: string }> = {
  pendiente:  { label: "Pendiente",  color: "text-[var(--data-warning)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/30" },
  programado: { label: "Programado", color: "text-[var(--data-success)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  pagado:     { label: "Pagado",     color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  vencido:    { label: "Vencido",    color: "text-[var(--data-error)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/30" },
  parcial:    { label: "Parcial",    color: "text-[var(--data-warning)]",  bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/30" },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const PAYMENTS: SupplierPayment[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SupplierPaymentsTab() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | "todos">("todos");
  const [detail, setDetail] = useState<SupplierPayment | null>(null);

  const stats = useMemo(() => {
    const totalPending = PAYMENTS.filter(p => p.status !== "pagado").reduce((s, p) => s + (p.amount - p.paid), 0);
    const overdue = PAYMENTS.filter(p => p.status === "vencido").reduce((s, p) => s + (p.amount - p.paid), 0);
    const earlyDiscounts = PAYMENTS.filter(p => p.earlyDiscountPct && p.status !== "pagado").length;
    const paidThisMonth = PAYMENTS.filter(p => p.status === "pagado").reduce((s, p) => s + p.paid, 0);
    return { totalPending, overdue, earlyDiscounts, paidThisMonth };
  }, []);

  const filtered = useMemo(() => {
    let list = PAYMENTS;
    if (filterStatus !== "todos") list = list.filter(p => p.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.supplier.toLowerCase().includes(q) || p.invoiceRef.toLowerCase().includes(q));
    }
    return list;
  }, [search, filterStatus]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <HandCoins className="h-6 w-6 text-primary" /> Pagos a Proveedores
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Programación, seguimiento y conciliación de pagos</p>
        </div>
        <button onClick={() => exportToCSV(PAYMENTS.map(p => ({ factura: p.invoiceRef, proveedor: p.supplier, monto: p.amount, pagado: p.paid, vencimiento: p.dueDate, fecha_pago: p.paidDate || "-", metodo: p.paymentMethod, estado: STATUS_MAP[p.status].label })), "pagos-proveedores")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Por pagar", value: fmt(stats.totalPending), color: "text-[var(--data-warning)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30", icon: Clock },
          { label: "Vencido", value: fmt(stats.overdue), color: "text-[var(--data-error)]", bg: "bg-[var(--data-error-50)] dark:bg-red-950/30", icon: AlertTriangle },
          { label: "Desc. pronto pago", value: String(stats.earlyDiscounts), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]", icon: BadgePercent },
          { label: "Pagado este mes", value: fmt(stats.paidThisMonth), color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: CheckCircle2 },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={cn("rounded-xl p-4 flex items-start gap-3", bg)}>
            <Icon className={cn("h-5 w-5 mt-0.5", color)} />
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{label}</p>
              <p className={cn("text-xl font-extrabold", color)}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Calendar hint — upcoming payments */}
      {PAYMENTS.filter(p => p.earlyDiscountPct && p.status !== "pagado").length > 0 && (
        <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3 flex flex-wrap items-start gap-2">
          <BadgePercent className="h-5 w-5 text-[var(--text-secondary)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)]">Descuentos por pronto pago disponibles</p>
            {PAYMENTS.filter(p => p.earlyDiscountPct && p.status !== "pagado").map(p => (
              <p key={p.id} className="text-xs text-[var(--text-secondary)]/80 dark:text-[var(--text-primary)]/70">{p.supplier}: {p.earlyDiscountPct}% si paga antes del {p.earlyDiscountDeadline} — Ahorro: {fmt(p.amount * (p.earlyDiscountPct! / 100))}</p>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor o factura..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} className="px-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todos</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs font-bold text-[var(--text-tertiary)] bg-gray-50 dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">Factura</th><th className="px-2 sm:px-4 py-2 sm:py-3">Proveedor</th><th className="px-2 sm:px-4 py-2 sm:py-3">Monto</th><th className="px-2 sm:px-4 py-2 sm:py-3">Pagado</th><th className="px-2 sm:px-4 py-2 sm:py-3">Saldo</th><th className="px-2 sm:px-4 py-2 sm:py-3">Vencimiento</th><th className="px-2 sm:px-4 py-2 sm:py-3">Método</th><th className="px-2 sm:px-4 py-2 sm:py-3">Estado</th><th className="px-2 sm:px-4 py-2 sm:py-3"></th></tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-t border-[var(--rule-soft)] dark:border-card-border hover:bg-gray-50 dark:hover:bg-accent/20">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono text-xs font-bold text-[var(--text-primary)] dark:text-foreground">{p.invoiceRef}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-primary)] dark:text-foreground">{p.supplier}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(p.amount)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] dark:text-muted">{fmt(p.paid)}</td>
                  <td className={cn("px-2 sm:px-4 py-2 sm:py-3 font-bold", p.amount - p.paid > 0 ? "text-[var(--data-warning)]" : "text-[var(--data-success)]")}>{fmt(p.amount - p.paid)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-secondary)] flex items-center gap-1"><Calendar className="h-3 w-3" />{p.dueDate}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] flex items-center gap-1"><Banknote className="h-3 w-3" />{p.paymentMethod}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", STATUS_MAP[p.status].bg, STATUS_MAP[p.status].color)}>{STATUS_MAP[p.status].label}</span></td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(p)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{detail.invoiceRef}</CardTitle>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[["Proveedor", detail.supplier], ["Monto", fmt(detail.amount)], ["Pagado", fmt(detail.paid)], ["Saldo", fmt(detail.amount - detail.paid)], ["Vencimiento", detail.dueDate], ["Fecha pago", detail.paidDate || "-"], ["Método", detail.paymentMethod], ["Estado", STATUS_MAP[detail.status].label]].map(([k, v]) => (
                <div key={k as string}><p className="text-xs text-[var(--text-tertiary)]">{k as string}</p><p className="font-bold text-[var(--text-primary)] dark:text-foreground">{v as string}</p></div>
              ))}
            </div>
            {detail.earlyDiscountPct && detail.status !== "pagado" && (
              <div className="bg-[var(--surface-sunken)] rounded-lg p-3 text-sm">
                <p className="font-bold text-[var(--text-secondary)] dark:text-[var(--text-primary)] flex items-center gap-1"><BadgePercent className="h-4 w-4" /> Descuento pronto pago: {detail.earlyDiscountPct}%</p>
                <p className="text-xs text-[var(--text-secondary)]/80">Pagar antes del {detail.earlyDiscountDeadline} — Ahorro: {fmt(detail.amount * (detail.earlyDiscountPct / 100))}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
