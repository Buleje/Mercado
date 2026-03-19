"use client";

import { useState, useEffect } from "react";
import { FlaskConical, Plus, Trash2, ToggleLeft, ToggleRight, BarChart3, Loader2, X } from "lucide-react";

type Variant = { id: string; label: string; weight: number };
type ABTest = { id: string; name: string; description: string; variants: Variant[]; active: boolean; createdAt: string };
type Result = { variantId: string; impressions: number; conversions: number; totalValue: number; conversionRate: number };

export default function ABTestsTab() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [variants, setVariants] = useState<Variant[]>([
    { id: "a", label: "Control", weight: 50 },
    { id: "b", label: "Variante B", weight: 50 },
  ]);
  const [results, setResults] = useState<Record<string, Result[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchTests = async () => {
    const res = await fetch("/api/ab-tests");
    if (res.ok) setTests(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch("/api/ab-tests");
      if (res.ok && active) setTests(await res.json());
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const create = async () => {
    if (!name.trim() || variants.length < 2) return;
    await fetch("/api/ab-tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: desc.trim(), variants }),
    });
    setName(""); setDesc(""); setShowCreate(false);
    setVariants([{ id: "a", label: "Control", weight: 50 }, { id: "b", label: "Variante B", weight: 50 }]);
    fetchTests();
  };

  const toggle = async (id: string) => {
    await fetch("/api/ab-tests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    fetchTests();
  };

  const del = async (id: string) => {
    await fetch("/api/ab-tests", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    fetchTests();
  };

  const loadResults = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    const res = await fetch(`/api/ab-tests/${id}/results`);
    if (res.ok) {
      const data = await res.json();
      setResults(prev => ({ ...prev, [id]: data }));
    }
    setExpandedId(id);
  };

  const addVariant = () => {
    const letter = String.fromCharCode(97 + variants.length);
    setVariants([...variants, { id: letter, label: `Variante ${letter.toUpperCase()}`, weight: 50 }]);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" />A/B Testing
        </h2>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" />Nuevo Test
        </button>
      </div>

      {/* Tests list */}
      {tests.length === 0 && <p className="text-center text-gray-400 dark:text-muted py-12">No hay A/B tests creados aún.</p>}
      <div className="space-y-3">
        {tests.map(t => (
          <div key={t.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900 dark:text-foreground">{t.name}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.active ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-surface dark:text-muted"}`}>
                    {t.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                {t.description && <p className="text-sm text-gray-500 dark:text-muted mt-1">{t.description}</p>}
                <div className="flex gap-2 mt-2 flex-wrap">
                  {t.variants.map(v => (
                    <span key={v.id} className="text-xs bg-gray-100 dark:bg-surface px-2 py-1 rounded-lg text-gray-700 dark:text-muted">
                      {v.label} ({v.weight}%)
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => loadResults(t.id)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition" title="Ver resultados">
                  <BarChart3 className="w-4 h-4 text-blue-500" />
                </button>
                <button onClick={() => toggle(t.id)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition" title={t.active ? "Desactivar" : "Activar"}>
                  {t.active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                </button>
                <button onClick={() => del(t.id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Eliminar">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>

            {/* Results expanded */}
            {expandedId === t.id && results[t.id] && (
              <div className="mt-4 border-t border-gray-100 dark:border-card-border pt-4">
                <h4 className="text-sm font-bold mb-2 text-gray-700 dark:text-muted">Resultados</h4>
                {results[t.id].length === 0 ? (
                  <p className="text-xs text-gray-400">Sin datos aún</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {results[t.id].map(r => {
                      const variant = t.variants.find(v => v.id === r.variantId);
                      return (
                        <div key={r.variantId} className="bg-gray-50 dark:bg-surface rounded-xl p-3">
                          <p className="font-semibold text-sm">{variant?.label || r.variantId}</p>
                          <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                            <div>
                              <p className="text-lg font-bold text-blue-600">{r.impressions}</p>
                              <p className="text-[10px] text-gray-400">Impresiones</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold text-green-600">{r.conversions}</p>
                              <p className="text-[10px] text-gray-400">Conversiones</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold text-purple-600">{r.conversionRate.toFixed(1)}%</p>
                              <p className="text-[10px] text-gray-400">Tasa</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-card-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-foreground">Nuevo A/B Test</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-surface"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del test" className="w-full px-3 py-2 border rounded-xl text-sm bg-white dark:bg-surface dark:border-card-border" />
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descripción (opcional)" className="w-full px-3 py-2 border rounded-xl text-sm bg-white dark:bg-surface dark:border-card-border" />

              <div>
                <p className="text-sm font-bold mb-2">Variantes</p>
                {variants.map((v, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input value={v.id} onChange={e => { const nv = [...variants]; nv[i] = { ...v, id: e.target.value }; setVariants(nv); }} placeholder="ID" className="w-16 px-2 py-1.5 border rounded-lg text-xs bg-white dark:bg-surface dark:border-card-border" />
                    <input value={v.label} onChange={e => { const nv = [...variants]; nv[i] = { ...v, label: e.target.value }; setVariants(nv); }} placeholder="Etiqueta" className="flex-1 px-2 py-1.5 border rounded-lg text-xs bg-white dark:bg-surface dark:border-card-border" />
                    <input type="number" value={v.weight} onChange={e => { const nv = [...variants]; nv[i] = { ...v, weight: +e.target.value }; setVariants(nv); }} className="w-16 px-2 py-1.5 border rounded-lg text-xs bg-white dark:bg-surface dark:border-card-border" />
                    {variants.length > 2 && (
                      <button onClick={() => setVariants(variants.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                ))}
                <button onClick={addVariant} className="text-xs text-primary hover:underline">+ Agregar variante</button>
              </div>
            </div>
            <button onClick={create} disabled={!name.trim()} className="w-full mt-4 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition disabled:opacity-50">
              Crear Test
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

