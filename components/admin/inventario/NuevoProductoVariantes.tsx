"use client";

import { Plus, X, Layers, Sliders } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { FIELD_INPUT } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Nuevo producto: presentaciones y adicionales. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function NuevoProductoVariantes({ inv }: { inv: Inventario }) {
  const {
    addForm, addVariants, setAddVariants, addModifierGroups, setAddModifierGroups,
  } = inv;
  return (
    <>
      {/* Fase 2: Presentaciones / variantes (ProductVariant[]) — solo productos físicos */}
      {addForm.type !== "service" && (
      <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[var(--text-secondary)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Presentaciones / variantes</p>
          </div>
          <button
            type="button"
            onClick={() => setAddVariants(v => [...v, { name: "", price: "", stock: "" }])}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar
          </button>
        </div>
        {addVariants.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">Ej: 1/2 Litro, 1 Litro, Pack x6 — cada presentación con su precio y stock propios.</p>
        ) : (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_96px_80px_36px] gap-2 px-1 text-[length:var(--ts-2xs,0.6875rem)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              <span>Nombre</span><span>Precio (S/)</span><span>Stock</span><span aria-hidden />
            </div>
            {addVariants.map((v, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_80px_36px] gap-2 items-center">
                <input
                  value={v.name}
                  onChange={(e) => setAddVariants(arr => arr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  placeholder="Ej: 1 Litro"
                  className={FIELD_INPUT}
                />
                <input
                  type="number" step="0.01" min="0"
                  value={v.price}
                  onChange={(e) => setAddVariants(arr => arr.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                  placeholder={addForm.price || "0.00"}
                  className={FIELD_INPUT}
                />
                <input
                  type="number" min="0"
                  value={v.stock}
                  onChange={(e) => setAddVariants(arr => arr.map((x, j) => j === i ? { ...x, stock: e.target.value } : x))}
                  placeholder="—"
                  className={FIELD_INPUT}
                />
                <button
                  type="button"
                  onClick={() => setAddVariants(arr => arr.filter((_, j) => j !== i))}
                  title="Quitar presentación"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <p className="text-xs text-[var(--text-tertiary)]">Precio vacío = usa el precio base. El stock por presentación es opcional.</p>
          </div>
        )}
      </div>
      )}

      {/* Fase 2: Modificadores / opciones (ProductModifierGroup[]) */}
      <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-[var(--text-secondary)]" />
            <p className="text-sm font-bold text-[var(--text-primary)]">Modificadores / opciones</p>
          </div>
          <button
            type="button"
            onClick={() => setAddModifierGroups(g => [...g, { name: "", required: false, multi: true, options: [{ name: "", priceDelta: "" }] }])}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar grupo
          </button>
        </div>
        {addModifierGroups.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">Ej: &ldquo;Cremas&rdquo; → Ají, Mayonesa (+S/0.50) · &ldquo;Término&rdquo; → Jugoso, Bien cocido. El cliente las elige al pedir.</p>
        ) : (
          <div className="space-y-3">
            {addModifierGroups.map((g, gi) => (
              <div key={gi} className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={g.name}
                    onChange={(e) => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, name: e.target.value } : x))}
                    placeholder="Nombre del grupo (ej: Cremas)"
                    className={cn(FIELD_INPUT, "flex-1")}
                  />
                  <button type="button" onClick={() => setAddModifierGroups(arr => arr.filter((_, j) => j !== gi))} title="Quitar grupo" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] transition-colors"><X className="h-4 w-4" /></button>
                </div>
                <div className="flex flex-wrap gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)]">
                    <input type="checkbox" checked={g.required} onChange={(e) => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, required: e.target.checked } : x))} className="accent-[var(--accent)]" /> Obligatorio
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)]">
                    <input type="checkbox" checked={g.multi} onChange={(e) => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, multi: e.target.checked } : x))} className="accent-[var(--accent)]" /> Permite varias
                  </label>
                </div>
                <div className="space-y-1.5 pl-1">
                  {g.options.map((o, oi) => (
                    <div key={oi} className="grid grid-cols-[minmax(0,1fr)_88px_32px] gap-2 items-center">
                      <input
                        value={o.name}
                        onChange={(e) => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, options: x.options.map((y, k) => k === oi ? { ...y, name: e.target.value } : y) } : x))}
                        placeholder="Opción (ej: Ají)"
                        className={FIELD_INPUT}
                      />
                      <input
                        type="number" step="0.01" min="0"
                        value={o.priceDelta}
                        onChange={(e) => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, options: x.options.map((y, k) => k === oi ? { ...y, priceDelta: e.target.value } : y) } : x))}
                        placeholder="+0.00"
                        className={FIELD_INPUT}
                      />
                      <button type="button" onClick={() => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, options: x.options.filter((_, k) => k !== oi) } : x))} title="Quitar opción" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setAddModifierGroups(arr => arr.map((x, j) => j === gi ? { ...x, options: [...x.options, { name: "", priceDelta: "" }] } : x))} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="h-3 w-3" /> Agregar opción</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
