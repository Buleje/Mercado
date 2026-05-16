"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Target, Plus, Pencil, Trash2, Check, Download, RefreshCw, TrendingUp, TrendingDown, Minus } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import type { CustomKpi, KpiTrendPoint } from "@/app/api/custom-kpis/route";
import { csrfHeaders } from "@/lib/csrf-client";

function fmt(v: number, unit: string) {
  if (unit === "S/") return `S/ ${v.toFixed(2)}`;
  if (unit === "%") return `${v.toFixed(1)}%`;
  return `${v} ${unit}`;
}

function Sparkline({ history, trend }: { history: KpiTrendPoint[]; trend: CustomKpi["trend"] }) {
  if (history.length < 2) return null;
  const vals = history.map(p => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const W = 80, H = 28;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - min) / range) * H}`).join(" ");
  const color = trend === "up" ? "var(--accent)" : trend === "down" ? "#ef4444" : "#6b7280";
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
      <circle cx={(vals.length - 1) / (vals.length - 1) * W} cy={H - ((vals[vals.length - 1] - min) / range) * H} r="2.5" fill={color} />
    </svg>
  );
}

const EMPTY_FORM = { name: "", desc: "", formula: "", target: "", unit: "S/", category: "Ventas", color: "bg-[var(--accent-soft)]" };
const COLOR_OPTIONS = [
  { label: "Verde", value: "bg-[var(--accent-soft)]" },
  { label: "Azul", value: "bg-[var(--accent-soft)]" },
  { label: "Violeta", value: "bg-[var(--text-primary)]" },
  { label: "Ámbar", value: "bg-[var(--data-warning-500)]" },
  { label: "Rojo", value: "bg-[var(--data-error-500)]" },
  { label: "Gris", value: "bg-gray-500" },
];

export default function CustomKPITab() {
  const [kpis, setKpis] = useState<CustomKpi[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editKpi, setEditKpi] = useState<CustomKpi | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/custom-kpis");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setKpis(data.kpis ?? []);
      setIsDemo(!!data.demo);
    } catch {
      setKpis([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditKpi(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (k: CustomKpi) => {
    setEditKpi(k);
    setForm({ name: k.name, desc: k.description, formula: k.formula, target: String(k.target), unit: k.unit, category: k.category, color: k.color });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editKpi) {
        await fetch("/api/custom-kpis", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ id: editKpi.id, name: form.name, description: form.desc, formula: form.formula, target: Number(form.target) || 0, unit: form.unit, category: form.category, color: form.color }),
        });
        setKpis(prev => prev.map(k => k.id === editKpi.id ? { ...k, name: form.name, description: form.desc, formula: form.formula, target: Number(form.target) || 0, unit: form.unit, category: form.category, color: form.color } : k));
      } else {
        const res = await fetch("/api/custom-kpis", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name: form.name, description: form.desc, formula: form.formula, target: Number(form.target) || 0, unit: form.unit, category: form.category, color: form.color }),
        });
        const data = await res.json();
        setKpis(prev => [...prev, { id: data.id, name: form.name, description: form.desc, formula: form.formula, currentValue: 0, target: Number(form.target) || 0, unit: form.unit, trend: "flat", changePercent: 0, period: "Hoy", category: form.category, color: form.color, history: [] }]);
      }
    } finally {
      setSaving(false);
      setShowModal(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/custom-kpis?id=${id}`, { method: "DELETE" }).catch((err) => console.warn("[CustomKPITab] delete failed:", err));
    setKpis(prev => prev.filter(k => k.id !== id));
  };

  const TrendIcon = (trend: CustomKpi["trend"]) =>
    trend === "up" ? <TrendingUp className="h-3.5 w-3.5" /> : trend === "down" ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] flex flex-wrap items-center gap-2">
            <Target className="h-6 w-6 text-primary" /> KPIs Personalizados
            {isDemo && <span className="text-xs font-normal text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 px-2 py-0.5 rounded-full">datos demo</span>}
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Define y monitorea tus métricas clave de negocio</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} disabled={loading} className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-surface text-[var(--text-tertiary)]">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button onClick={() => exportToCSV(kpis.map(k => ({ nombre: k.name, valor: k.currentValue, meta: k.target, unidad: k.unit, tendencia: k.trend, cambio: k.changePercent, categoria: k.category })), "kpis")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Nuevo KPI
          </button>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 h-40 animate-pulse bg-[var(--surface-sunken)] dark:bg-surface" />
          ))}
        </div>
      ) : kpis.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)] bg-[var(--surface-raised)] rounded-xl border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)]">
          <Target className="h-12 w-12 mb-3 text-[var(--text-tertiary)]" />
          <p className="font-bold text-[var(--text-secondary)] dark:text-muted">Sin KPIs definidos</p>
          <p className="text-sm mt-1">Crea tu primer KPI personalizado</p>
          <button onClick={openCreate} className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Crear KPI
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {kpis.map(k => {
            const progress = k.target > 0 ? Math.min((k.currentValue / k.target) * 100, 100) : 0;
            const inverse = k.name.toLowerCase().includes("tiempo") || k.name.toLowerCase().includes("agotamiento");
            const isGood = inverse ? k.currentValue <= k.target : k.currentValue >= k.target;
            const trendColor = k.trend === "up" ? (inverse ? "text-[var(--data-error-500)]" : "text-[var(--data-success-500)]") : k.trend === "down" ? (inverse ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]") : "text-[var(--text-tertiary)]";

            return (
              <div key={k.id} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] p-4 relative group">
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(k)} className="p-1 rounded-lg hover:bg-[var(--surface-sunken)] dark:hover:bg-accent text-[var(--text-tertiary)]"><Pencil className="h-3 w-3" /></button>
                  <button onClick={() => remove(k.id)} className="p-1 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"><Trash2 className="h-3 w-3" /></button>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", k.color)} />
                  <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted">{k.category}</p>
                </div>
                <p className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-1 pr-12">{k.name}</p>

                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xl font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(k.currentValue, k.unit)}</span>
                  <span className={cn("text-xs font-bold flex items-center gap-0.5", trendColor)}>
                    {TrendIcon(k.trend)} {Math.abs(k.changePercent)}%
                  </span>
                </div>

                {/* Sparkline */}
                {k.history.length >= 2 && (
                  <div className="mb-2">
                    <Sparkline history={k.history} trend={k.trend} />
                  </div>
                )}

                {/* Barra progreso hacia meta */}
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-1.5 bg-[var(--surface-sunken)] dark:bg-surface rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", isGood ? "bg-[var(--accent-soft)]" : "bg-[var(--data-warning-500)]")}
                      style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">{fmt(k.target, k.unit)}</span>
                </div>

                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono mt-1 truncate">{k.formula}</p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mt-0.5">{k.period}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-backdrop p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--surface-raised)] rounded-xl p-4 sm:p-6 max-w-lg w-full mx-4 border border-[var(--rule-base)] dark:border-[var(--rule-base)]" onClick={e => e.stopPropagation()}>
            <CardTitle className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-4">{editKpi ? "Editar KPI" : "Nuevo KPI"}</CardTitle>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Nombre *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm" placeholder="Ej: Ticket Promedio" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Descripción</label>
                <input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm" placeholder="¿Qué mide este KPI?" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Fórmula</label>
                <input value={form.formula} onChange={e => setForm(f => ({ ...f, formula: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm font-mono" placeholder="ventas / transacciones" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Meta</label>
                  <input value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} type="number" className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Unidad</label>
                  <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm">
                    {["S/", "%", "pts", "pedidos", "veces", "min", "días"].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">Categoría</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-white dark:bg-surface text-sm">
                    {["Ventas", "Clientes", "Inventario", "Finanzas", "Operaciones"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted block mb-1">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c.value} onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={cn("h-7 w-7 rounded-full transition-all", c.value, form.color === c.value && "ring-2 ring-offset-2 ring-primary")} title={c.label} />
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-accent">Cancelar</button>
              <button onClick={save} disabled={saving || !form.name.trim()} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
