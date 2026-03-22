"use client";

import { useState, useEffect } from "react";
import { Star, Loader2, Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Supplier } from "@/types/erp";

type Evaluation = { id: string; supplierId: string; purchaseId?: string; punctuality: number; quality: number; price: number; notes?: string; createdAt: string };
type EvalAverages = { evaluations: Evaluation[]; averages: { punctuality: number; quality: number; price: number; overall: number } | null };

export default function SupplierEvaluationsTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [data, setData] = useState<EvalAverages | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ punctuality: 3, quality: 3, price: 3, notes: "" });
  const [evalTick, setEvalTick] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/suppliers")
      .then(r => r.ok ? r.json() : [])
      .then((d: Supplier[]) => { if (active) { setSuppliers(d); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    fetch(`/api/supplier-evaluations?supplierId=${selected}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (active && d) setData(d); })
      .catch(() => {});
    return () => { active = false; };
  }, [selected, evalTick]);

  const handleCreate = async () => {
    if (!selected) return;
    await fetch("/api/supplier-evaluations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierId: selected, ...form, notes: form.notes || undefined }) });
    setShowForm(false);
    setForm({ punctuality: 3, quality: 3, price: 3, notes: "" });
    setEvalTick(t => t + 1);
  };

  const StarRating = ({ value, onChange }: { value: number; onChange?: (v: number) => void }) => (
    <div className="flex flex-wrap gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange?.(n)} disabled={!onChange} className="disabled:cursor-default">
          <Star className={cn("h-5 w-5 transition", n <= value ? "text-amber-400 fill-amber-400" : "text-gray-300 dark:text-gray-600")} />
        </button>
      ))}
    </div>
  );

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2"><Star className="h-6 w-6 text-primary" />Evaluación de Proveedores</h2>
        <select value={selected} onChange={e => setSelected(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm min-w-50">
          <option value="">Seleccionar proveedor</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {!selected && <p className="text-center text-gray-400 dark:text-muted py-8">Selecciona un proveedor para ver y agregar evaluaciones</p>}

      {selected && data && (
        <>
          {data.averages && (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-center">
              {[{ label: "Puntualidad", val: data.averages.punctuality }, { label: "Calidad", val: data.averages.quality }, { label: "Precio", val: data.averages.price }, { label: "General", val: data.averages.overall }].map(m => (
                <div key={m.label}>
                  <p className="text-xs font-bold text-gray-500 dark:text-muted">{m.label}</p>
                  <p className="text-xl sm:text-2xl font-extrabold text-primary">{m.val.toFixed(1)}</p>
                  <StarRating value={Math.round(m.val)} />
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={() => setShowForm(v => !v)} className="flex flex-wrap items-center gap-2 bg-primary text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition"><Plus className="h-4 w-4" />Nueva Evaluación</button>
          </div>

          {showForm && (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-3 sm:p-6 space-y-4">
              {[{ label: "Puntualidad", key: "punctuality" as const }, { label: "Calidad", key: "quality" as const }, { label: "Precio", key: "price" as const }].map(f => (
                <div key={f.key} className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-600 dark:text-muted">{f.label}</span>
                  <StarRating value={form[f.key]} onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))} />
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-muted">Notas</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface text-sm" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleCreate} className="flex flex-wrap items-center gap-2 bg-primary text-white px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold"><Check className="h-4 w-4" />Guardar</button>
                <button onClick={() => setShowForm(false)} className="flex flex-wrap items-center gap-2 bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold"><X className="h-4 w-4" />Cancelar</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {data.evaluations.length === 0 && <p className="text-center text-gray-400 dark:text-muted py-4">Sin evaluaciones registradas</p>}
            {data.evaluations.map(e => (
              <div key={e.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
                <div className="flex justify-between items-start">
                  <div className="flex flex-wrap gap-2 sm:gap-4 text-xs">
                    <span>Punt: <b>{e.punctuality}</b>/5</span>
                    <span>Cal: <b>{e.quality}</b>/5</span>
                    <span>Precio: <b>{e.price}</b>/5</span>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(e.createdAt).toLocaleDateString()}</span>
                </div>
                {e.notes && <p className="text-sm text-gray-500 dark:text-muted mt-2 italic">&ldquo;{e.notes}&rdquo;</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

