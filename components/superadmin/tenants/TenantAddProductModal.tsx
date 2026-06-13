"use client";

/**
 * TenantAddProductModal — superadmin agrega un producto a una tienda existente
 * con sus modifier groups + options (toppings, cremas, adicionales).
 *
 * Llama a POST /api/superadmin/tenants/[slug]/products que crea el product
 * y los ProductModifierGroup + ProductModifierOption en una transacción.
 *
 * Diseño minimalista — campos esenciales arriba, modifier groups colapsable.
 */

import { useState } from "react";
import { X, Plus, Trash2, Loader2, CheckCircle2, Package } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

type Option = { name: string; priceDelta: number; isDefault?: boolean };
type Group = {
  name: string;
  description?: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: Option[];
};

interface Props {
  open: boolean;
  onClose: () => void;
  tenantSlug: string;
  tenantName: string;
  onCreated?: () => void;
}

export default function TenantAddProductModal({
  open,
  onClose,
  tenantSlug,
  tenantName,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [unit, setUnit] = useState("unidad");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [stock, setStock] = useState<number | "">("");
  // ADR-131: empaquetada (default → Inicio + tienda) vs preparada (→ solo tienda).
  const [isPrepared, setIsPrepared] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  const reset = () => {
    setName("");
    setCategory("");
    setPrice(0);
    setUnit("unidad");
    setDescription("");
    setImage("");
    setStock("");
    setGroups([]);
    setError(null);
    setSuccess(false);
  };

  const addGroup = () =>
    setGroups((g) => [
      ...g,
      { name: "Nuevo grupo", required: false, minSelect: 0, maxSelect: 1, options: [] },
    ]);
  const removeGroup = (i: number) => setGroups((g) => g.filter((_, j) => j !== i));
  const updateGroup = (i: number, patch: Partial<Group>) =>
    setGroups((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addOption = (gIdx: number) =>
    setGroups((g) =>
      g.map((x, j) =>
        j === gIdx ? { ...x, options: [...x.options, { name: "Nueva opción", priceDelta: 0 }] } : x,
      ),
    );
  const removeOption = (gIdx: number, oIdx: number) =>
    setGroups((g) =>
      g.map((x, j) =>
        j === gIdx ? { ...x, options: x.options.filter((_, k) => k !== oIdx) } : x,
      ),
    );
  const updateOption = (gIdx: number, oIdx: number, patch: Partial<Option>) =>
    setGroups((g) =>
      g.map((x, j) =>
        j === gIdx
          ? { ...x, options: x.options.map((op, k) => (k === oIdx ? { ...op, ...patch } : op)) }
          : x,
      ),
    );

  const handleSave = async () => {
    if (!name.trim() || !category.trim() || price <= 0) {
      setError("Completá nombre, categoría y precio.");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      category: category.trim(),
      price,
      unit: unit.trim() || "unidad",
      description: description.trim() || null,
      image: image.trim() || null,
      stock: typeof stock === "number" ? stock : null,
      active: true,
      isPrepared, // ADR-131
      modifierGroups: groups.map((g) => ({
        name: g.name.trim(),
        description: g.description?.trim() || null,
        required: g.required,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        options: g.options.map((o) => ({
          name: o.name.trim(),
          priceDelta: Number(o.priceDelta) || 0,
          isDefault: !!o.isDefault,
        })),
      })),
    };
    const res = await fetch(`/api/superadmin/tenants/${encodeURIComponent(tenantSlug)}/products`, {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError("No se pudo crear el producto.");
      return;
    }
    setSuccess(true);
    onCreated?.();
    setTimeout(() => {
      reset();
      onClose();
    }, 1200);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Agregar producto a ${tenantName}`}
      className="fixed inset-0 z-[8000] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-[var(--shadow-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--rule-soft)] px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              SUPERADMIN · AGREGAR PRODUCTO
            </p>
            <h2 className="text-xl font-extrabold text-[var(--text-primary)] flex items-center gap-2 mt-0.5">
              <Package className="h-5 w-5 text-[var(--accent)]" />
              {tenantName}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Datos esenciales */}
          <section>
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-3">
              Información del producto
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">Nombre *</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-[var(--rule-base)] px-3 py-2 text-base"
                  placeholder="Pollo a la brasa"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">Categoría *</span>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-lg border border-[var(--rule-base)] px-3 py-2 text-base"
                  placeholder="pollo-brasa"
                />
              </label>
              {/* ADR-131: define DÓNDE se muestra el producto. */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">¿Cómo se vende?</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: false, t: "Empaquetada", d: "Inicio + tienda" },
                    { v: true, t: "Preparada", d: "Solo tienda (comida)" },
                  ].map((opt) => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => setIsPrepared(opt.v)}
                      aria-pressed={isPrepared === opt.v}
                      className={`rounded-lg border-2 px-3 py-2 text-left transition-colors ${
                        isPrepared === opt.v
                          ? "border-[var(--accent)] bg-[var(--accent)]/5"
                          : "border-[var(--rule-base)] hover:border-[var(--accent)]/50"
                      }`}
                    >
                      <span className="block text-sm font-bold text-[var(--text-primary)]">{opt.t}</span>
                      <span className="block text-xs text-[var(--text-secondary)]">{opt.d}</span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">Precio (S/) *</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value) || 0)}
                  className="rounded-lg border border-[var(--rule-base)] px-3 py-2 text-base"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">Unidad</span>
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="rounded-lg border border-[var(--rule-base)] px-3 py-2 text-base"
                  placeholder="unidad / porción / kilo"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">Stock inicial</span>
                <input
                  type="number"
                  min={0}
                  value={stock}
                  onChange={(e) =>
                    setStock(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))
                  }
                  className="rounded-lg border border-[var(--rule-base)] px-3 py-2 text-base"
                  placeholder="999"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">Imagen URL (opcional)</span>
                <input
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  className="rounded-lg border border-[var(--rule-base)] px-3 py-2 text-base"
                  placeholder="https://..."
                />
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-sm font-semibold text-[var(--text-secondary)]">Descripción</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="rounded-lg border border-[var(--rule-base)] px-3 py-2 text-base resize-none"
                  placeholder="Incluye ensalada y cremas"
                />
              </label>
            </div>
          </section>

          {/* Modifier groups */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Variaciones, toppings y adicionales
                </h3>
                <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                  Ej: &ldquo;Crema adicional&rdquo; (Chimichurri / Aceituna), &ldquo;Adicional&rdquo; (Papas +S/2 / Chaufa +S/2)
                </p>
              </div>
              <button
                type="button"
                onClick={addGroup}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
              >
                <Plus className="h-4 w-4" /> Grupo
              </button>
            </div>

            {groups.length === 0 && (
              <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-6 text-center text-sm text-[var(--text-tertiary)]">
                Sin grupos de modificadores. Agregá uno si el producto tiene variaciones.
              </p>
            )}

            {groups.map((g, gIdx) => (
              <div
                key={gIdx}
                className="mb-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    value={g.name}
                    onChange={(e) => updateGroup(gIdx, { name: e.target.value })}
                    placeholder="Nombre del grupo"
                    className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-sm font-bold col-span-2"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={g.required}
                      onChange={(e) => updateGroup(gIdx, { required: e.target.checked })}
                      className="h-4 w-4"
                    />
                    Obligatorio
                  </label>
                </div>
                <div className="space-y-1.5">
                  {g.options.map((o, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2">
                      <input
                        value={o.name}
                        onChange={(e) => updateOption(gIdx, oIdx, { name: e.target.value })}
                        placeholder="Nombre opción"
                        className="flex-1 rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-sm"
                      />
                      <span className="text-sm text-[var(--text-tertiary)]">+S/</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={o.priceDelta}
                        onChange={(e) =>
                          updateOption(gIdx, oIdx, { priceDelta: Number(e.target.value) || 0 })
                        }
                        className="w-20 rounded-lg border border-[var(--rule-base)] px-2 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(gIdx, oIdx)}
                        aria-label="Eliminar opción"
                        className="p-1.5 rounded-lg text-[var(--data-error-500)] hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addOption(gIdx)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Opción
                  </button>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => removeGroup(gIdx)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-[var(--data-error-500)] hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar grupo
                  </button>
                </div>
              </div>
            ))}
          </section>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-[var(--data-error-500)]">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-[var(--data-success-700)] flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Producto creado en {tenantName}.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[var(--rule-soft)] px-5 py-3.5 flex items-center justify-end gap-2 bg-[var(--surface-canvas)]">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || success}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--accent-600)] disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Creando…" : "Crear producto"}
          </button>
        </div>
      </div>
    </div>
  );
}
