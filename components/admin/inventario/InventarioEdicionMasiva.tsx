"use client";

import { CardTitle } from "@buleje/design-system";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { X } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { categories } from "@/data/products";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Ventana de edición masiva. Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioEdicionMasiva({ inv }: { inv: Inventario }) {
  const {
    selectedIds, bulkModal, setBulkModal, bulkModalRef, ventanaBulk, bulkField, setBulkField,
    bulkValue, setBulkValue, bulkSaving, executeBulk,
  } = inv;
  return (
    <>
      {/* Bulk edit modal */}
      {bulkModal && (
        <div className="modal-backdrop flex items-center justify-center p-4">
          <div ref={bulkModalRef} role="dialog" aria-modal="true" aria-label="Edición masiva" tabIndex={-1} className="relative bg-[var(--surface-raised)] rounded-xl max-w-sm w-full overflow-hidden">
            <div {...ventanaBulk.asaProps} className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
              <CardTitle className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Edición masiva — {selectedIds.size} producto{selectedIds.size > 1 ? "s" : ""}</CardTitle>
              <span className="ml-auto flex items-center gap-1">
                <ControlesDeVentana ventana={ventanaBulk} />
                <button aria-label="Cerrar" onClick={() => setBulkModal(false)} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"><X className="h-5 w-5" /></button>
              </span>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-4">
              <Field label="Campo a modificar" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                <select value={bulkField} onChange={e => { const v = e.target.value as typeof bulkField; setBulkField(v); setBulkValue(v === "active" ? "true" : ""); }}
                  className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-10 text-sm">
                  <optgroup label="General">
                    <option value="active">Estado (activo / inactivo)</option>
                    <option value="category">Categoría</option>
                    <option value="badge">Etiqueta</option>
                  </optgroup>
                  <optgroup label="Precio">
                    <option value="price">Fijar precio (S/)</option>
                    <option value="priceDelta">Ajustar precio (± S/)</option>
                    <option value="pricePercent">Ajustar precio (± %)</option>
                  </optgroup>
                  <optgroup label="Stock">
                    <option value="stock">Fijar stock</option>
                    <option value="stockMin">Stock mínimo (alerta)</option>
                    <option value="stockMax">Stock máximo</option>
                  </optgroup>
                </select>
              </Field>
              <Field label="Nuevo valor" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted">
                {(bulkValId) => (<>
                {bulkField === "active" ? (
                  <select id={bulkValId} value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-10 text-sm">
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                ) : bulkField === "category" ? (
                  <select id={bulkValId} value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-10 text-sm">
                    <option value="">Seleccionar…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                ) : bulkField === "badge" ? (
                  <div className="mt-1 space-y-2">
                    <input id={bulkValId} type="text" maxLength={50} value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: Oferta, Nuevo, Combo…"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-10 text-sm" />
                    <div className="flex flex-wrap gap-1.5">
                      {["Nuevo", "Oferta", "Combo", "Recomendado", "Más vendido"].map(b => (
                        <button key={b} type="button" onClick={() => setBulkValue(b)}
                          className="rounded-full border border-[var(--rule-base)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
                          {b}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">Deja el campo vacío y aplica para <strong>quitar</strong> la etiqueta.</p>
                  </div>
                ) : bulkField === "price" ? (
                  <div className="mt-1">
                    <input id={bulkValId} type="number" min="0.01" step="0.01" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 12.50"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-10 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Fija el mismo precio en {selectedIds.size} producto{selectedIds.size > 1 ? "s" : ""}.</p>
                  </div>
                ) : bulkField === "priceDelta" ? (
                  <div className="mt-1">
                    <input id={bulkValId} type="number" step="0.01" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 1.50 sube · -2 baja"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-10 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Suma o resta soles al precio actual de cada producto.</p>
                  </div>
                ) : bulkField === "pricePercent" ? (
                  <div className="mt-1">
                    <input id={bulkValId} type="number" step="1" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 10 = +10% · -5 = -5%"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-10 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      Ajusta el precio {bulkValue ? `un ${bulkValue}%` : "un …%"} en {selectedIds.size} producto{selectedIds.size > 1 ? "s" : ""}.
                    </p>
                  </div>
                ) : bulkField === "stockMin" ? (
                  <div className="mt-1">
                    <input id={bulkValId} type="number" min="0" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 5"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-10 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Umbral para la alerta de “stock bajo”.</p>
                  </div>
                ) : bulkField === "stockMax" ? (
                  <div className="mt-1">
                    <input id={bulkValId} type="number" min="0" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Ej: 100"
                      className="w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-10 text-sm" />
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Capacidad máxima sugerida (para reposición).</p>
                  </div>
                ) : (
                  <input id={bulkValId} type="number" min="0" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Cantidad"
                    className="mt-1 w-full rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 h-10 text-sm" />
                )}
                </>)}
              </Field>
            </div>
            <div className="px-3 sm:px-6 py-4 bg-[var(--surface-alt)] border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap gap-3">
              <button onClick={() => setBulkModal(false)} className="flex-1 min-h-11 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] transition-colors">Cancelar</button>
              <button onClick={executeBulk} disabled={bulkSaving || (!bulkValue && bulkField !== "active" && bulkField !== "badge")}
                className="flex-1 min-h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-60">
                {bulkSaving ? "Aplicando…" : "Aplicar"}
              </button>
            </div>
            <TiradorDeVentana ventana={ventanaBulk} />
          </div>
        </div>
      )}
    </>
  );
}
