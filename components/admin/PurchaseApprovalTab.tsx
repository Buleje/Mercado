"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { useState, useMemo } from "react";
import {
  CheckCircle, Download, Search, Eye, X,
  Clock, XCircle, Send,
  UserCheck, FileSignature,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ApprovalStatus = "pendiente" | "aprobado" | "rechazado" | "en-revision";
type ApprovalLevel = "jefe-area" | "finanzas" | "gerencia";

type ApprovalStep = {
  level: ApprovalLevel;
  approver: string;
  status: ApprovalStatus;
  date?: string;
  comment?: string;
};

type PurchaseApproval = {
  id: string;
  ref: string;
  description: string;
  supplier: string;
  total: number;
  requestedBy: string;
  requestDate: string;
  urgency: "normal" | "urgente" | "crítica";
  steps: ApprovalStep[];
  currentLevel: ApprovalLevel;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });

const STATUS_MAP: Record<ApprovalStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  pendiente:    { label: "Pendiente",   color: "text-[var(--data-warning-500)]",   icon: Clock },
  "en-revision":{ label: "En revisión", color: "text-[var(--data-success-500)]",    icon: Eye },
  aprobado:     { label: "Aprobado",    color: "text-[var(--data-success-500)]", icon: CheckCircle },
  rechazado:    { label: "Rechazado",   color: "text-[var(--data-error-500)]",     icon: XCircle },
};

const LEVEL_LABELS: Record<ApprovalLevel, string> = {
  "jefe-area": "Jefe de Área",
  finanzas: "Finanzas",
  gerencia: "Gerencia",
};

const urgencyStyle: Record<string, string> = {
  normal: "text-[var(--text-secondary)] bg-[var(--surface-sunken)]/30",
  urgente: "text-[var(--data-warning-500)] bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30",
  "crítica": "text-[var(--data-error-500)] bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30",
};

function overallStatus(steps: ApprovalStep[]): ApprovalStatus {
  if (steps.some(s => s.status === "rechazado")) return "rechazado";
  if (steps.every(s => s.status === "aprobado")) return "aprobado";
  if (steps.some(s => s.status === "en-revision")) return "en-revision";
  return "pendiente";
}

// ── Seed Data ─────────────────────────────────────────────────────────────────

const APPROVALS: PurchaseApproval[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function PurchaseApprovalTab() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todos" | ApprovalStatus>("todos");
  const [detail, setDetail] = useState<PurchaseApproval | null>(null);

  const stats = useMemo(() => {
    const pending = APPROVALS.filter(a => overallStatus(a.steps) === "pendiente" || overallStatus(a.steps) === "en-revision").length;
    const approved = APPROVALS.filter(a => overallStatus(a.steps) === "aprobado").length;
    const rejected = APPROVALS.filter(a => overallStatus(a.steps) === "rechazado").length;
    const totalValue = APPROVALS.filter(a => overallStatus(a.steps) !== "rechazado").reduce((s, a) => s + a.total, 0);
    return { pending, approved, rejected, totalValue };
  }, []);

  const filtered = useMemo(() => {
    let list = APPROVALS;
    if (filterStatus !== "todos") list = list.filter(a => overallStatus(a.steps) === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.ref.toLowerCase().includes(q) || a.supplier.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
    }
    return list;
  }, [search, filterStatus]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <CheckCircle className="h-6 w-6 text-primary" /> Aprobación de Compras
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Flujo de aprobación multinivel para órdenes de compra</p>
        </div>
        <button onClick={() => exportToCSV(APPROVALS.map(a => ({ ref: a.ref, desc: a.description, proveedor: a.supplier, total: a.total, solicitante: a.requestedBy, fecha: a.requestDate, urgencia: a.urgency, estado: STATUS_MAP[overallStatus(a.steps)].label })), "aprobacion-compras")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "En espera", value: String(stats.pending), color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30", icon: Clock },
          { label: "Aprobadas", value: String(stats.approved), color: "text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15", icon: CheckCircle },
          { label: "Rechazadas", value: String(stats.rejected), color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)] dark:bg-red-950/30", icon: XCircle },
          { label: "Valor aprobable", value: fmt(stats.totalValue), color: "text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15", icon: Send },
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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar OC, proveedor, descripción..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} className="px-3 py-2 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="todos">Todos los estados</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead><tr className="text-left text-xs font-bold text-[var(--text-tertiary)] bg-gray-50 dark:bg-surface"><th className="px-2 sm:px-4 py-2 sm:py-3">OC</th><th className="px-2 sm:px-4 py-2 sm:py-3">Descripción</th><th className="px-2 sm:px-4 py-2 sm:py-3">Proveedor</th><th className="px-2 sm:px-4 py-2 sm:py-3">Total</th><th className="px-2 sm:px-4 py-2 sm:py-3">Urgencia</th><th className="px-2 sm:px-4 py-2 sm:py-3">Nivel actual</th><th className="px-2 sm:px-4 py-2 sm:py-3">Estado</th><th className="px-2 sm:px-4 py-2 sm:py-3"></th></tr></thead>
            <tbody>
              {filtered.map(a => {
                const os = overallStatus(a.steps);
                const StatusIcon = STATUS_MAP[os].icon;
                return (
                  <tr key={a.id} className="border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:bg-gray-50 dark:hover:bg-accent/20">
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-mono text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{a.ref}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-primary)] dark:text-[var(--text-primary)] max-w-50 truncate">{a.description}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{a.supplier}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(a.total)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", urgencyStyle[a.urgency])}>{a.urgency}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{LEVEL_LABELS[a.currentLevel]}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><span className={cn("flex items-center gap-1 text-xs font-bold", STATUS_MAP[os].color)}><StatusIcon className="h-3.5 w-3.5" />{STATUS_MAP[os].label}</span></td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3"><button onClick={() => setDetail(a)} className="text-primary hover:underline text-xs font-bold"><Eye className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal — Approval Pipeline */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 w-full max-w-md space-y-4 max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{detail.ref}</CardTitle>
                <p className="text-xs text-[var(--text-tertiary)]">{detail.description}</p>
              </div>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-[var(--text-tertiary)]">Proveedor</p><p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{detail.supplier}</p></div>
              <div><p className="text-xs text-[var(--text-tertiary)]">Total</p><p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(detail.total)}</p></div>
              <div><p className="text-xs text-[var(--text-tertiary)]">Solicitante</p><p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{detail.requestedBy}</p></div>
              <div><p className="text-xs text-[var(--text-tertiary)]">Fecha solicitud</p><p className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{detail.requestDate}</p></div>
            </div>

            <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] flex items-center gap-1"><FileSignature className="h-4 w-4" /> Pipeline de aprobación</h4>
            <div className="space-y-3">
              {detail.steps.map((step, i) => {
                const StepIcon = STATUS_MAP[step.status].icon;
                return (
                  <div key={i} className="flex flex-wrap items-start gap-3">
                    <div className="flex flex-col items-center">
                      <StepIcon className={cn("h-5 w-5", STATUS_MAP[step.status].color)} />
                      {i < detail.steps.length - 1 && <div className="w-0.5 h-6 bg-gray-200 dark:bg-card-border mt-1" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{LEVEL_LABELS[step.level]}</p>
                      <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1"><UserCheck className="h-3 w-3" />{step.approver} {step.date && <span>· {step.date}</span>}</p>
                      {step.comment && <p className="text-xs text-[var(--text-tertiary)] italic mt-0.5">&quot;{step.comment}&quot;</p>}
                    </div>
                    <span className={cn("text-xs font-bold", STATUS_MAP[step.status].color)}>{STATUS_MAP[step.status].label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
