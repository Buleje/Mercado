"use client";

import { SectionTitle } from "@buleje/design-system";
 
 

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { LayoutGrid, Plus, Trash2, Edit3, Save, X, TrendingUp, Star } from "@buleje/design-system/icons";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Area {
  id: string;
  name: string;
  sqm: number;
  categories: string[];
  revenue: number; // manual or fetched
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "revenue_per_sqm_areas";

const ALL_CATEGORIES = [
  "Abarrotes",
  "Bebidas",
  "Lacteos",
  "Limpieza",
  "Higiene",
  "Snacks",
  "Frutas y Verduras",
  "Panaderia",
  "Congelados",
  "Otros",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getDefaultAreas(): Area[] {
  return [
    { id: "1", name: "Pasillo A - Abarrotes", sqm: 8, categories: ["Abarrotes"], revenue: 3200 },
    { id: "2", name: "Pasillo B - Bebidas", sqm: 4, categories: ["Bebidas", "Lacteos"], revenue: 2100 },
    { id: "3", name: "Pasillo C - Limpieza", sqm: 3, categories: ["Limpieza", "Higiene"], revenue: 890 },
    { id: "4", name: "Gondola Snacks", sqm: 2, categories: ["Snacks", "Panaderia"], revenue: 750 },
  ];
}

// ── Area Form ─────────────────────────────────────────────────────────────────

interface AreaFormProps {
  initial?: Partial<Area>;
  onSave: (area: Omit<Area, "id">) => void;
  onCancel: () => void;
}

function AreaForm({ initial, onSave, onCancel }: AreaFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [sqm, setSqm] = useState(initial?.sqm ?? 0);
  const [revenue, setRevenue] = useState(initial?.revenue ?? 0);
  const [cats, setCats] = useState<string[]>(initial?.categories ?? []);

  const toggle = useCallback((cat: string) => {
    setCats((p) => (p.includes(cat) ? p.filter((c) => c !== cat) : [...p, cat]));
  }, []);

  const valid = name.trim().length > 0 && sqm > 0 && cats.length > 0;

  return (
    <div className="p-4 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Nombre del area
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Pasillo A - Abarrotes"
            className="w-full rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Metros cuadrados (m2)
          </label>
          <input
            type="number"
            min={0.1}
            step={0.5}
            value={sqm}
            onChange={(e) => setSqm(Number(e.target.value))}
            className="w-full rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Ventas mensuales (S/)
          </label>
          <input
            type="number"
            min={0}
            value={revenue}
            onChange={(e) => setRevenue(Number(e.target.value))}
            className="w-full rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
            Categorias en esta area
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => toggle(cat)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  cats.includes(cat)
                    ? "bg-primary text-white border-primary"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)]"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => valid && onSave({ name: name.trim(), sqm, revenue, categories: cats })}
          disabled={!valid}
          className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          Guardar area
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl border border-[var(--rule-base)]"
        >
          <X className="w-4 h-4 text-[var(--text-secondary)]" />
        </button>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RevenuePerSquareMeter() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setAreas(load(STORAGE_KEY, getDefaultAreas()));
  }, []);

  const persist = useCallback((updated: Area[]) => {
    setAreas(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const addArea = useCallback(
    (area: Omit<Area, "id">) => {
      persist([...areas, { ...area, id: Date.now().toString() }]);
      setShowForm(false);
    },
    [areas, persist]
  );

  const updateArea = useCallback(
    (id: string, area: Omit<Area, "id">) => {
      persist(areas.map((a) => (a.id === id ? { ...area, id } : a)));
      setEditingId(null);
    },
    [areas, persist]
  );

  const deleteArea = useCallback(
    (id: string) => persist(areas.filter((a) => a.id !== id)),
    [areas, persist]
  );

  const ranked = useMemo(() => {
    return [...areas]
      .map((a) => ({ ...a, revenuePerSqm: a.sqm > 0 ? a.revenue / a.sqm : 0 }))
      .sort((a, b) => b.revenuePerSqm - a.revenuePerSqm);
  }, [areas]);

  const topArea = ranked[0];
  const bottomArea = ranked[ranked.length - 1];

  return (
    <div className="bg-white dark:bg-[var(--color-card)] rounded-xl border border-[var(--rule-base)] overflow-hidden ">
      {/* Header */}
      <div className="p-5 border-b border-[var(--rule-soft)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <LayoutGrid className="w-5 h-5 text-primary" />
          </div>
          <div>
            <SectionTitle className="font-bold text-[var(--text-primary)]">
              Rentabilidad por m2
            </SectionTitle>
            <p className="text-xs text-[var(--text-secondary)]">
              {areas.length} area{areas.length !== 1 ? "s" : ""} configurada{areas.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {!showForm && !editingId && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Nueva area
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {showForm && (
          <AreaForm onSave={addArea} onCancel={() => setShowForm(false)} />
        )}

        {/* Recommendation */}
        {ranked.length >= 2 && !showForm && (
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <p className="text-xs font-bold text-primary">
                Recomendacion
              </p>
            </div>
            <p className="text-xs text-[var(--text-primary)]">
              Amplia el espacio de{" "}
              <span className="font-semibold">{topArea?.name}</span> ({fmt(topArea?.revenuePerSqm ?? 0)}/m2).
              Reduce el area de{" "}
              <span className="font-semibold">{bottomArea?.name}</span> ({fmt(bottomArea?.revenuePerSqm ?? 0)}/m2).
            </p>
          </div>
        )}

        {/* Ranking */}
        <div className="space-y-2">
          {ranked.map((area, index) =>
            editingId === area.id ? (
              <AreaForm
                key={area.id}
                initial={area}
                onSave={(a) => updateArea(area.id, a)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                key={area.id}
                className={cn(
                  "p-4 rounded-xl border",
                  index === 0
                    ? "border-primary/30 bg-primary/5"
                    : "border-[var(--rule-soft)] bg-[var(--surface-alt)]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={cn(
                        "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold",
                        index === 0
                          ? "bg-primary text-white"
                          : "bg-[var(--rule-soft)] text-[var(--text-secondary)]"
                      )}
                    >
                      {index === 0 ? <Star className="w-3.5 h-3.5" /> : index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-primary)] text-sm truncate">
                        {area.name}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {area.sqm} m2 — {area.categories.join(", ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingId(area.id)}
                      className="p-1.5 rounded-lg hover:bg-[var(--rule-soft)] transition-colors"
                      aria-label="Editar"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    </button>
                    <button
                      onClick={() => deleteArea(area.id)}
                      className="p-1.5 rounded-lg hover:bg-[var(--data-error-50)] transition-colors"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[var(--data-error-500)]" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)]">Ventas/mes</p>
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                      {fmt(area.revenue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)]">Por m2</p>
                    <p
                      className={cn(
                        "text-sm font-extrabold",
                        index === 0
                          ? "text-primary"
                          : "text-[var(--text-primary)]"
                      )}
                    >
                      {fmt(area.revenuePerSqm)}/m2
                    </p>
                  </div>
                  {/* Bar */}
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          index === 0 ? "bg-primary" : "bg-[var(--rule-mid)]"
                        )}
                        style={{
                          width: topArea
                            ? `${Math.round((area.revenuePerSqm / topArea.revenuePerSqm) * 100)}%`
                            : "0%",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        {areas.length === 0 && !showForm && (
          <p className="text-sm text-[var(--text-tertiary)] text-center py-6">
            Agrega areas de tu tienda para calcular la rentabilidad por metro cuadrado.
          </p>
        )}
      </div>
    </div>
  );
}
