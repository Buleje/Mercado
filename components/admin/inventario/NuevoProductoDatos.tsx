"use client";

import { Search, Loader2, ScanBarcode } from "@buleje/design-system/icons";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { StockLevelBar } from "@/components/admin/inventario/StockLevelBar";
import { StockTrackToggle } from "@/components/admin/inventario/StockTrackToggle";
import { CategorySuggestionInline } from "@/components/admin/inventario/CategorySuggestionInline";
import { Field } from "@/components/admin/shared/Field";
import { FIELD_INPUT, FIELD_LABEL } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Nuevo producto: tipo, base nacional y datos. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function NuevoProductoDatos({ inv }: { inv: Inventario }) {
  const {
    addForm, setAddForm, setShowScanner, dbQuery, setDbQuery, dbResults, dbSearching, handleDbSearch,
    applyDbResult, formCategories, catLabelOf,
  } = inv;
  return (
    <>
      {/* Tipo: producto físico vs servicio */}
      <div className="flex gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-1">
        {([
          ["product", "Producto", "Con stock, código de barras y vencimiento"],
          ["service", "Servicio", "Sin stock — duración, notas y precio por unidad/hora"],
        ] as const).map(([val, label, hint]) => (
          <button
            key={val}
            type="button"
            onClick={() => setAddForm(f => ({ ...f, type: val }))}
            title={hint}
            className={cn(
              "flex-1 rounded-xl px-3 min-h-11 text-sm font-semibold transition-colors",
              addForm.type === val
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* National product DB search — solo productos físicos */}
      {addForm.type !== "service" && (
      <div className="bg-primary/10 border border-[var(--data-success-500)]/30 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-[var(--data-success-500)] flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5" /> Buscar en base nacional de productos
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={dbQuery}
            onChange={(e) => setDbQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleDbSearch())}
            placeholder="Ej: arroz costeño, aceite vegetal…"
            className="flex-1 px-3 h-10 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-[var(--data-success-500)]/30 outline-none text-sm"
          />
          <button
            type="button"
            onClick={handleDbSearch}
            disabled={dbSearching || !dbQuery.trim()}
            className="px-3 min-h-10 rounded-xl bg-primary/10 text-white hover:bg-primary/10 transition-colors disabled:opacity-50 flex items-center gap-1 text-sm font-semibold"
          >
            {dbSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </button>
        </div>
        {dbResults.length > 0 && (
          <div className="space-y-1 max-h-52 overflow-y-auto rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--surface-raised)]">
            {dbResults.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyDbResult(r)}
                className="w-full text-left px-3 py-2.5 hover:bg-primary/10 flex flex-wrap items-center gap-3 transition-colors border-b border-gray-50 last:border-0"
              >
                {r.image && (
                  <Image src={r.image} alt={r.name} width={40} height={40} className="rounded-lg object-cover border border-[var(--rule-soft)] dark:border-[var(--rule-base)] shrink-0 bg-[var(--surface-alt)] " />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{r.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">{r.brand}{r.quantity ? ` · ${r.quantity}` : ""}{r.barcode ? ` · ${r.barcode}` : ""}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
        <Field label="Nombre *" labelClassName={FIELD_LABEL}>
          <input required value={addForm.name} onChange={(e) => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Arroz costeño 1kg" className={FIELD_INPUT} />
        </Field>
        <Field label="Categoría *" labelClassName={FIELD_LABEL}>
          {(id) => (<>
            <select id={id} value={addForm.category} onChange={(e) => setAddForm(f => ({ ...f, category: e.target.value }))} className={FIELD_INPUT}>
              {formCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              {/* Categoría aplicada desde la sugerencia que aún no está
                  en la lista del comercio → mostrarla igual para no perderla. */}
              {addForm.category && !formCategories.some(c => c.id === addForm.category) && (
                <option value={addForm.category}>{catLabelOf(addForm.category)}</option>
              )}
            </select>
            {/* Sugerencia automática: si el nombre del producto contiene
                una palabra clave que mapea a otra categoría distinta a
                la elegida, mostramos un chip con botón "Aplicar". */}
            <CategorySuggestionInline
              name={addForm.name}
              currentCategory={addForm.category}
              onApply={(id) => setAddForm(f => ({ ...f, category: id }))}
            />
          </>)}
        </Field>
        <Field label="Precio de venta (S/) *" labelClassName={FIELD_LABEL}>
          <input required type="number" step="0.01" min="0" value={addForm.price} onChange={(e) => setAddForm(f => ({ ...f, price: e.target.value }))} placeholder="5.50" className={FIELD_INPUT} />
        </Field>
        <Field label="Precio de costo (S/)" labelClassName={FIELD_LABEL}>
          <input type="number" step="0.01" min="0" value={addForm.costPrice} onChange={(e) => setAddForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="3.50" className={FIELD_INPUT} />
        </Field>
        <Field label="Unidad" labelClassName={FIELD_LABEL}>
          <input value={addForm.unit} onChange={(e) => setAddForm(f => ({ ...f, unit: e.target.value }))} placeholder="kg, und, bolsa…" className={FIELD_INPUT} />
        </Field>
        <Field label="Badge" labelClassName={FIELD_LABEL}>
          <select value={addForm.badge} onChange={(e) => setAddForm(f => ({ ...f, badge: e.target.value }))} className={FIELD_INPUT}>
            <option value="">Sin badge</option>
            {["Oferta", "Popular", "Fresco", "Premium"].map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        {/* Stock / vencimiento / código de barras — solo productos físicos */}
        {addForm.type !== "service" && (<>
        <div className="sm:col-span-2 mt-1 flex items-center gap-2">
          <span className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Inventario y control</span>
          <span aria-hidden className="h-px flex-1 bg-[var(--rule-soft)]" />
        </div>
        {/* Toggle: controlar stock vs ilimitado (Brandon 2026-06-06) —
            para comidas que se preparan al pedido (no se sabe cuándo
            "sale") o productos de stock infinito. */}
        <div className="sm:col-span-2">
          <StockTrackToggle
            value={addForm.trackStock}
            onChange={(v) => setAddForm(f => ({ ...f, trackStock: v }))}
          />
        </div>
        {addForm.trackStock && (<>
        <Field label="Stock actual" labelClassName={FIELD_LABEL}>
          <input type="number" min="0" value={addForm.stock} onChange={(e) => setAddForm(f => ({ ...f, stock: e.target.value }))} placeholder="0" className={FIELD_INPUT} />
        </Field>
        <Field label={<span title="Cantidad mínima antes de generar alerta de stock bajo">Stock mínimo</span>} labelClassName={FIELD_LABEL}>
          <input type="number" min="0" value={addForm.stockMin} onChange={(e) => setAddForm(f => ({ ...f, stockMin: e.target.value }))} placeholder="5" className={FIELD_INPUT} />
        </Field>
        <Field label="Stock máximo" labelClassName={FIELD_LABEL}>
          <input type="number" min="0" value={addForm.stockMax} onChange={(e) => setAddForm(f => ({ ...f, stockMax: e.target.value }))} placeholder="100" className={FIELD_INPUT} />
        </Field>
        {/* Preview en vivo del nivel de stock (Brandon 2026-06-06) */}
        {addForm.stock !== "" && (
          <div className="sm:col-span-2">
            <StockLevelBar
              variant="full"
              stock={Number(addForm.stock) || 0}
              stockMin={addForm.stockMin !== "" ? Number(addForm.stockMin) : undefined}
              stockMax={addForm.stockMax !== "" ? Number(addForm.stockMax) : undefined}
              unit={addForm.unit}
            />
          </div>
        )}
        </>)}
        <Field label="Fecha de vencimiento" labelClassName={FIELD_LABEL}>
          <input type="date" value={addForm.expiryDate} onChange={(e) => setAddForm(f => ({ ...f, expiryDate: e.target.value }))} className={FIELD_INPUT} />
        </Field>
        <Field label="Código de barras" labelClassName={FIELD_LABEL}>
          {(id) => (
            <div className="flex flex-wrap gap-2">
              <input id={id} value={addForm.barcode} onChange={(e) => setAddForm(f => ({ ...f, barcode: e.target.value }))} placeholder="7750000000000" className={cn(FIELD_INPUT, "flex-1 font-mono")} />
              <button aria-label="Escanear código de barras" type="button" onClick={() => setShowScanner(true)} className="px-3 py-2 rounded-xl border border-primary/30 text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-colors">
                <ScanBarcode className="h-4 w-4" />
              </button>
            </div>
          )}
        </Field>
        {/* Producto completo */}
        <div className="sm:col-span-2 mt-1 flex items-center gap-2">
          <span className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Detalles del producto</span>
          <span aria-hidden className="h-px flex-1 bg-[var(--rule-soft)]" />
        </div>
        <Field label="Marca / fabricante" labelClassName={FIELD_LABEL}>
          <input value={addForm.brand} onChange={(e) => setAddForm(f => ({ ...f, brand: e.target.value }))} placeholder="Ej: Costeño, Gloria" className={FIELD_INPUT} />
        </Field>
        <Field label={<span title="Código interno del negocio, distinto del código de barras">SKU / código interno</span>} labelClassName={FIELD_LABEL}>
          <input value={addForm.sku} onChange={(e) => setAddForm(f => ({ ...f, sku: e.target.value }))} placeholder="Ej: ABR-001" className={cn(FIELD_INPUT, "font-mono")} />
        </Field>
        <Field label="Peso (kg)" labelClassName={FIELD_LABEL}>
          <input type="number" step="0.001" min="0" value={addForm.weightKg} onChange={(e) => setAddForm(f => ({ ...f, weightKg: e.target.value }))} placeholder="0.5" className={FIELD_INPUT} />
        </Field>
        <Field label="Medidas" labelClassName={FIELD_LABEL}>
          <input value={addForm.dimensions} onChange={(e) => setAddForm(f => ({ ...f, dimensions: e.target.value }))} placeholder="30x20x10 cm o 2 m³" className={FIELD_INPUT} />
        </Field>
        </>)}

        {/* Servicio — campos propios */}
        {addForm.type === "service" && (<>
        <div className="sm:col-span-2 mt-1 flex items-center gap-2">
          <span className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">Detalles del servicio</span>
          <span aria-hidden className="h-px flex-1 bg-[var(--rule-soft)]" />
        </div>
        <Field label="Duración estimada" labelClassName={FIELD_LABEL}>
          <input value={addForm.durationLabel} onChange={(e) => setAddForm(f => ({ ...f, durationLabel: e.target.value }))} placeholder="Ej: 2 horas, 1 día, 3 días" className={FIELD_INPUT} />
        </Field>
        <Field label="Cobro por" labelClassName={FIELD_LABEL}>
          <select value={addForm.pricingUnit} onChange={(e) => setAddForm(f => ({ ...f, pricingUnit: e.target.value }))} className={FIELD_INPUT}>
            <option value="fijo">Precio fijo</option>
            <option value="hora">Por hora</option>
            <option value="m3">Por m³</option>
            <option value="unidad">Por unidad</option>
            <option value="dia">Por día</option>
          </select>
        </Field>
        </>)}

        {/* Afecto a IGV — productos y servicios */}
        <Field label={<span title="Determina el IGV en la boleta/factura">Afecto a IGV</span>} labelClassName={FIELD_LABEL}>
          <select value={addForm.taxType} onChange={(e) => setAddForm(f => ({ ...f, taxType: e.target.value }))} className={FIELD_INPUT}>
            <option value="gravado">Gravado (IGV 18%)</option>
            <option value="exonerado">Exonerado</option>
            <option value="inafecto">Inafecto</option>
          </select>
        </Field>

        {/* Descripción — ambos */}
        <Field label="Descripción" labelClassName={FIELD_LABEL} className="sm:col-span-2">
          <textarea value={addForm.description} onChange={(e) => setAddForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder={addForm.type === "service" ? "Qué incluye el servicio…" : "Detalle del producto…"} className={cn(FIELD_INPUT, "resize-none")} />
        </Field>

        {/* Notas / requisitos — solo servicios */}
        {addForm.type === "service" && (
        <Field label="Notas / requisitos para el cliente" labelClassName={FIELD_LABEL} className="sm:col-span-2">
          <textarea value={addForm.notes} onChange={(e) => setAddForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Ej: el cliente debe traer la madera; trabajamos de lunes a sábado…" className={cn(FIELD_INPUT, "resize-none")} />
        </Field>
        )}
      </div>
    </>
  );
}
