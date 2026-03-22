"use client";

import { useState, useMemo } from "react";
import { Users, Plus, Pencil, Trash2, Check, X, Target, UserCheck, TrendingUp, Filter, Eye, Download } from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

type Segment = {
  id: string; name: string; description: string; rules: SegmentRule[]; customerCount: number;
  avgTicket: number; avgFrequency: number; lastUpdated: string; color: string; autoRefresh: boolean;
};
type SegmentRule = { field: string; operator: string; value: string };

const FIELDS = ["dias_sin_compra", "total_comprado", "frecuencia_mensual", "ticket_promedio", "zona", "tier_programa", "canal_preferido", "productos_favoritos"];
const OPERATORS = ["<", ">", "=", ">=", "<=", "contiene", "no contiene"];

const SEED: Segment[] = [];

function fmt(n: number) { return `S/ ${n.toFixed(2)}`; }

export default function AutoSegmentsTab() {
  const [segments, setSegments] = useState(SEED);
  const [showModal, setShowModal] = useState(false);
  const [editSegment, setEditSegment] = useState<Segment | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formRules, setFormRules] = useState<SegmentRule[]>([{ field: FIELDS[0], operator: ">", value: "" }]);

  const totalCustomers = segments.reduce((s, sg) => s + sg.customerCount, 0);

  const openCreate = () => { setEditSegment(null); setFormName(""); setFormDesc(""); setFormRules([{ field: FIELDS[0], operator: ">", value: "" }]); setShowModal(true); };
  const openEdit = (sg: Segment) => { setEditSegment(sg); setFormName(sg.name); setFormDesc(sg.description); setFormRules([...sg.rules]); setShowModal(true); };

  const save = () => {
    if (!formName.trim()) return;
    if (editSegment) {
      setSegments(prev => prev.map(s => s.id === editSegment.id ? { ...s, name: formName, description: formDesc, rules: formRules } : s));
    } else {
      setSegments(prev => [...prev, { id: `sg${Date.now()}`, name: formName, description: formDesc, rules: formRules, customerCount: 0, avgTicket: 0, avgFrequency: 0, lastUpdated: new Date().toISOString().split("T")[0], color: "bg-blue-500", autoRefresh: true }]);
    }
    setShowModal(false);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Users className="h-6 w-6 text-primary" /> Segmentación Automática</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">Crea segmentos dinámicos basados en reglas</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={openCreate} className="flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90"><Plus className="h-4 w-4" /> Nuevo segmento</button>
          {segments.length > 0 && (
            <button onClick={() => setSegments([])} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
              <Trash2 className="h-4 w-4" /> Borrar todo
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Segmentos activos", value: segments.length, color: "text-blue-500" },
          { label: "Clientes segmentados", value: totalCustomers, color: "text-emerald-500" },
          { label: "Auto-refresh", value: segments.filter(s => s.autoRefresh).length, color: "text-violet-500" },
          { label: "En riesgo", value: segments.find(s => s.name.includes("riesgo"))?.customerCount ?? 0, color: "text-red-500" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4">
            <p className="text-xs font-semibold text-gray-500 dark:text-muted">{k.label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
        {segments.map(sg => (
          <div key={sg.id} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className={cn("h-3 w-3 rounded-full", sg.color)} />
                <h3 className="font-bold text-gray-900 dark:text-foreground">{sg.name}</h3>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(sg)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-accent text-gray-400 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => setSegments(prev => prev.filter(s => s.id !== sg.id))} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-muted mt-1 mb-3">{sg.description}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
              <div className="text-center">
                <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{sg.customerCount}</p>
                <p className="text-[10px] text-gray-400">Clientes</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{fmt(sg.avgTicket)}</p>
                <p className="text-[10px] text-gray-400">Ticket prom.</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{sg.avgFrequency}x</p>
                <p className="text-[10px] text-gray-400">Frec./mes</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {sg.rules.map((r, i) => (
                <span key={i} className="text-[10px] bg-gray-50 dark:bg-surface px-2 py-1 rounded-lg text-gray-600 dark:text-muted font-mono">{r.field} {r.operator} {r.value}</span>
              ))}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-card-border text-[10px] text-gray-400">
              <span>{sg.autoRefresh ? "🔄 Auto-refresh" : "📌 Manual"}</span>
              <span>Actualizado: {sg.lastUpdated}</span>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl p-3 sm:p-6 max-w-lg w-full mx-4 border border-gray-200 dark:border-card-border max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-gray-900 dark:text-foreground mb-4">{editSegment ? "Editar segmento" : "Nuevo segmento"}</h3>
            <div className="space-y-3">
              <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Nombre</label><input value={formName} onChange={e => setFormName(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
              <div><label className="text-xs font-bold text-gray-500 dark:text-muted">Descripción</label><input value={formDesc} onChange={e => setFormDesc(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm" /></div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted mb-2 block">Reglas</label>
                {formRules.map((r, i) => (
                  <div key={i} className="flex flex-wrap gap-2 mb-2">
                    <select value={r.field} onChange={e => { const nr = [...formRules]; nr[i].field = e.target.value; setFormRules(nr); }} className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-xs">{FIELDS.map(f => <option key={f}>{f}</option>)}</select>
                    <select value={r.operator} onChange={e => { const nr = [...formRules]; nr[i].operator = e.target.value; setFormRules(nr); }} className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-xs">{OPERATORS.map(o => <option key={o}>{o}</option>)}</select>
                    <input value={r.value} onChange={e => { const nr = [...formRules]; nr[i].value = e.target.value; setFormRules(nr); }} className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-xs" placeholder="valor" />
                    {formRules.length > 1 && <button onClick={() => setFormRules(formRules.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>}
                  </div>
                ))}
                <button onClick={() => setFormRules([...formRules, { field: FIELDS[0], operator: ">", value: "" }])} className="text-xs text-primary font-bold">+ Agregar regla</button>
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
