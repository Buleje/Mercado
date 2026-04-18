"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2, Save, Check, Plus, Trash2, Package, Percent, ChevronDown, ChevronUp,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type ComboTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  categories: string[];
  size: number;
  discount: number;
  enabled: boolean;
};

const DEFAULT_TEMPLATES: ComboTemplate[] = [];

const ALL_CATEGORIES = [
  { id: "frutas-verduras", label: "Frutas y Verduras" },
  { id: "abarrotes", label: "Abarrotes" },
  { id: "carnes", label: "Carnes" },
  { id: "lacteos", label: "Lácteos" },
  { id: "bebidas", label: "Bebidas" },
  { id: "limpieza", label: "Limpieza" },
];

export default function CombosEditorTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [combos, setCombos] = useState<ComboTemplate[]>(DEFAULT_TEMPLATES);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [originalJson, setOriginalJson] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.comboTemplates && Array.isArray(d.comboTemplates)) {
          setCombos(d.comboTemplates);
          setOriginalJson(JSON.stringify(d.comboTemplates));
        } else {
          setOriginalJson(JSON.stringify(DEFAULT_TEMPLATES));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const hasChanges = JSON.stringify(combos) !== originalJson;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboTemplates: combos }),
      });
      setOriginalJson(JSON.stringify(combos));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    setSaving(false);
  }, [combos]);

  const addCombo = useCallback(() => {
    const id = `combo-${Date.now()}`;
    setCombos((prev) => [...prev, {
      id,
      name: "Nuevo Combo",
      description: "Descripción del combo",
      emoji: "",
      categories: ["abarrotes"],
      size: 3,
      discount: 10,
      enabled: true,
    }]);
    setExpanded(id);
  }, []);

  const removeCombo = useCallback((id: string) => {
    setCombos((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateCombo = useCallback((id: string, updates: Partial<ComboTemplate>) => {
    setCombos((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, []);

  const toggleCategory = useCallback((comboId: string, catId: string) => {
    setCombos((prev) => prev.map((c) => {
      if (c.id !== comboId) return c;
      const has = c.categories.includes(catId);
      return { ...c, categories: has ? c.categories.filter((x) => x !== catId) : [...c.categories, catId] };
    }));
  }, []);

  const enabledCount = useMemo(() => combos.filter((c) => c.enabled).length, [combos]);

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center text-[var(--text-tertiary)] dark:text-muted">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando combos…
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 flex-wrap">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Editor de Combos
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">
            {combos.length} combos · {enabledCount} activos
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={addCombo} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-[var(--text-secondary)] dark:text-foreground bg-gray-100 dark:bg-accent hover:bg-gray-200 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Nuevo combo
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={cn(
              "inline-flex items-center gap-1.5 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold text-white transition-all",
              saved ? "bg-[var(--accent-soft)]" : "bg-primary hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saved ? "¡Guardado!" : "Guardar"}
          </button>
        </div>
      </div>

      {/* Combo list */}
      <div className="space-y-2">
        {combos.map((combo) => (
          <div key={combo.id} className={cn("bg-white dark:bg-card border rounded-xl overflow-hidden  transition-all", combo.enabled ? "border-[var(--rule-base)] dark:border-card-border" : "border-[var(--rule-soft)] dark:border-card-border/50 opacity-60")}>
            <button onClick={() => setExpanded(expanded === combo.id ? null : combo.id)} className="w-full flex flex-wrap items-center gap-3 px-5 py-4 text-left">
              <span className="text-xl sm:text-2xl">{combo.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">{combo.name}</p>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{combo.categories.length} categorías · {combo.discount}% dto · {combo.size} productos</p>
              </div>
              <span className={cn("text-[length:var(--ts-2xs)] font-bold uppercase px-2 py-0.5 rounded-full", combo.enabled ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]" : "bg-gray-100 text-[var(--text-secondary)]")}>
                {combo.enabled ? "Activo" : "Inactivo"}
              </span>
              {expanded === combo.id ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
            </button>

            {expanded === combo.id && (
              <div className="px-5 pb-5 border-t border-[var(--rule-soft)] dark:border-card-border space-y-4 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Nombre</label>
                    <input value={combo.name} onChange={(e) => updateCombo(combo.id, { name: e.target.value })} className="w-full rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Emoji</label>
                    <input value={combo.emoji} onChange={(e) => updateCombo(combo.id, { emoji: e.target.value })} className="w-full rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm" maxLength={4} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Descripción</label>
                  <textarea value={combo.description} onChange={(e) => updateCombo(combo.id, { description: e.target.value })} rows={2} className="w-full rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm resize-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1">Productos por combo</label>
                    <input type="number" min={2} max={6} value={combo.size} onChange={(e) => updateCombo(combo.id, { size: parseInt(e.target.value) || 3 })} className="w-full rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1 flex items-center gap-1"><Percent className="h-3 w-3" /> Descuento (%)</label>
                    <input type="number" min={1} max={50} value={combo.discount} onChange={(e) => updateCombo(combo.id, { discount: parseInt(e.target.value) || 10 })} className="w-full rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted mb-1.5">Categorías de productos</label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => toggleCategory(combo.id, cat.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                          combo.categories.includes(cat.id)
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-gray-50 dark:bg-background border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)]"
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--text-primary)] dark:text-foreground">
                    <button
                      type="button"
                      onClick={() => updateCombo(combo.id, { enabled: !combo.enabled })}
                      className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors", combo.enabled ? "bg-primary" : "bg-gray-300 dark:bg-surface")}
                    >
                      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform", combo.enabled ? "translate-x-6" : "translate-x-1")} />
                    </button>
                    Activo
                  </label>
                  <button onClick={() => removeCombo(combo.id)} className="inline-flex items-center gap-1.5 text-xs text-[var(--data-error)] hover:text-[var(--data-error)] font-medium">
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

