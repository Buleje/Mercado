"use client";

import { useState, useEffect, useCallback } from "react";
import { Target, TrendingUp, Plus, Pencil, Trash2, Check, X, BarChart3, Calendar, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type GoalPeriod = "diario" | "semanal" | "mensual";
type GoalCategory = "ventas" | "pedidos" | "clientes" | "productos" | "caja";

interface Goal {
  id: string;
  name: string;
  category: GoalCategory;
  period: GoalPeriod;
  target: number;
  current: number;
  unit: string;
  createdAt: string;
  dueDate?: string;
}

const CATEGORY_META: Record<GoalCategory, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  ventas:    { label: "Ventas",    color: "text-emerald-600", bg: "bg-emerald-50",  icon: TrendingUp },
  pedidos:   { label: "Pedidos",   color: "text-amber-600",   bg: "bg-amber-50",    icon: BarChart3 },
  clientes:  { label: "Clientes",  color: "text-violet-600",  bg: "bg-violet-50",   icon: Target },
  productos: { label: "Productos", color: "text-blue-600",    bg: "bg-blue-50",     icon: BarChart3 },
  caja:      { label: "Caja",      color: "text-pink-600",    bg: "bg-pink-50",     icon: TrendingUp },
};

const PERIOD_LABELS: Record<GoalPeriod, string> = {
  diario: "Diario", semanal: "Semanal", mensual: "Mensual",
};

function ProgressBar({ current, target }: { current: number; target: number }) {
  const pct = Math.min(100, target > 0 ? Math.round((current / target) * 100) : 0);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-gray-700 dark:text-foreground">{current.toLocaleString("es-PE")} / {target.toLocaleString("es-PE")}</span>
        <span className={cn(pct >= 100 ? "text-emerald-600" : pct >= 70 ? "text-amber-600" : "text-red-500")}>{pct}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 dark:bg-surface overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", pct >= 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-400" : "bg-red-400")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusIcon({ pct }: { pct: number }) {
  if (pct >= 100) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (pct >= 70) return <Clock className="h-4 w-4 text-amber-500" />;
  return <AlertTriangle className="h-4 w-4 text-red-400" />;
}

interface GoalFormData { name: string; category: GoalCategory; period: GoalPeriod; target: string; unit: string; dueDate: string; }
const EMPTY_FORM: GoalFormData = { name: "", category: "ventas", period: "mensual", target: "", unit: "S/", dueDate: "" };

