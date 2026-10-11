"use client";

import { CardTitle } from "@buleje/design-system";
import { Package, Search, Plus, PackagePlus } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { claveCategoria, fmt } from "@/components/admin/inventario/inventario-compartido";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/** Ventana «Agregar al catálogo». Pieza de InventoryTab: recibe `useInventario` entero. */
export default function InventarioSelectorProductos({ inv }: { inv: Inventario }) {
  const {
    products,
    setEditModalProduct,
    setEditForm,
    setShowAdd,
    showPicker,
    setShowPicker,
    pickerSearch,
    setPickerSearch,
    pickerCat,
    setPickerCat,
    formCategories,
  } = inv;
  return (
    <>
      {/* ── Product Picker Modal ── */}
      {showPicker &&
        (() => {
          const q = pickerSearch.toLowerCase();
          const pickerProducts = products.filter((p) => {
            if (!p.active) return false;
            if (pickerCat !== "todos" && claveCategoria(p.category) !== claveCategoria(pickerCat))
              return false;
            if (
              q &&
              !p.name.toLowerCase().includes(q) &&
              !(p.barcode ?? "").toLowerCase().includes(q)
            )
              return false;
            return true;
          });
          return (
            <AdminModal
              open
              onClose={() => setShowPicker(false)}
              title="Agregar al catálogo"
              description="Toca un producto para editarlo, o crea uno nuevo."
              icon={PackagePlus}
              size="xl"
              claveVentana="inventario-agregar-catalogo"
              footer={
                <ModalFooter>
                  <button
                    type="button"
                    onClick={() => setShowPicker(false)}
                    className={button({ variant: "secondary" })}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPicker(false);
                      setShowAdd(true);
                    }}
                    className={button({ variant: "primary", className: "gap-1.5" })}
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.4} /> Crear nuevo
                  </button>
                </ModalFooter>
              }
            >
              <div className="px-5 py-3 border-b flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                  <input
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Buscar producto..."
                    className="w-full pl-10 pr-4 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
                <select
                  aria-label="Filtrar por categoría"
                  value={pickerCat}
                  onChange={(e) => setPickerCat(e.target.value)}
                  className="px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm outline-none"
                >
                  <option value="todos">Todos</option>
                  {formCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {pickerProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-10">
                    <span
                      aria-hidden
                      className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] mb-3"
                    >
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
                      onClick={() => {
                        setShowPicker(false);
                        setShowAdd(true);
                      }}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 min-h-11 text-sm font-semibold text-white hover:bg-[var(--accent)]/90 transition-colors"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.4} /> Crear producto
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {pickerProducts.map((p) => (
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
                            <Image
                              src={p.image}
                              alt={p.name}
                              width={64}
                              height={64}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-6 w-6 text-[var(--text-tertiary)] dark:text-muted" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] line-clamp-2 group-hover:text-primary transition-colors">
                          {p.name}
                        </span>
                        <span className="text-sm text-[var(--text-secondary)] dark:text-muted">
                          {fmt(p.price)}
                        </span>
                        {p.stock != null && (
                          <span
                            className={cn(
                              "text-xs font-bold px-2 py-0.5 rounded-full",
                              (p.stock ?? 0) === 0
                                ? "bg-[var(--data-error-100)] text-[var(--data-error-500)]"
                                : (p.stock ?? 0) <= (p.stockMin ?? 5)
                                  ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]"
                                  : "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
                            )}
                          >
                            Stock: {p.stock}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </AdminModal>
          );
        })()}
    </>
  );
}
