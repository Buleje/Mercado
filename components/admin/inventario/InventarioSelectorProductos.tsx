"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { Package, Search, Plus, X, PackagePlus } from "@buleje/design-system/icons";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Ventana «Agregar al catálogo». Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioSelectorProductos({ inv }: { inv: Inventario }) {
  const {
    products, setEditModalProduct, setEditForm, setShowAdd, showPicker, setShowPicker, pickerModalRef,
    ventanaPicker, pickerSearch, setPickerSearch, pickerCat, setPickerCat, formCategories,
  } = inv;
  return (
    <>
      {/* ── Product Picker Modal ── */}
      {showPicker && (() => {
        const q = pickerSearch.toLowerCase();
        const pickerProducts = products.filter(p => {
          if (!p.active) return false;
          if (pickerCat !== "todos" && p.category !== pickerCat) return false;
          if (q && !p.name.toLowerCase().includes(q) && !(p.barcode ?? "").toLowerCase().includes(q)) return false;
          return true;
        });
        return (
          <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-[2px] sm:p-4" onClick={(e) => e.target === e.currentTarget && !ventanaPicker.fijado && setShowPicker(false)}>
            <div ref={pickerModalRef} role="dialog" aria-modal="true" aria-label="Agregar al catálogo" tabIndex={-1} className="relative bg-[var(--surface-raised)] w-full sm:max-w-4xl sm:rounded-2xl rounded-t-2xl overflow-hidden max-h-[92dvh] flex flex-col border border-[var(--rule-base)] shadow-[var(--shadow-xl)]">
              <div {...ventanaPicker.asaProps} className="flex items-start gap-3 px-5 sm:px-6 py-5 border-b-2 border-[var(--rule-soft)] sticky top-0 bg-[var(--surface-raised)] z-10">
                <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  <PackagePlus className="h-6 w-6" strokeWidth={2.1} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Inventario</p>
                  <SectionTitle className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">Agregar al catálogo</SectionTitle>
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)] leading-snug">Toca un producto para editarlo, o crea uno nuevo.</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ControlesDeVentana ventana={ventanaPicker} />
                  <button
                    onClick={() => { setShowPicker(false); setShowAdd(true); }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 min-h-10 text-sm font-semibold text-white hover:bg-[var(--accent)]/90 transition-colors"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.4} /> <span className="hidden sm:inline">Crear nuevo</span><span className="sm:hidden">Nuevo</span>
                  </button>
                  <button onClick={() => setShowPicker(false)} aria-label="Cerrar" className="h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="px-5 py-3 border-b flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                  <input
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    placeholder="Buscar producto..."
                    className="w-full pl-10 pr-4 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
                <select
                  aria-label="Filtrar por categoría"
                  value={pickerCat}
                  onChange={e => setPickerCat(e.target.value)}
                  className="px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm outline-none"
                >
                  <option value="todos">Todos</option>
                  {formCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {pickerProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-10">
                    <span aria-hidden className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] mb-3">
                      <PackagePlus className="h-7 w-7" strokeWidth={1.9} />
                    </span>
                    <CardTitle className="text-sm font-bold text-[var(--text-primary)]">
                      {products.length === 0 ? "Tu catálogo está vacío" : "Sin resultados"}
                    </CardTitle>
                    <p className="mt-1 max-w-xs text-sm text-[var(--text-secondary)]">
                      {products.length === 0
                        ? "Todavía no cargaste productos. Crea el primero para empezar a vender."
                        : "No se encontraron productos con esos filtros."}
                    </p>
                    <button
                      onClick={() => { setShowPicker(false); setShowAdd(true); }}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 min-h-11 text-sm font-semibold text-white hover:bg-[var(--accent)]/90 transition-colors"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.4} /> Crear producto
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {pickerProducts.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setShowPicker(false);
                          setEditModalProduct(p);
                          setEditForm({ ...p });
                        }}
                        className="flex flex-col items-center gap-2 p-3 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:border-primary hover:shadow-[var(--shadow-sm)] transition-all text-center group"
                      >
                        <div className="w-16 h-16 rounded-lg bg-[var(--surface-sunken)] dark:bg-accent overflow-hidden flex-shrink-0">
                          {p.image ? (
                            <Image src={p.image} alt={p.name} width={64} height={64} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-6 w-6 text-[var(--text-tertiary)] dark:text-muted" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] line-clamp-2 group-hover:text-primary transition-colors">{p.name}</span>
                        <span className="text-sm text-[var(--text-secondary)] dark:text-muted">{fmt(p.price)}</span>
                        {p.stock != null && (
                          <span className={cn(
                            "text-xs font-bold px-2 py-0.5 rounded-full",
                            (p.stock ?? 0) === 0 ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]" : (p.stock ?? 0) <= (p.stockMin ?? 5) ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]" : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                          )}>
                            Stock: {p.stock}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <TiradorDeVentana ventana={ventanaPicker} />
            </div>
          </div>
        );
      })()}
    </>
  );
}
