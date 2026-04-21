'use client';

import { CardTitle, LoadingState } from "@buleje/design-system";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, X, AlertTriangle, Pencil, Wallet } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type CategoriaPresupuesto = {
  nombre: string;
  limite: number;
  gastado: number;
  porcentaje: number;
};

type PresupuestoData = {
  mes: string;
  categorias: CategoriaPresupuesto[];
};

type DraftCategoria = {
  nombre: string;
  limite: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }

const CATEGORIAS_SUGERIDAS = [
  "Mercaderia", "Alquiler", "Servicios", "Personal", "Transporte", "Marketing", "Otros",
];

function mesLabel(mes: string): string {
  const [y, m] = mes.split("-");
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const idx = parseInt(m) - 1;
  return `${meses[idx] ?? m} ${y}`;
}

function getBarColor(porcentaje: number): string {
  if (porcentaje > 100) return "bg-red-500 animate-pulse";
  if (porcentaje > 80) return "bg-red-500";
  if (porcentaje > 60) return "bg-amber-500";
  return "bg-[var(--accent-soft)]";
}

function getBarTrack(porcentaje: number): string {
  if (porcentaje > 100) return "bg-red-100 dark:bg-red-900/20";
  if (porcentaje > 80) return "bg-red-100 dark:bg-red-900/20";
  if (porcentaje > 60) return "bg-amber-100 dark:bg-amber-900/20";
  return "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PresupuestoMensualTab() {
  const [data, setData] = useState<PresupuestoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal
  const [showEdit, setShowEdit] = useState(false);
  const [draft, setDraft] = useState<DraftCategoria[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/presupuesto");
      if (!res.ok) throw new Error("Error al cargar presupuesto");
      const json: PresupuestoData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Edit handlers ──────────────────────────────────────────────────────────

  const openEdit = () => {
    if (data && data.categorias.length > 0) {
      setDraft(data.categorias.map(c => ({ nombre: c.nombre, limite: String(c.limite) })));
    } else {
      setDraft(CATEGORIAS_SUGERIDAS.map(n => ({ nombre: n, limite: "" })));
    }
    setSaveError(null);
    setShowEdit(true);
  };

  const addDraftCat = () => {
    setDraft(prev => [...prev, { nombre: "", limite: "" }]);
  };

  const removeDraftCat = (i: number) => {
    setDraft(prev => prev.filter((_, idx) => idx !== i));
  };

  const updateDraft = (i: number, field: keyof DraftCategoria, value: string) => {
    setDraft(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: value } : d));
  };

  const handleSave = async () => {
    setSaveError(null);
    const categorias = draft
      .filter(d => d.nombre.trim() && d.limite.trim())
      .map(d => ({ nombre: d.nombre.trim(), limite: parseFloat(d.limite) }));

    if (categorias.length === 0) {
      setSaveError("Agrega al menos una categoria con nombre y limite");
      return;
    }
    if (categorias.some(c => isNaN(c.limite) || c.limite <= 0)) {
      setSaveError("Todos los limites deben ser mayores a 0");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/presupuesto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorias }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al guardar" }));
        throw new Error(err.error || "Error al guardar");
      }
      setShowEdit(false);
      fetchData();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  // ── Computed ───────────────────────────────────────────────────────────────

  const totalPresupuestado = data?.categorias.reduce((s, c) => s + c.limite, 0) ?? 0;
  const totalGastado = data?.categorias.reduce((s, c) => s + c.gastado, 0) ?? 0;
  const porcentajeTotal = totalPresupuestado > 0 ? Math.round((totalGastado / totalPresupuestado) * 100) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LoadingState />
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <AlertTriangle className="h-8 w-8 text-[var(--data-error)]" />
        <p className="text-sm text-[var(--data-error)] dark:text-[var(--data-error)]">{error}</p>
        <button onClick={fetchData} className="text-xs text-primary hover:underline font-semibold">Reintentar</button>
      </div>
    );
  }

  // Empty state
  if (!data || data.categorias.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center">
          <Wallet className="h-8 w-8 text-primary" />
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-[var(--text-primary)]">No has definido un presupuesto</p>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">Crea uno para controlar tus gastos mensuales.</p>
        </div>
        <button
          onClick={openEdit}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark  transition-colors"
        >
          <Plus className="h-4 w-4" />
          Crear presupuesto
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base font-bold text-[var(--text-primary)]">
            Presupuesto Mensual &mdash; {mesLabel(data.mes)}
          </CardTitle>
        </div>
        <button
          onClick={openEdit}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar presupuesto
        </button>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {data.categorias.map((cat) => {
          const restante = cat.limite - cat.gastado;
          const barWidth = Math.min(cat.porcentaje, 100);
          return (
            <div
              key={cat.nombre}
              className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4  space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[var(--text-primary)]">{cat.nombre}</p>
                <span className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-lg",
                  cat.porcentaje > 100
                    ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/30 text-[var(--data-error)] dark:text-[var(--data-error)] animate-pulse"
                    : cat.porcentaje > 80
                      ? "bg-[var(--data-error-100)] dark:bg-[var(--data-error)]/30 text-[var(--data-error)] dark:text-[var(--data-error)]"
                      : cat.porcentaje > 60
                        ? "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/30 text-[var(--data-warning)] dark:text-[var(--data-warning)]"
                        : "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] dark:text-[var(--data-success)]"
                )}>
                  {cat.porcentaje}%
                </span>
              </div>

              {/* Progress bar */}
              <div className={cn("h-2.5 rounded-full overflow-hidden", getBarTrack(cat.porcentaje))}>
                <div
                  className={cn("h-full rounded-full transition-all duration-[var(--dur-slow)]", getBarColor(cat.porcentaje))}
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-tertiary)]">
                  {formatCurrency(cat.gastado)} de {formatCurrency(cat.limite)}
                </span>
              </div>

              <p className={cn(
                "text-xs font-bold",
                restante >= 0
                  ? "text-[var(--data-success)] dark:text-[var(--data-success)]"
                  : "text-[var(--data-error)] dark:text-[var(--data-error)]"
              )}>
                {restante >= 0
                  ? `Quedan ${formatCurrency(restante)}`
                  : `Excedido en ${formatCurrency(Math.abs(restante))}`
                }
              </p>

              {cat.porcentaje > 100 && (
                <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error)] dark:text-[var(--data-error)] animate-pulse">
                  Excedido
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Resumen inferior */}
      <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 ">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Total presupuestado</p>
            <p className="text-lg font-bold text-[var(--text-primary)]">{formatCurrency(totalPresupuestado)}</p>
          </div>
          <div>
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Total gastado</p>
            <p className="text-lg font-bold text-[var(--text-primary)]">{formatCurrency(totalGastado)}</p>
          </div>
          <div>
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">% del presupuesto</p>
            <p className={cn(
              "text-lg font-bold",
              porcentajeTotal > 100
                ? "text-[var(--data-error)] dark:text-[var(--data-error)]"
                : porcentajeTotal > 80
                  ? "text-[var(--data-warning)] dark:text-[var(--data-warning)]"
                  : "text-[var(--data-success)] dark:text-[var(--data-success)]"
            )}>
              {porcentajeTotal}%
            </p>
          </div>
        </div>
        <div className={cn("h-2 rounded-full overflow-hidden mt-3", getBarTrack(porcentajeTotal))}>
          <div
            className={cn("h-full rounded-full transition-all duration-[var(--dur-slow)]", getBarColor(porcentajeTotal))}
            style={{ width: `${Math.min(porcentajeTotal, 100)}%` }}
          />
        </div>
      </div>

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      {showEdit && (
        <>
          <div className="modal-backdrop" onClick={() => setShowEdit(false)} />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setShowEdit(false)}
          >
            <div className="w-full max-w-lg bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-[var(--text-primary)]">Editar Presupuesto</CardTitle>
                <button onClick={() => setShowEdit(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">
                  <X className="h-4 w-4 text-[var(--text-secondary)]" />
                </button>
              </div>

              <div className="space-y-2">
                {draft.map((d, i) => (
                  <div key={i} className="flex gap-2 items-end bg-gray-50 dark:bg-white/5 rounded-xl p-3">
                    <div className="flex-1">
                      <label className="block text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mb-0.5">Categoria</label>
                      <input
                        type="text"
                        value={d.nombre}
                        onChange={e => updateDraft(i, "nombre", e.target.value)}
                        placeholder="Ej: Mercaderia"
                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </div>
                    <div className="w-28">
                      <label className="block text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mb-0.5">Limite (S/)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={d.limite}
                        onChange={e => updateDraft(i, "limite", e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-white/10 bg-white dark:bg-white/5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </div>
                    <button
                      onClick={() => removeDraftCat(i)}
                      className="p-1.5 rounded-lg hover:bg-[var(--data-error-100)] dark:hover:bg-[var(--data-error)]/20 text-[var(--text-tertiary)] hover:text-[var(--data-error)] transition-colors shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={addDraftCat}
                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar categoria
              </button>

              {saveError && <p className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)] font-semibold">{saveError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowEdit(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--text-secondary)] bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary-dark disabled:opacity-50  transition-colors"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
