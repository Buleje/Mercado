"use client";

import { useState } from "react";
import { Target, Plus, Pencil, Trash2, Check, Download } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type KPI = {
  id: string; name: string; description: string; formula: string; currentValue: number;
  target: number; unit: string; trend: "up" | "down" | "flat"; changePercent: number;
  period: string; category: string; color: string;
};

const SEED: KPI[] = [];

function fmt(v: number, unit: string) { return unit === "S/" ? `S/ ${v.toFixed(2)}` : `${v}${unit === "%" ? "%" : ` ${unit}`}`; }

export default function CustomKPITab() {
  const [kpis, setKpis] = useState(SEED);
  const [showModal, setShowModal] = useState(false);
  const [editKpi, setEditKpi] = useState<KPI | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formFormula, setFormFormula] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formUnit, setFormUnit] = useState("S/");
  const [formCategory, setFormCategory] = useState("Ventas");

  const _categories = Array.from(new Set(kpis.map(k => k.category)));

  const openCreate = () => { setEditKpi(null); setFormName(""); setFormDesc(""); setFormFormula(""); setFormTarget(""); setFormUnit("S/"); setFormCategory("Ventas"); setShowModal(true); };
  const openEdit = (k: KPI) => { setEditKpi(k); setFormName(k.name); setFormDesc(k.description); setFormFormula(k.formula); setFormTarget(String(k.target)); setFormUnit(k.unit); setFormCategory(k.category); setShowModal(true); };

  const save = () => {
    if (!formName.trim()) return;
    if (editKpi) {
      setKpis(prev => prev.map(k => k.id === editKpi.id ? { ...k, name: formName, description: formDesc, formula: formFormula, target: Number(formTarget) || 0, unit: formUnit, category: formCategory } : k));
    } else {
      setKpis(prev => [...prev, { id: `k${Date.now()}`, name: formName, description: formDesc, formula: formFormula, currentValue: 0, target: Number(formTarget) || 0, unit: formUnit, trend: "flat" as const, changePercent: 0, period: "Hoy", category: formCategory, color: "bg-gray-500" }]);
    }
    setShowModal(false);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Target className="h-6 w-6 text-primary" /> KPIs Personalizados</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Define y monitorea tus métricas clave de negocio</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => exportToCSV(kpis.map(k => ({ nombre: k.name, valor: k.currentValue, meta: k.target, unidad: k.unit, tendencia: k.trend, cambio: k.changePercent, categoria: k.category })), "kpis")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10"><Download className="h-3.5 w-3.5" /> CSV</button>
          <button onClick={openCreate} className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90"><Plus className="h-4 w-4" /> Nuevo KPI</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => {
          const progress = k.target > 0 ? Math.min((k.currentValue / k.target) * 100, 100) : 0;
          const inverse = k.name.includes("Agotamiento") || k.name.includes("Tiempo");
          const isGood = inverse ? k.currentValue <= k.target : k.currentValue >= k.target;
          return (
            <div key={k.id} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 relative group">
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(k)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-accent text-gray-400"><Pencil className="h-3 w-3" /></button>
                <button onClick={() => setKpis(prev => prev.filter(x => x.id !== k.id))} className="p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className={cn("h-2.5 w-2.5 rounded-full", k.color)} />
                <p className="text-[10px] font-bold text-gray-500 dark:text-muted uppercase tracking-wide">{k.category}</p>
              </div>
              <p className="font-bold text-sm text-gray-900 dark:text-foreground mb-1">{k.name}</p>
              <div className="flex flex-wrap items-baseline gap-2 mb-2">
                <span className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground">{fmt(k.currentValue, k.unit)}</span>
                <span className={cn("text-xs font-bold flex items-center", k.changePercent > 0 ? (inverse ? "text-red-500" : "text-emerald-500") : k.changePercent < 0 ? (inverse ? "text-emerald-500" : "text-red-500") : "text-gray-400")}>
                  {k.changePercent > 0 ? "↑" : k.changePercent < 0 ? "↓" : "→"} {Math.abs(k.changePercent)}%
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", isGood ? "bg-emerald-500" : inverse && progress > 100 ? "bg-red-500" : "bg-amber-500")} style={{ width: `${inverse ? Math.min((k.target / k.currentValue) * 100, 100) : progress}%` }} />
                </div>
                <span className="text-[10px] text-gray-400">{fmt(k.target, k.unit)}</span>
              </div>
              <p className="text-[10px] text-gray-400 font-mono mt-2">{k.formula}</p>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl p-3 sm:p-6 max-w-lg w-full mx-4 border border-gray-200 dark:border-card-border" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground mb-4">{editKpi ? "Editar KPI" : "Nuevo KPI"}</h3>
            <div className="space-y-3">
              <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Nombre</label><input value={formName} onChange={e => setFormName(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
              <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Descripción</label><input value={formDesc} onChange={e => setFormDesc(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
              <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Fórmula</label><input value={formFormula} onChange={e => setFormFormula(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm font-mono" placeholder="e.g. ventas / transacciones" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Meta</label><input value={formTarget} onChange={e => setFormTarget(e.target.value)} type="number" className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
                <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Unidad</label><select value={formUnit} onChange={e => setFormUnit(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm"><option>S/</option><option>%</option><option>pts</option><option>pedidos</option><option>veces</option><option>min</option></select></div>
                <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Categoría</label><select value={formCategory} onChange={e => setFormCategory(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm"><option>Ventas</option><option>Clientes</option><option>Inventario</option><option>Finanzas</option><option>Operaciones</option></select></div>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
              <button onClick={save} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90"><Check className="h-4 w-4 inline mr-1" />Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
