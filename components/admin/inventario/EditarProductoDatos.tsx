"use client";

import { AlertTriangle, Loader2, Sparkles } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { StockLevelBar } from "@/components/admin/inventario/StockLevelBar";
import { StockTrackToggle } from "@/components/admin/inventario/StockTrackToggle";
import { CategorySuggestionInline } from "@/components/admin/inventario/CategorySuggestionInline";
import { Field } from "@/components/admin/shared/Field";
import { FIELD_INPUT, FIELD_LABEL } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Editar producto: datos principales. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function EditarProductoDatos({ inv }: { inv: Inventario }) {
  const {
    editForm, setEditForm, aiDescGenerating, aiDescError, generateDescriptionAI, formCategories,
    catLabelOf,
  } = inv;
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
        <Field label="Nombre *" labelClassName={FIELD_LABEL}>
          <input required value={editForm.name ?? ""} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className={FIELD_INPUT} />
        </Field>
        <Field label="Categoría" labelClassName={FIELD_LABEL}>
          {(id) => (<>
            <select id={id} value={editForm.category ?? ""} onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))} className={FIELD_INPUT}>
              {formCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              {editForm.category && !formCategories.some(c => c.id === editForm.category) && (
                <option value={editForm.category}>{catLabelOf(editForm.category)}</option>
              )}
            </select>
            {/* Sugerencia heurística para edición — mismo flujo que en
                el form de creación. */}
            <CategorySuggestionInline
              name={editForm.name ?? ""}
              currentCategory={editForm.category ?? ""}
              onApply={(id) => setEditForm(f => ({ ...f, category: id }))}
            />
          </>)}
        </Field>
        <Field label="Precio de venta (S/)" labelClassName={FIELD_LABEL}>
          <input type="number" step="0.01" min="0" value={editForm.price ?? ""} onChange={(e) => setEditForm(f => ({ ...f, price: Number(e.target.value) }))} className={FIELD_INPUT} />
        </Field>
        <Field label="Precio de costo (S/)" labelClassName={FIELD_LABEL}>
          <input type="number" step="0.01" min="0" value={editForm.costPrice ?? ""} onChange={(e) => setEditForm(f => ({ ...f, costPrice: Number(e.target.value) || undefined }))} className={FIELD_INPUT} />
        </Field>
        <Field label="Unidad" labelClassName={FIELD_LABEL}>
          <input value={editForm.unit ?? ""} onChange={(e) => setEditForm(f => ({ ...f, unit: e.target.value }))} className={FIELD_INPUT} />
        </Field>
        <Field label="Badge" labelClassName={FIELD_LABEL}>
          <select value={editForm.badge ?? ""} onChange={(e) => setEditForm(f => ({ ...f, badge: e.target.value || undefined }))} className={FIELD_INPUT}>
            <option value="">Sin badge</option>
            {["Oferta", "Popular", "Fresco", "Premium"].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        {editForm.type !== "service" && (<>
        {/* Toggle controlar stock vs ilimitado (Brandon 2026-06-06) */}
        <div className="sm:col-span-2">
          <StockTrackToggle
            value={(editForm as { trackStock?: boolean }).trackStock !== false}
            onChange={(v) => setEditForm(f => ({ ...f, trackStock: v }))}
          />
        </div>
        {(editForm as { trackStock?: boolean }).trackStock !== false && (<>
        <Field label="Stock actual" labelClassName={FIELD_LABEL}>
          <input type="number" min="0" value={editForm.stock ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stock: e.target.value !== "" ? Number(e.target.value) : undefined }))} className={FIELD_INPUT} />
        </Field>
        <Field label={<span title="Cantidad mínima antes de generar alerta de stock bajo">Stock mínimo</span>} labelClassName={FIELD_LABEL}>
          <input type="number" min="0" value={editForm.stockMin ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stockMin: e.target.value !== "" ? Number(e.target.value) : undefined }))} className={FIELD_INPUT} />
        </Field>
        <Field label="Stock máximo" labelClassName={FIELD_LABEL}>
          <input type="number" min="0" value={editForm.stockMax ?? ""} onChange={(e) => setEditForm(f => ({ ...f, stockMax: e.target.value !== "" ? Number(e.target.value) : undefined }))} className={FIELD_INPUT} />
        </Field>
        {/* Preview en vivo del nivel de stock (Brandon 2026-06-06) */}
        {editForm.stock !== undefined && editForm.stock !== null && (
          <div className="sm:col-span-2">
            <StockLevelBar
              variant="full"
              stock={editForm.stock}
              stockMin={editForm.stockMin}
              stockMax={editForm.stockMax}
              unit={editForm.unit}
            />
          </div>
        )}
        </>)}
        <Field label="Fecha de vencimiento" labelClassName={FIELD_LABEL}>
          <input type="date" value={editForm.expiryDate ?? ""} onChange={(e) => setEditForm(f => ({ ...f, expiryDate: e.target.value || undefined }))} className={FIELD_INPUT} />
        </Field>
        <Field label="Código de barras" labelClassName={FIELD_LABEL}>
          <input value={editForm.barcode ?? ""} onChange={(e) => setEditForm(f => ({ ...f, barcode: e.target.value || undefined }))} className={cn(FIELD_INPUT, "font-mono")} />
        </Field>
        <Field label="Marca / fabricante" labelClassName={FIELD_LABEL}>
          <input value={editForm.brand ?? ""} onChange={(e) => setEditForm(f => ({ ...f, brand: e.target.value }))} placeholder="Ej: Costeño, Gloria" className={FIELD_INPUT} />
        </Field>
        <Field label="SKU / código interno" labelClassName={FIELD_LABEL}>
          <input value={editForm.sku ?? ""} onChange={(e) => setEditForm(f => ({ ...f, sku: e.target.value }))} placeholder="Ej: ABR-001" className={cn(FIELD_INPUT, "font-mono")} />
        </Field>
        <Field label="Peso (kg)" labelClassName={FIELD_LABEL}>
          <input type="number" step="0.001" min="0" value={editForm.weightKg ?? ""} onChange={(e) => setEditForm(f => ({ ...f, weightKg: e.target.value !== "" ? Number(e.target.value) : undefined }))} placeholder="0.5" className={FIELD_INPUT} />
        </Field>
        <Field label="Medidas" labelClassName={FIELD_LABEL}>
          <input value={editForm.dimensions ?? ""} onChange={(e) => setEditForm(f => ({ ...f, dimensions: e.target.value }))} placeholder="30x20x10 cm o 2 m³" className={FIELD_INPUT} />
        </Field>
        </>)}
        {editForm.type === "service" && (<>
        <Field label="Duración estimada" labelClassName={FIELD_LABEL}>
          <input value={editForm.durationLabel ?? ""} onChange={(e) => setEditForm(f => ({ ...f, durationLabel: e.target.value }))} placeholder="Ej: 2 horas, 1 día" className={FIELD_INPUT} />
        </Field>
        <Field label="Cobro por" labelClassName={FIELD_LABEL}>
          <select value={editForm.pricingUnit ?? "fijo"} onChange={(e) => setEditForm(f => ({ ...f, pricingUnit: e.target.value }))} className={FIELD_INPUT}>
            <option value="fijo">Precio fijo</option>
            <option value="hora">Por hora</option>
            <option value="m3">Por m³</option>
            <option value="unidad">Por unidad</option>
            <option value="dia">Por día</option>
          </select>
        </Field>
        <Field label="Notas / requisitos para el cliente" labelClassName={FIELD_LABEL} className="sm:col-span-2">
          <textarea value={editForm.notes ?? ""} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={cn(FIELD_INPUT, "resize-none")} />
        </Field>
        </>)}
        <Field label="Afecto a IGV" labelClassName={FIELD_LABEL}>
          <select value={editForm.taxType ?? "gravado"} onChange={(e) => setEditForm(f => ({ ...f, taxType: e.target.value }))} className={FIELD_INPUT}>
            <option value="gravado">Gravado (IGV 18%)</option>
            <option value="exonerado">Exonerado</option>
            <option value="inafecto">Inafecto</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <span className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">Descripción del producto</span>
            <button
              type="button"
              onClick={() => generateDescriptionAI(editForm, setEditForm)}
              disabled={aiDescGenerating || !editForm.name}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-linear-to-r from-primary to-[var(--data-success-500)] text-white text-[length:var(--ts-2xs)] font-bold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title={!editForm.name ? "Primero ingresa el nombre del producto" : "Generar descripción con IA"}
            >
              {aiDescGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {aiDescGenerating ? "Generando…" : "Generar con IA"}
            </button>
          </div>
          <textarea
            rows={3}
            value={editForm.description ?? ""}
            onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value || undefined }))}
            placeholder="Ej: Aceite de girasol puro, ideal para frituras ligeras. Botella de 1 litro."
            className={cn(FIELD_INPUT, "resize-none")}
          />
          {aiDescError && (
            <p className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {aiDescError}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
