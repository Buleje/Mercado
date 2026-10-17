"use client";

/**
 * «Nueva receta» en tres pasos: nombre, ingredientes y resumen. Crea con
 * `POST /api/recetas` (el costo lo calcula el servidor).
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, X } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { csrfHeaders } from "@/lib/csrf-client";
import { Field } from "@/components/admin/shared/Field";
import { cn } from "@/lib/utils";

const INPUT =
  "w-full px-3 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ink)]/30";
const INPUT_CHICO =
  "w-full px-2 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ink)]/30";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  onCreada: () => void;
}

export function ModalNuevaReceta({ abierto: showNew, onCerrar, onCreada }: Props) {
  const [step, setStep] = useState(1);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newProductoId, setNewProductoId] = useState("");
  const [newIngredientes, setNewIngredientes] = useState<
    { productoId: string; cantidad: string; unidad: string }[]
  >([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const resetNew = useCallback(() => {
    onCerrar();
    setStep(1);
    setNewName("");
    setNewDesc("");
    setNewProductoId("");
    setNewIngredientes([]);
    setCreateError(null);
  }, [onCerrar]);

  // Escape: lo cierra el AdminModal; el listener del módulo cierra esta misma.

  const addIngrediente = () => {
    setNewIngredientes((prev) => [...prev, { productoId: "", cantidad: "", unidad: "unidad" }]);
  };

  /* Al abrir ya hay una fila de ingrediente lista (idempotente: StrictMode corre el efecto dos veces). */
  useEffect(() => {
    if (showNew)
      setNewIngredientes((prev) =>
        prev.length > 0 ? prev : [{ productoId: "", cantidad: "", unidad: "unidad" }],
      );
  }, [showNew]);

  const removeIngrediente = (i: number) => {
    setNewIngredientes((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateIngrediente = (i: number, field: string, value: string) => {
    setNewIngredientes((prev) =>
      prev.map((ing, idx) => (idx === i ? { ...ing, [field]: value } : ing)),
    );
  };

  const handleCreate = async () => {
    setCreateError(null);
    if (!newName.trim()) {
      setCreateError("Nombre requerido");
      return;
    }
    if (newIngredientes.length === 0) {
      setCreateError("Agrega al menos un ingrediente");
      return;
    }

    const ingredientes = newIngredientes.map((i) => ({
      productoId: parseInt(i.productoId),
      cantidad: parseFloat(i.cantidad),
      unidad: i.unidad || "unidad",
    }));

    const invalid = ingredientes.some(
      (i) => isNaN(i.productoId) || isNaN(i.cantidad) || i.cantidad <= 0,
    );
    if (invalid) {
      setCreateError("Revisa los ingredientes: ID y cantidad son requeridos");
      return;
    }

    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        nombre: newName.trim(),
        ingredientes,
      };
      if (newDesc.trim()) body.descripcion = newDesc.trim();
      if (newProductoId.trim()) body.productoId = parseInt(newProductoId);

      const res = await fetch("/api/recetas", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error al crear" }));
        throw new Error(err.error || "Error al crear receta");
      }
      resetNew();
      onCreada();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminModal
      open={showNew}
      onClose={resetNew}
      title="Nueva receta"
      description={`Paso ${step} de 3`}
      size="lg"
      claveVentana="recetas-nueva"
      footer={
        <div className="flex justify-end gap-3">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="px-4 min-h-12 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] rounded-xl transition-colors"
            >
              Anterior
            </button>
          ) : (
            <button
              onClick={resetNew}
              className="px-4 min-h-12 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--rule-soft)] rounded-xl transition-colors"
            >
              Cancelar
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="px-4 min-h-12 text-sm font-semibold text-white bg-[var(--accent-dark)] hover:brightness-110 rounded-xl transition-colors"
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center justify-center gap-2 px-4 min-h-12 text-sm font-semibold text-white bg-[var(--accent-dark)] hover:brightness-110 disabled:opacity-50 rounded-xl transition-colors"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Crear Receta
            </button>
          )}
        </div>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <div className="flex gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "flex-1 h-1.5 rounded-full",
                step >= s ? "bg-[var(--accent-ink)]" : "bg-[var(--rule-base)]",
              )}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <Field
              label="Nombre de la receta"
              labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1"
            >
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: Pan de yuca"
                className={INPUT}
              />
            </Field>
            <Field
              label="Descripción (opcional)"
              labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1"
            >
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Proceso de preparación..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ink)]/30 resize-none"
              />
            </Field>
            <Field
              label="ID Producto final (opcional)"
              labelClassName="block text-sm font-bold text-[var(--text-secondary)] mb-1"
            >
              <input
                type="number"
                value={newProductoId}
                onChange={(e) => setNewProductoId(e.target.value)}
                placeholder="ID del producto resultante"
                className={INPUT}
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-[var(--text-primary)]">Ingredientes</p>
              <button
                onClick={addIngrediente}
                className="min-h-12 px-2 text-sm font-bold text-[var(--accent-ink)] hover:underline"
              >
                + Agregar
              </button>
            </div>
            {newIngredientes.length === 0 && (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-4">
                Agrega ingredientes con el botón de arriba
              </p>
            )}
            {newIngredientes.map((ing, i) => (
              <div
                key={i}
                className="flex gap-2 items-end bg-[var(--surface-sunken)] rounded-xl p-3"
              >
                <Field
                  className="flex-1"
                  label="ID Producto"
                  labelClassName="block text-sm font-bold text-[var(--text-tertiary)] mb-0.5"
                >
                  <input
                    type="number"
                    value={ing.productoId}
                    onChange={(e) => updateIngrediente(i, "productoId", e.target.value)}
                    placeholder="ID"
                    className={INPUT_CHICO}
                  />
                </Field>
                <Field
                  className="w-24"
                  label="Cantidad"
                  labelClassName="block text-sm font-bold text-[var(--text-tertiary)] mb-0.5"
                >
                  <input
                    type="number"
                    step="0.01"
                    value={ing.cantidad}
                    onChange={(e) => updateIngrediente(i, "cantidad", e.target.value)}
                    placeholder="0"
                    className={INPUT_CHICO}
                  />
                </Field>
                <Field
                  className="w-24"
                  label="Unidad"
                  labelClassName="block text-sm font-bold text-[var(--text-tertiary)] mb-0.5"
                >
                  <input
                    type="text"
                    value={ing.unidad}
                    onChange={(e) => updateIngrediente(i, "unidad", e.target.value)}
                    placeholder="kg"
                    className={INPUT_CHICO}
                  />
                </Field>
                <button
                  aria-label="Quitar"
                  onClick={() => removeIngrediente(i)}
                  className="h-12 w-12 flex items-center justify-center rounded-xl hover:bg-[var(--data-error-100)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="bg-[var(--surface-sunken)] rounded-xl p-4 space-y-2">
              <p className="text-sm font-bold text-[var(--text-primary)]">
                {newName || "Sin nombre"}
              </p>
              {newDesc && <p className="text-sm text-[var(--text-secondary)]">{newDesc}</p>}
              <p className="text-sm text-[var(--text-tertiary)]">
                {newIngredientes.length} ingredientes
              </p>
            </div>
          </div>
        )}

        {createError && (
          <p className="text-sm text-[var(--data-error-500)] font-semibold">{createError}</p>
        )}
      </div>
    </AdminModal>
  );
}
