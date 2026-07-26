"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";
import { Field } from '@/components/admin/shared/Field';

import { useState, useMemo } from "react";
import {
  Wallet, Plus, X, Download, Search,
  CheckCircle, AlertTriangle, Eye,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type BudgetStatus = "bajo-control" | "en-riesgo" | "excedido";

type BudgetLine = {
  id: string;
  department: string;
  category: string;
  period: string;        // "2026-01" ... "2026-12"
  planned: number;
  executed: number;
  committed: number;     // comprometido (OC aprobadas sin pagar)
  notes: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}
function budgetStatus(planned: number, executed: number, committed: number): BudgetStatus {
  const total = executed + committed;
  if (planned === 0) return "bajo-control";
  const pct = total / planned;
  if (pct > 1) return "excedido";
  if (pct > 0.85) return "en-riesgo";
  return "bajo-control";
}

const STATUS_META: Record<BudgetStatus, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  "bajo-control": { label: "Bajo control", color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15", icon: CheckCircle },
  "en-riesgo":    { label: "En riesgo",    color: "text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",    bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30",    icon: AlertTriangle },
  excedido:       { label: "Excedido",      color: "text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",         bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30",        icon: AlertTriangle },
};

const DEPARTMENTS = ["Operaciones", "Ventas", "Administración", "Logística", "RRHH", "Marketing"];
const CATEGORIES = ["Compras inventario", "Servicios", "Alquiler", "Nómina", "Marketing digital", "Mantenimiento", "Transporte", "Otros"];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function monthLabel(period: string) {
  const [, m] = period.split("-");
  return MONTHS[parseInt(m) - 1] || period;
}

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: BudgetLine[] = [];

const EMPTY: Omit<BudgetLine, "id"> = {
  department: "Operaciones", category: "Compras inventario", period: "2026-03", planned: 0, executed: 0, committed: 0, notes: "",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function BudgetTab() {
  const [lines, setLines] = useState<BudgetLine[]>(SEED);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("todos");
  const [filterStatus, setFilterStatus] = useState<BudgetStatus | "todos">("todos");
  const [filterPeriod, setFilterPeriod] = useState("todos");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<BudgetLine, "id">>({ ...EMPTY });
  const [detail, setDetail] = useState<BudgetLine | null>(null);

  const periods = useMemo(() => [...new Set(lines.map(l => l.period))].sort(), [lines]);

  const processed = useMemo(() => {
    let list = lines.map(l => ({
      ...l,
      computedStatus: budgetStatus(l.planned, l.executed, l.committed),
      available: l.planned - l.executed - l.committed,
      executionPct: l.planned > 0 ? ((l.executed + l.committed) / l.planned) * 100 : 0,
    }));
    if (filterDept !== "todos") list = list.filter(l => l.department === filterDept);
    if (filterStatus !== "todos") list = list.filter(l => l.computedStatus === filterStatus);
    if (filterPeriod !== "todos") list = list.filter(l => l.period === filterPeriod);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => l.department.toLowerCase().includes(q) || l.category.toLowerCase().includes(q) || l.notes.toLowerCase().includes(q));
    }
    return list;
  }, [lines, filterDept, filterStatus, filterPeriod, search]);

  const stats = useMemo(() => {
    const totalPlanned = processed.reduce((s, l) => s + l.planned, 0);
    const totalExecuted = processed.reduce((s, l) => s + l.executed, 0);
    const totalCommitted = processed.reduce((s, l) => s + l.committed, 0);
    const excedido = processed.filter(l => l.computedStatus === "excedido").length;
    const enRiesgo = processed.filter(l => l.computedStatus === "en-riesgo").length;
    return { totalPlanned, totalExecuted, totalCommitted, available: totalPlanned - totalExecuted - totalCommitted, excedido, enRiesgo, executionPct: totalPlanned > 0 ? (totalExecuted / totalPlanned) * 100 : 0 };
  }, [processed]);

  function handleAdd() {
    if (form.planned <= 0) return;
    setLines(prev => [{ ...form, id: `b-${Date.now()}` }, ...prev]);
    setShowForm(false);
    setForm({ ...EMPTY });
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Presupuestos
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Control presupuestario por departamento, categoría y período</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => exportToCSV(processed.map(l => ({ departamento: l.department, categoria: l.category, periodo: l.period, planificado: l.planned, ejecutado: l.executed, comprometido: l.committed, disponible: l.available, pct_ejecucion: Number(l.executionPct).toFixed(1), estado: l.computedStatus })), "presupuestos")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--surface-alt)] dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nueva partida
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total planificado", value: fmt(stats.totalPlanned), color: "text-[var(--text-primary)] dark:text-[var(--text-primary)]", bg: "bg-[var(--surface-alt)] dark:bg-surface/50" },
          { label: "Ejecutado", value: fmt(stats.totalExecuted), color: "text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15" },
          { label: "Comprometido", value: fmt(stats.totalCommitted), color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
          { label: "Disponible", value: fmt(stats.available), color: stats.available >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]", bg: stats.available >= 0 ? "bg-primary/10 dark:bg-primary/15" : "bg-[var(--data-error-50)] dark:bg-red-950/30" },
          { label: "% Ejecución", value: fmtPct(stats.executionPct), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {(stats.excedido > 0 || stats.enRiesgo > 0) && (
        <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] rounded-xl p-4 flex flex-wrap items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[var(--data-warning-500)] shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] text-sm">Partidas presupuestarias con alerta</p>
            <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-0.5">
              {stats.excedido > 0 && <span className="font-bold">{stats.excedido} excedida(s).</span>}
              {stats.enRiesgo > 0 && <span> {stats.enRiesgo} en riesgo (≥85% ejecutado).</span>}
            </p>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm flex flex-wrap items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Nueva partida presupuestaria</CardTitle>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Departamento" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
              <select value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select>
            </Field>
            <Field label="Categoría" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label="Período" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
              <input type="month" value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
            </Field>
            <Field label="Monto planificado (S/)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
              <input type="number" value={form.planned || ""} onChange={e => setForm(p => ({ ...p, planned: parseFloat(e.target.value) || 0 }))} min="0" step="100" className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
            </Field>
            <Field label="Notas" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1" className="col-span-2">
              <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observaciones opcionales..." className="w-full text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted">Cancelar</button>
            <button onClick={handleAdd} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg bg-primary text-white font-semibold hover:bg-primary/90">Registrar partida</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar departamento, categoría..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]" />
        </div>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="todos">Todos los departamentos</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="todos">Todos los períodos</option>
          {periods.map(p => <option key={p} value={p}>{monthLabel(p)} {p.slice(0, 4)}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as BudgetStatus | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as BudgetStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-[var(--surface-alt)] dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-[var(--rule-base)]">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Estado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Departamento</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Categoría</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Período</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Planificado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Ejecutado</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Comprometido</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Disponible</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">% Ejec.</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-card-border">
              {processed.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-[var(--text-tertiary)] text-sm">Sin partidas con los filtros seleccionados.</td></tr>}
              {processed.map(l => {
                const meta = STATUS_META[l.computedStatus];
                const Icon = meta.icon;
                return (
                  <tr key={l.id} className="hover:bg-[var(--surface-alt)]/50 dark:hover:bg-surface/30 transition-colors">
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", meta.bg, meta.color)}><Icon className="h-3 w-3" />{meta.label}</span>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{l.department}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{l.category}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs font-mono text-[var(--text-secondary)]">{monthLabel(l.period)} {l.period.slice(0, 4)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(l.planned)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-semibold text-[var(--data-success-500)]">{fmt(l.executed)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs text-[var(--data-warning-500)]">{l.committed > 0 ? fmt(l.committed) : "—"}</td>
                    <td className={cn("px-2 sm:px-4 py-2 sm:py-3 text-right font-bold", l.available >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{fmt(l.available)}</td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3 text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <div className="w-16 h-2 bg-[var(--rule-soft)] dark:bg-surface rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", l.executionPct > 100 ? "bg-[var(--data-error-500)]" : l.executionPct > 85 ? "bg-[var(--data-warning-500)]" : "bg-primary/10")} style={{ width: `${Math.min(l.executionPct, 100)}%` }} />
                        </div>
                        <span className="text-xs font-bold text-[var(--text-secondary)]">{fmtPct(l.executionPct)}</span>
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-2 sm:py-3">
                      <button onClick={() => setDetail(l)} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] hover:bg-primary/10 dark:hover:bg-primary/15">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {processed.length > 0 && (
              <tfoot className="bg-[var(--surface-alt)] dark:bg-surface/50 border-t border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                <tr>
                  <td colSpan={4} className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-extrabold text-[var(--text-secondary)] dark:text-muted uppercase">Totales</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(stats.totalPlanned)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold text-[var(--data-success-500)]">{fmt(stats.totalExecuted)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold text-[var(--data-warning-500)]">{fmt(stats.totalCommitted)}</td>
                  <td className={cn("px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold", stats.available >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>{fmt(stats.available)}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-center text-xs font-extrabold text-[var(--text-secondary)]">{fmtPct(stats.executionPct)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Department summary by bar chart */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-5">
        <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm mb-4">Ejecución por departamento</CardTitle>
        <div className="space-y-3">
          {DEPARTMENTS.map(dept => {
            const deptLines = processed.filter(l => l.department === dept);
            if (deptLines.length === 0) return null;
            const planned = deptLines.reduce((s, l) => s + l.planned, 0);
            const executed = deptLines.reduce((s, l) => s + l.executed, 0);
            const pct = planned > 0 ? (executed / planned) * 100 : 0;
            return (
              <div key={dept} className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted w-28 shrink-0">{dept}</span>
                <div className="flex-1 h-5 bg-[var(--surface-sunken)] dark:bg-surface rounded-full overflow-hidden relative">
                  <div className={cn("h-full rounded-full transition-all", pct > 100 ? "bg-[var(--data-error-500)]" : pct > 85 ? "bg-[var(--data-warning-500)]" : "bg-primary/10")} style={{ width: `${Math.min(pct, 100)}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmtPct(pct)}</span>
                </div>
                <span className="text-xs font-semibold text-[var(--text-secondary)] w-28 text-right">{fmt(executed)} / {fmt(planned)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 sm:p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm">Detalle de partida</CardTitle>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Departamento", detail.department], ["Categoría", detail.category],
                ["Período", `${monthLabel(detail.period)} ${detail.period.slice(0, 4)}`],
                ["Planificado", fmt(detail.planned)], ["Ejecutado", fmt(detail.executed)],
                ["Comprometido", fmt(detail.committed)],
                ["Disponible", fmt(detail.planned - detail.executed - detail.committed)],
                ["Notas", detail.notes || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-wrap justify-between gap-2 sm:gap-4">
                  <span className="text-[var(--text-secondary)] dark:text-muted">{k}</span>
                  <span className="font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
