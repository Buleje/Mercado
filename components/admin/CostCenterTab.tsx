"use client";

import { CardTitle, PageTitle } from "@buleje/design-system";

import { useState, useMemo } from "react";
import {
  Layers, Plus, X, Download, Search,
  CheckCircle, AlertTriangle,
} from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type CostCenter = {
  id: string;
  code: string;
  name: string;
  responsible: string;
  budgetMonthly: number;
  active: boolean;
};

type CostAllocation = {
  id: string;
  centerId: string;
  date: string;
  concept: string;
  category: string;
  amount: number;
  reference: string;
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

const EXPENSE_CATEGORIES = ["Nómina", "Alquiler", "Servicios", "Inventario", "Transporte", "Marketing", "Mantenimiento", "Otro"];

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SEED_CENTERS: CostCenter[] = [];

const SEED_ALLOCATIONS: CostAllocation[] = [];

// ── Component ─────────────────────────────────────────────────────────────────

type View = "centros" | "asignaciones";

export default function CostCenterTab() {
  const [centers, _setCenters] = useState(SEED_CENTERS);
  const [allocations, setAllocations] = useState(SEED_ALLOCATIONS);
  const [view, setView] = useState<View>("centros");
  const [search, setSearch] = useState("");
  const [filterCenter, setFilterCenter] = useState("todos");
  const [filterCat, setFilterCat] = useState("todos");
  const [showFormAlloc, setShowFormAlloc] = useState(false);
  const [formAlloc, setFormAlloc] = useState({ centerId: centers[0]?.id || "", date: new Date().toISOString().slice(0, 10), concept: "", category: "Otro", amount: 0, reference: "", notes: "" });

  const centerStats = useMemo(() => centers.map(c => {
    const total = allocations.filter(a => a.centerId === c.id).reduce((s, a) => s + a.amount, 0);
    return { ...c, totalAllocated: total, pct: c.budgetMonthly > 0 ? (total / c.budgetMonthly) * 100 : 0 };
  }), [centers, allocations]);

  const filteredAllocations = useMemo(() => {
    let list = [...allocations];
    if (filterCenter !== "todos") list = list.filter(a => a.centerId === filterCenter);
    if (filterCat !== "todos") list = list.filter(a => a.category === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.concept.toLowerCase().includes(q) || a.reference.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [allocations, filterCenter, filterCat, search]);

  const globalStats = useMemo(() => ({
    totalBudget: centers.filter(c => c.active).reduce((s, c) => s + c.budgetMonthly, 0),
    totalAllocated: allocations.reduce((s, a) => s + a.amount, 0),
    centerCount: centers.filter(c => c.active).length,
    allocCount: allocations.length,
  }), [centers, allocations]);

  function handleAddAllocation() {
    if (!formAlloc.concept.trim() || formAlloc.amount <= 0) return;
    setAllocations(prev => [{ ...formAlloc, id: `a-${Date.now()}` }, ...prev]);
    setShowFormAlloc(false);
    setFormAlloc({ centerId: centers[0]?.id || "", date: new Date().toISOString().slice(0, 10), concept: "", category: "Otro", amount: 0, reference: "", notes: "" });
  }

  function centerName(id: string) {
    return centers.find(c => c.id === id)?.name ?? id;
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <PageTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Layers className="h-6 w-6 text-primary" /> Centros de Costo
          </PageTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Distribución y seguimiento de gastos operativos por centro</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => exportToCSV(filteredAllocations.map(a => ({ centro: centerName(a.centerId), fecha: a.date, concepto: a.concept, categoria: a.category, monto: a.amount, referencia: a.reference, notas: a.notes })), "centros-costo")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-semibold text-[var(--text-primary)] dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent transition-colors">
            <Download className="h-4 w-4" /> Exportar
          </button>
          {view === "asignaciones" && (
            <button onClick={() => setShowFormAlloc(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" /> Asignar gasto
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Centros activos", value: String(globalStats.centerCount), color: "text-[var(--text-primary)] dark:text-foreground", bg: "bg-gray-50 dark:bg-surface/50" },
          { label: "Presupuesto total", value: fmt(globalStats.totalBudget), color: "text-[var(--data-success-500)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" },
          { label: "Total asignado", value: fmt(globalStats.totalAllocated), color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
          { label: "Disponible", value: fmt(globalStats.totalBudget - globalStats.totalAllocated), color: globalStats.totalBudget >= globalStats.totalAllocated ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]", bg: globalStats.totalBudget >= globalStats.totalAllocated ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]" : "bg-[var(--data-error-50)] dark:bg-red-950/30" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-xl p-4", bg)}>
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">{label}</p>
            <p className={cn("text-xl font-extrabold", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1 w-fit">
        {([["centros", "Centros"], ["asignaciones", "Asignaciones"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-semibold rounded-lg transition-colors", view === v ? "bg-white dark:bg-card text-[var(--text-primary)] dark:text-foreground " : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)]")}>
            {label}
          </button>
        ))}
      </div>

      {/* Centers view */}
      {view === "centros" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
          {centerStats.map(c => (
            <div key={c.id} className={cn("bg-white dark:bg-card border rounded-xl p-3 sm:p-5", c.pct > 100 ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)]" : c.pct > 85 ? "border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]" : "border-[var(--rule-base)] dark:border-card-border")}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-xs font-mono font-bold text-[var(--text-tertiary)]">{c.code}</span>
                  <p className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{c.name}</p>
                  <p className="text-xs text-[var(--text-secondary)] dark:text-muted">Responsable: {c.responsible}</p>
                </div>
                <span className={cn("inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full", c.pct > 100 ? "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]" : c.pct > 85 ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]" : "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]")}>
                  {c.pct > 100 ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                  {c.pct.toFixed(0)}%
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--text-secondary)] dark:text-muted">Asignado</span>
                  <span className="font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(c.totalAllocated)} / {fmt(c.budgetMonthly)}</span>
                </div>
                <div className="w-full h-2.5 bg-gray-200 dark:bg-surface rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", c.pct > 100 ? "bg-[var(--data-error-500)]" : c.pct > 85 ? "bg-[var(--data-warning-500)]" : "bg-[var(--accent-soft)]")} style={{ width: `${Math.min(c.pct, 100)}%` }} />
                </div>
                <p className={cn("text-xs font-semibold", c.budgetMonthly - c.totalAllocated >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                  Disponible: {fmt(c.budgetMonthly - c.totalAllocated)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Allocations view */}
      {view === "asignaciones" && (
        <div className="space-y-6">
          {/* New allocation form */}
          {showFormAlloc && (
            <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground text-sm flex flex-wrap items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Asignar gasto a centro</CardTitle>
                <button onClick={() => setShowFormAlloc(false)}><X className="h-4 w-4 text-[var(--text-tertiary)]" /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Centro de costo</label>
                  <select value={formAlloc.centerId} onChange={e => setFormAlloc(p => ({ ...p, centerId: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">{centers.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Categoría</label>
                  <select value={formAlloc.category} onChange={e => setFormAlloc(p => ({ ...p, category: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Fecha</label>
                  <input type="date" value={formAlloc.date} onChange={e => setFormAlloc(p => ({ ...p, date: e.target.value }))} className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Monto (S/)</label>
                  <input type="number" value={formAlloc.amount || ""} onChange={e => setFormAlloc(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} min="0" step="10" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Concepto *</label>
                  <input type="text" value={formAlloc.concept} onChange={e => setFormAlloc(p => ({ ...p, concept: e.target.value }))} placeholder="Descripción del gasto..." className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">Referencia</label>
                  <input type="text" value={formAlloc.reference} onChange={e => setFormAlloc(p => ({ ...p, reference: e.target.value }))} placeholder="OC-2026-XXX" className="w-full text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <button onClick={() => setShowFormAlloc(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted">Cancelar</button>
                <button onClick={handleAddAllocation} className="px-2 sm:px-4 py-1.5 sm:py-2 text-sm rounded-lg bg-primary text-white font-semibold hover:bg-primary/90">Registrar</button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Concepto, referencia..." className="w-full pl-9 pr-3 py-2 text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
            <select value={filterCenter} onChange={e => setFilterCenter(e.target.value)} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
              <option value="todos">Todos los centros</option>
              {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="text-sm border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2 bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
              <option value="todos">Todas las categorías</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-gray-50 dark:bg-surface/50 border-b border-[var(--rule-base)] dark:border-card-border">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Fecha</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Centro</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Concepto</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Categoría</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Monto</th>
                    <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-card-border">
                  {filteredAllocations.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-tertiary)] text-sm">Sin asignaciones.</td></tr>}
                  {filteredAllocations.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50/50 dark:hover:bg-surface/30">
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap">{fmtDate(a.date)}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 font-semibold text-[var(--text-primary)] dark:text-foreground text-xs">{centerName(a.centerId)}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-[var(--text-primary)] dark:text-foreground">{a.concept}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs text-[var(--text-secondary)] dark:text-muted">{a.category}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-[var(--text-primary)] dark:text-foreground">{fmt(a.amount)}</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-mono text-[var(--text-tertiary)]">{a.reference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                {filteredAllocations.length > 0 && (
                  <tfoot className="bg-gray-50 dark:bg-surface/50 border-t border-[var(--rule-base)] dark:border-card-border">
                    <tr>
                      <td colSpan={4} className="px-2 sm:px-4 py-2 sm:py-3 text-xs font-extrabold text-[var(--text-secondary)] dark:text-muted uppercase">Total</td>
                      <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-extrabold text-[var(--text-primary)] dark:text-foreground">{fmt(filteredAllocations.reduce((s, a) => s + a.amount, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
