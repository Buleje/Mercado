"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";

import { useState } from "react";
import { Zap, Plus, Pencil, Trash2, Check, Play, ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type Rule = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  condition: string;
  action: string;
  enabled: boolean;
  executionCount: number;
  lastExecuted: string | null;
  category: "inventario" | "ventas" | "crm" | "finanzas" | "rrhh";
};

const CATEGORIES: Record<Rule["category"], { label: string; color: string }> = {
  inventario: { label: "Inventario", color: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" },
  ventas: { label: "Ventas", color: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" },
  crm: { label: "CRM", color: "bg-[var(--surface-sunken)] text-[var(--text-primary)]" },
  finanzas: { label: "Finanzas", color: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]" },
  rrhh: { label: "RRHH", color: "bg-[var(--surface-sunken)] text-[var(--text-primary)]" },
};

const SEED: Rule[] = [];

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

export default function BusinessRulesTab() {
  const [rules, setRules] = useState(SEED);
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [filterCat, setFilterCat] = useState<string>("all");

  const [form, setForm] = useState({ name: "", description: "", trigger: "", condition: "", action: "", category: "inventario" as Rule["category"] });

  const openCreate = () => { setEditRule(null); setForm({ name: "", description: "", trigger: "", condition: "", action: "", category: "inventario" }); setShowModal(true); };
  const openEdit = (r: Rule) => { setEditRule(r); setForm({ name: r.name, description: r.description, trigger: r.trigger, condition: r.condition, action: r.action, category: r.category }); setShowModal(true); };
  const save = () => {
    if (!form.name.trim()) return;
    if (editRule) {
      setRules(prev => prev.map(r => r.id === editRule.id ? { ...r, ...form } : r));
    } else {
      setRules(prev => [...prev, { id: `r${Date.now()}`, ...form, enabled: true, executionCount: 0, lastExecuted: null }]);
    }
    setShowModal(false);
  };

  const filtered = filterCat === "all" ? rules : rules.filter(r => r.category === filterCat);

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2"><Zap className="h-6 w-6 text-primary" /> Reglas de Negocio</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Automatiza acciones con reglas Si → Entonces</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-colors"><Plus className="h-4 w-4" /> Nueva regla</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total reglas", value: rules.length },
          { label: "Activas", value: rules.filter(r => r.enabled).length },
          { label: "Ejecuciones totales", value: rules.reduce((s, r) => s + r.executionCount, 0) },
          { label: "Categorías", value: new Set(rules.map(r => r.category)).size },
        ].map(k => (
          <div key={k.label} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4">
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilterCat("all")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", filterCat === "all" ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>Todas</button>
        {(Object.entries(CATEGORIES) as [Rule["category"], { label: string }][]).map(([k, v]) => (
          <button key={k} onClick={() => setFilterCat(k)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", filterCat === k ? "bg-primary text-white" : "bg-[var(--surface-sunken)] dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>{v.label}</button>
        ))}
      </div>

      {/* Rules */}
      <div className="space-y-3">
        {filtered.map(r => (
          <div key={r.id} className={cn("bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 sm:p-5 transition-all", !r.enabled && "opacity-60")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{r.name}</CardTitle>
                  <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", CATEGORIES[r.category].color)}>{CATEGORIES[r.category].label}</span>
                  <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", r.enabled ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:bg-surface dark:text-muted")}>{r.enabled ? "Activa" : "Pausada"}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted mb-3">{r.description}</p>

                {/* Rule flow visualization */}
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] px-2.5 py-1.5 rounded-lg font-semibold">{r.trigger}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  <span className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] px-2.5 py-1.5 rounded-lg font-semibold">{r.condition}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  <span className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] px-2.5 py-1.5 rounded-lg font-semibold">{r.action}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-3 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted">
                  <span>Ejecutada {r.executionCount} veces</span>
                  {r.lastExecuted && <span>Última: {fmtDate(r.lastExecuted)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setRules(prev => prev.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x))} className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent text-[var(--text-tertiary)] hover:text-primary"><Play className="h-4 w-4" /></button>
                <button onClick={() => openEdit(r)} className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent text-[var(--text-tertiary)] hover:text-primary"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setRules(prev => prev.filter(x => x.id !== r.id))} className="p-2 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-backdrop p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--surface-raised)] rounded-xl p-3 sm:p-6 max-w-lg w-full mx-4 border border-[var(--rule-base)] dark:border-[var(--rule-base)]" onClick={e => e.stopPropagation()}>
            <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4">{editRule ? "Editar regla" : "Nueva regla"}</CardTitle>
            <div className="space-y-3">
              <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Nombre</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm" /></div>
              <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Descripción</label><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm" rows={2} /></div>
              <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Categoría</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as Rule["category"] })} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm">{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
              <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Trigger (evento)</label><input value={form.trigger} onChange={e => setForm({ ...form, trigger: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm" placeholder="ej: stock_update, daily_check..." /></div>
              <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Condición (SI…)</label><input value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm" placeholder="ej: stock_actual < punto_reorden" /></div>
              <div><label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Acción (ENTONCES…)</label><input value={form.action} onChange={e => setForm({ ...form, action: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm" placeholder="ej: Crear orden de compra" /></div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-accent">Cancelar</button>
              <button onClick={save} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90"><Check className="h-4 w-4 inline mr-1" />Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
