"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";

import { useState, useMemo } from "react";
import {
  Target, Download, Search, X,
  Calendar, TrendingUp, Pause, CheckCircle2, Ban,
  Wrench, Expand, MoreHorizontal,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProjectType = "remodelacion" | "equipo" | "expansion" | "otro";
type ProjectStatus = "planificacion" | "en-curso" | "completado" | "cancelado";

type Expense = { id: string; description: string; amount: number; date: string };

type Project = {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  budget: number;
  startDate: string;
  endDate: string;
  responsible: string;
  description: string;
  expenses: Expense[];
  roiProjected: number; // %
  roiActual: number | null; // %
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2 });
const pct = (n: number) => n.toFixed(1) + "%";

const TYPE_META: Record<ProjectType, { label: string; icon: typeof Wrench; color: string }> = {
  remodelacion: { label: "Remodelación", icon: Wrench,          color: "text-[var(--data-warning)]" },
  equipo:       { label: "Equipo",       icon: MoreHorizontal, color: "text-[var(--data-success)]" },
  expansion:    { label: "Expansión",    icon: Expand,          color: "text-[var(--data-success)]" },
  otro:         { label: "Otro",         icon: MoreHorizontal, color: "text-[var(--text-secondary)]" },
};

const STATUS_META: Record<ProjectStatus, { label: string; icon: typeof Pause; color: string; bg: string }> = {
  planificacion: { label: "Planificación", icon: Calendar,    color: "text-[var(--data-success)]",    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  "en-curso":    { label: "En Curso",      icon: TrendingUp,  color: "text-[var(--data-warning)]",   bg: "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/30" },
  completado:    { label: "Completado",    icon: CheckCircle2, color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
  cancelado:     { label: "Cancelado",     icon: Ban,          color: "text-[var(--data-error)]",     bg: "bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/30" },
};

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED: Project[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectsTab() {
  const [projects] = useState<Project[]>(SEED);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | "todos">("todos");
  const [filterType, setFilterType] = useState<ProjectType | "todos">("todos");
  const [detail, setDetail] = useState<Project | null>(null);

  const filtered = useMemo(() => {
    let list = [...projects];
    if (filterStatus !== "todos") list = list.filter(p => p.status === filterStatus);
    if (filterType !== "todos") list = list.filter(p => p.type === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.responsible.toLowerCase().includes(q));
    }
    return list;
  }, [projects, filterStatus, filterType, search]);

  const stats = useMemo(() => {
    const active = projects.filter(p => p.status === "en-curso");
    const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
    const totalSpent = projects.reduce((s, p) => s + p.expenses.reduce((a, e) => a + e.amount, 0), 0);
    const completed = projects.filter(p => p.status === "completado");
    const avgRoi = completed.length > 0 ? completed.reduce((s, p) => s + (p.roiActual ?? 0), 0) / completed.length : 0;
    return { activeCount: active.length, totalBudget, totalSpent, avgRoi };
  }, [projects]);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Target className="h-6 w-6 text-primary" /> Proyectos & CAPEX
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Gestión de inversiones, presupuesto y ROI por proyecto</p>
        </div>
        <button onClick={() => exportToCSV(projects.map(p => ({ nombre: p.name, tipo: TYPE_META[p.type].label, estado: STATUS_META[p.status].label, presupuesto: p.budget, ejecutado: p.expenses.reduce((a, e) => a + e.amount, 0), roi_proyectado: p.roiProjected, roi_actual: p.roiActual ?? "N/A", responsable: p.responsible })), "proyectos-capex")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
          <Download className="h-4 w-4" /> Exportar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "En Curso", value: String(stats.activeCount), color: "text-[var(--data-warning)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/30" },
          { label: "Presupuesto Total", value: fmt(stats.totalBudget), color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Ejecutado Total", value: fmt(stats.totalSpent), color: "text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "ROI Prom. Real", value: pct(stats.avgRoi), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, responsable..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ProjectStatus | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todos los estados</option>
          {(Object.keys(STATUS_META) as ProjectStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value as ProjectType | "todos")} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
          <option value="todos">Todos los tipos</option>
          {(Object.keys(TYPE_META) as ProjectType[]).map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
        </select>
      </div>

      {/* Project cards */}
      <div className="grid gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(p => {
          const spent = p.expenses.reduce((a, e) => a + e.amount, 0);
          const execPct = p.budget > 0 ? (spent / p.budget) * 100 : 0;
          const st = STATUS_META[p.status];
          const StIcon = st.icon;
          return (
            <div key={p.id} className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-3 hover:shadow-lg transition-shadow">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">{p.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{TYPE_META[p.type].label} · {p.responsible}</p>
                </div>
                <span className={cn("flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", st.bg, st.color)}>
                  <StIcon className="h-3 w-3" />{st.label}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)] dark:text-muted">Ejecución</span>
                  <span className="font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(spent)} / {fmt(p.budget)}</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", execPct > 100 ? "bg-[var(--data-error)]" : execPct > 80 ? "bg-[var(--data-warning)]" : "bg-[var(--accent-soft)]")} style={{ width: `${Math.min(execPct, 100)}%` }} />
                </div>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-right">{pct(execPct)} ejecutado</p>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)] dark:text-muted">ROI Proy. / Real</span>
                <span className="font-bold text-[var(--text-primary)] dark:text-foreground">{pct(p.roiProjected)} / {p.roiActual != null ? pct(p.roiActual) : "—"}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                <span>{p.startDate}</span>
                <span>{p.endDate}</span>
              </div>
              <button onClick={() => setDetail(p)} className="w-full text-center text-xs font-bold text-primary hover:underline pt-1">Ver detalle</button>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="col-span-full text-center text-[var(--text-tertiary)] py-8">Sin proyectos.</p>}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-backdrop p-4" onClick={() => setDetail(null)}>
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{detail.name}</CardTitle>
              <button onClick={() => setDetail(null)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <p className="text-sm text-[var(--text-secondary)] dark:text-muted">{detail.description}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {[
                ["Tipo", TYPE_META[detail.type].label],
                ["Estado", STATUS_META[detail.status].label],
                ["Presupuesto", fmt(detail.budget)],
                ["Ejecutado", fmt(detail.expenses.reduce((a, e) => a + e.amount, 0))],
                ["ROI Proyectado", pct(detail.roiProjected)],
                ["ROI Real", detail.roiActual != null ? pct(detail.roiActual) : "—"],
                ["Inicio", detail.startDate],
                ["Fin", detail.endDate],
                ["Responsable", detail.responsible],
              ].map(([k, v]) => (
                <div key={k}><p className="text-xs text-[var(--text-tertiary)]">{k}</p><p className="font-bold text-[var(--text-primary)] dark:text-foreground">{v}</p></div>
              ))}
            </div>
            {detail.expenses.length > 0 && (
              <div>
                <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground mb-2">Gastos registrados</h4>
                <div className="space-y-1">
                  {detail.expenses.map(e => (
                    <div key={e.id} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-surface rounded-xl px-3 py-2">
                      <span className="text-[var(--text-secondary)] dark:text-muted">{e.date} — {e.description}</span>
                      <span className="font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(e.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
