"use client";

import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { Plus, X } from "@buleje/design-system/icons";
import type { DbProduct } from "@/lib/jsondb";
import { cn } from "@/lib/utils";
import { Field } from "@/components/admin/shared/Field";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Ventana «Agregar producto». Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcModalAgregarProducto({ oc }: { oc: OrdenesCompra }) {
  const {
    products, setProducts, setItems, setItemQueries, showAddItemModal, setShowAddItemModal,
    addItemModalRef, ventanaAddItem, addItemMode, setAddItemMode, addItemSearchRef, addItemSearch,
    setAddItemSearch, addItemSel, setAddItemSel, addItemQty, setAddItemQty, addItemCost,
    setAddItemCost, newProdForm, setNewProdForm, savingNewProd, setSavingNewProd,
  } = oc;
  return (
    <>
      {/* Add item modal */}
      {showAddItemModal && (
        <div
          role="presentation"
          className="fixed inset-0 z-modal flex items-end sm:items-center justify-center bg-black/50"
          onClick={(e) => e.target === e.currentTarget && !ventanaAddItem.fijado && setShowAddItemModal(false)}
        >
          <div ref={addItemModalRef} role="dialog" aria-modal="true" aria-label="Agregar producto" tabIndex={-1} className="relative bg-[var(--surface-raised)] w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl max-h-[85dvh] flex flex-col overflow-hidden">
            <div {...ventanaAddItem.asaProps} className="flex items-center justify-between px-5 py-4 border-b">
              <CardTitle className="font-display text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)] flex flex-wrap items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Agregar producto
              </CardTitle>
              <span className="ml-auto flex items-center gap-1">
                <ControlesDeVentana ventana={ventanaAddItem} />
                <button aria-label="Cerrar" onClick={() => setShowAddItemModal(false)} className="p-1.5 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors">
                  <X className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
                </button>
              </span>
            </div>
            {/* Tabs */}
            <div className="flex border-b px-5 shrink-0">
              <button
                onClick={() => setAddItemMode("search")}
                className={cn("py-2.5 px-3 text-sm font-semibold border-b-2 -mb-px transition-colors", addItemMode === "search" ? "border-primary text-primary" : "border-transparent text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)]")}
              >Buscar existente</button>
              <button
                onClick={() => setAddItemMode("new")}
                className={cn("py-2.5 px-3 text-sm font-semibold border-b-2 -mb-px transition-colors", addItemMode === "new" ? "border-primary text-primary" : "border-transparent text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)]")}
              >Nuevo producto</button>
            </div>

            <div className="overflow-y-auto flex-1 p-3 sm:p-5">
              {addItemMode === "search" ? (
                <div className="space-y-3">
                  <input
                    ref={addItemSearchRef}
                    value={addItemSearch}
                    onChange={(e) => { setAddItemSearch(e.target.value); setAddItemSel(null); }}
                    placeholder="Buscar por nombre o código de barras…"
                    className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                  />
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {(addItemSearch.length > 0
                      ? products.filter(p => p.name.toLowerCase().includes(addItemSearch.toLowerCase()) || (p.barcode ?? "").includes(addItemSearch))
                      : products
                    ).slice(0, 12).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setAddItemSel(p); setAddItemCost(p.costPrice ?? p.price); setAddItemQty(1); }}
                        className={cn(
                          "w-full text-left px-3 min-h-10 rounded-xl border text-sm transition-colors",
                          addItemSel?.id === p.id
                            ? "border-primary bg-primary/5"
                            : "border-[var(--rule-soft)] dark:border-[var(--rule-base)] hover:border-gray-300"
                        )}
                      >
                        <div className="font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">{p.name}</div>
                        <div className="text-xs text-[var(--text-tertiary)] dark:text-muted">{p.unit}{p.barcode ? ` · ${p.barcode}` : ""} · stock: {p.stock ?? 0}</div>
                      </button>
                    ))}
                    {products.length === 0 && <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-6">No hay productos</p>}
                  </div>
                  {addItemSel && (
                    <div className="bg-[var(--surface-alt)] rounded-xl p-4 space-y-3 border border-[var(--rule-base)] dark:border-[var(--rule-base)]">
                      <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{addItemSel.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Cantidad" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                          <input
                            type="number" min="1" step="1" value={addItemQty}
                            onChange={(e) => setAddItemQty(Number(e.target.value))}
                            className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                          />
                        </Field>
                        <Field label="Costo unitario (S/)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                          <input
                            type="number" min="0" step="0.01" value={addItemCost}
                            onChange={(e) => setAddItemCost(Number(e.target.value))}
                            className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary"
                          />
                        </Field>
                      </div>
                      <button
                        onClick={() => {
                          setItems(prev => [...prev, { productId: addItemSel!.id, name: addItemSel!.name, quantity: addItemQty, unitCost: addItemCost, unit: addItemSel!.unit }]);
                          setItemQueries(prev => [...prev, addItemSel!.name]);
                          setShowAddItemModal(false);
                        }}
                        className="w-full min-h-10 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors"
                      >
                        Agregar a la orden
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newProdForm.name) return;
                  setSavingNewProd(true);
                  const res = await fetch("/api/products", {
                    method: "POST",
                    headers: csrfHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ ...newProdForm, active: true }),
                  });
                  if (res.ok) {
                    const created: DbProduct = await res.json();
                    setProducts(prev => [...prev, created]);
                    setItems(prev => [...prev, { productId: created.id, name: created.name, quantity: newProdForm.stock, unitCost: created.costPrice ?? created.price, unit: created.unit }]);
                    setItemQueries(prev => [...prev, created.name]);
                    setShowAddItemModal(false);
                    setNewProdForm({ name: "", category: "abarrotes", price: 0, costPrice: 0, unit: "und", barcode: "", stock: 1 });
                  }
                  setSavingNewProd(false);
                }} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Nombre *" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1" className="sm:col-span-2">
                      <input
                        required value={newProdForm.name}
                        onChange={(e) => setNewProdForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Nombre del producto"
                        className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
                    <Field label="Categoría" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <select value={newProdForm.category} onChange={(e) => setNewProdForm(p => ({ ...p, category: e.target.value }))}
                        className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none">
                        <option value="abarrotes">Abarrotes</option>
                        <option value="bebidas">Bebidas</option>
                        <option value="lacteos">Lácteos</option>
                        <option value="carnes">Carnes</option>
                        <option value="verduras">Verduras</option>
                        <option value="limpieza">Limpieza</option>
                        <option value="higiene">Higiene</option>
                        <option value="otros">Otros</option>
                      </select>
                    </Field>
                    <Field label="Unidad" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <input value={newProdForm.unit} onChange={(e) => setNewProdForm(p => ({ ...p, unit: e.target.value }))}
                        placeholder="und, kg, L…"
                        className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
                    <Field label="Precio venta (S/)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <input type="number" min="0" step="0.01" value={newProdForm.price}
                        onChange={(e) => setNewProdForm(p => ({ ...p, price: Number(e.target.value) }))}
                        className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
                    <Field label="Costo compra (S/)" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <input type="number" min="0" step="0.01" value={newProdForm.costPrice}
                        onChange={(e) => setNewProdForm(p => ({ ...p, costPrice: Number(e.target.value) }))}
                        className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
                    <Field label="Cantidad inicial" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <input type="number" min="0" step="1" value={newProdForm.stock}
                        onChange={(e) => setNewProdForm(p => ({ ...p, stock: Number(e.target.value) }))}
                        className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
                    <Field label="Código de barras" labelClassName="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted block mb-1">
                      <input value={newProdForm.barcode} onChange={(e) => setNewProdForm(p => ({ ...p, barcode: e.target.value }))}
                        placeholder="Opcional"
                        className="w-full px-3 h-10 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                      />
                    </Field>
                  </div>
                  <button
                    type="submit" disabled={savingNewProd || !newProdForm.name}
                    className="w-full min-h-10 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-60"
                  >
                    {savingNewProd ? "Creando…" : "Crear producto y agregar a orden"}
                  </button>
                </form>
              )}
            </div>
            <TiradorDeVentana ventana={ventanaAddItem} />
          </div>
        </div>
      )}
    </>
  );
}