export default function GoalsTab() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<GoalFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/goals");
      if (res.ok) setGoals(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setForm(EMPTY_FORM); setEditId(null); setShowForm(true); };
  const openEdit = (g: Goal) => {
    setForm({
      name: g.name, category: g.category, period: g.period,
      target: String(g.target), unit: g.unit,
      dueDate: g.dueDate ?? "",
    });
    setEditId(g.id);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.target) return;
    setSaving(true);
    const body = {
      name: form.name.trim(),
      category: form.category,
      period: form.period,
      target: parseFloat(form.target),
      unit: form.unit.trim() || "S/",
      dueDate: form.dueDate || undefined,
    };
    try {
      if (editId) {
        await fetch(`/api/goals/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setShowForm(false);
      await load();
    } catch { /* silent */ }
    setSaving(false);
  };

  const remove = async (id: string) => {
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
    setGoals(prev => prev.filter(g => g.id !== id));
  };

  const updateProgress = async (id: string, current: number) => {
    await fetch(`/api/goals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current }) });
    setGoals(prev => prev.map(g => g.id === id ? { ...g, current } : g));
  };

  // Summary stats
  const total = goals.length;
  const achieved = goals.filter(g => g.current >= g.target).length;
  const avgPct = total > 0 ? Math.round(goals.reduce((sum, g) => sum + Math.min(100, g.target > 0 ? (g.current / g.target) * 100 : 0), 0) / total) : 0;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground">Metas & Objetivos</h2>
          <p className="text-sm text-gray-500 dark:text-muted">Trackea el progreso del negocio en tiempo real</p>
        </div>
        <button
          onClick={openCreate}
          className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Nueva Meta
        </button>
      </div>

      {/* Summary chips */}
      {total > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{achieved}/{total} logradas</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/30">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-bold text-blue-700 dark:text-blue-400">Promedio global {avgPct}%</span>
          </div>
        </div>
      )}

      {/* Goals list */}
      {loading ? (
        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-muted">Cargando…</div>
      ) : goals.length === 0 ? (
        <div className="bg-white dark:bg-card border-2 border-dashed border-gray-200 dark:border-card-border rounded-2xl p-12 text-center">
          <Target className="h-12 w-12 text-gray-300 dark:text-muted mx-auto mb-3" />
          <p className="text-gray-500 dark:text-muted font-semibold mb-1">Todavía no hay metas</p>
          <p className="text-gray-400 dark:text-muted text-sm mb-4">Crea tu primera meta para trackear el progreso del negocio.</p>
          <button onClick={openCreate} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            Crear primera meta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
          {goals.map(g => {
            const meta = CATEGORY_META[g.category];
            const Icon = meta.icon;
            const pct = Math.min(100, g.target > 0 ? Math.round((g.current / g.target) * 100) : 0);
            return (
              <div key={g.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-5 space-y-4 hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", meta.bg)}>
                      <Icon className={cn("h-4.5 w-4.5", meta.color)} />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900 dark:text-foreground leading-tight">{g.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={cn("text-[10px] font-bold uppercase tracking-wide", meta.color)}>{meta.label}</span>
                        <span className="text-gray-200 dark:text-card-border text-xs">·</span>
                        <span className="text-[10px] text-gray-400 dark:text-muted">{PERIOD_LABELS[g.period]}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <StatusIcon pct={pct} />
                    <button onClick={() => openEdit(g)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors">
                      <Pencil className="h-3.5 w-3.5 text-gray-400" />
                    </button>
                    <button onClick={() => remove(g.id)} className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                      <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>

                <ProgressBar current={g.current} target={g.target} />

                {g.dueDate && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-muted">
                    <Calendar className="h-3.5 w-3.5" />
                    Vence {new Date(g.dueDate).toLocaleDateString("es-PE")}
                  </div>
                )}

                {/* Quick update progress */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    defaultValue={g.current}
                    onBlur={e => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v !== g.current) updateProgress(g.id, v);
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-700 dark:text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                    placeholder="Actualizar progreso"
                  />
                  <span className="text-xs text-gray-400 dark:text-muted font-mono shrink-0">{g.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-md mx-4 p-3 sm:p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground">{editId ? "Editar meta" : "Nueva meta"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors">
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide mb-1 block">Nombre de la meta</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ej. Ventas del mes"
                  className="w-full px-2 sm:px-4 py-1.5 sm:py-2.5 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide mb-1 block">Categoría</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value as GoalCategory }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-foreground outline-none focus:border-primary transition-all"
                  >
                    {Object.entries(CATEGORY_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide mb-1 block">Período</label>
                  <select
                    value={form.period}
                    onChange={e => setForm(f => ({ ...f, period: e.target.value as GoalPeriod }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-foreground outline-none focus:border-primary transition-all"
                  >
                    {Object.entries(PERIOD_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide mb-1 block">Meta (cantidad)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.target}
                    onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                    placeholder="5000"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-foreground outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide mb-1 block">Unidad</label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="S/ ó pedidos"
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-foreground outline-none focus:border-primary transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-muted uppercase tracking-wide mb-1 block">Fecha límite (opcional)</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface text-gray-900 dark:text-foreground outline-none focus:border-primary transition-all"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-card-border text-gray-700 dark:text-foreground text-sm font-semibold hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name.trim() || !form.target}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors flex flex-wrap items-center justify-center gap-2"
              >
                {saving ? "Guardando…" : <><Check className="h-4 w-4" />{editId ? "Guardar" : "Crear meta"}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

