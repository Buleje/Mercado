"use client";

import { Kicker } from "@buleje/design-system";
import { Trash2, Plus, Package, ScanBarcode } from "@buleje/design-system/icons";
import { formatCurrency } from "@/lib/format";
import { Field } from "@/components/admin/shared/Field";
import type { OrdenesCompra } from "@/components/admin/ordenes-compra/hooks/use-ordenes-compra";

/** Nueva orden: productos. Pieza de PurchaseOrdersTab: recibe `useOrdenesCompra` entero. */
export default function OcNuevaOrdenProductos({ oc }: { oc: OrdenesCompra }) {
  const {
    products, items, itemQueries, setItemQueries, openSearchIdx, setOpenSearchIdx, setShowScanner,
    setShowAddItemModal, setAddItemMode, setAddItemSearch, setAddItemSel, updateItem, removeItem,
    changeProduct,
  } = oc;
  return (
    <>
      {/* ── Sección: Productos ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Kicker as="h3" className="libro-kicker inline-flex items-center gap-2">
            <Package className="h-4 w-4 text-[var(--text-tertiary)]" />
            Productos de la orden
            {items.length > 0 && (
              <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-extrabold tabular-nums">
                {items.length}
              </span>
            )}
          </Kicker>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary transition-colors"
            >
              <ScanBarcode className="h-4 w-4" />
              Escanear
            </button>
            <button
              type="button"
              onClick={() => { setAddItemMode("search"); setAddItemSearch(""); setAddItemSel(null); setShowAddItemModal(true); }}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-white text-xs font-extrabold hover:bg-primary-dark transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Agregar producto
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/50 px-4 py-10 text-center">
            <span className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-[var(--surface-canvas)] mb-3">
              <Package className="h-6 w-6 text-[var(--text-tertiary)]" />
            </span>
            <p className="text-sm font-bold text-[var(--text-primary)]">Sin productos en la orden</p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Click en <strong>Agregar producto</strong> arriba para buscar o crear uno nuevo.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const q = itemQueries[idx] ?? "";
              const filtered = q.length > 0
                ? products.filter(p => p.name.toLowerCase().includes(q.toLowerCase()) || (p.barcode ?? "").includes(q)).slice(0, 6)
                : [];
              const lineTotal = item.quantity * item.unitCost;
              return (
                <div key={idx} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 transition-all hover:border-[var(--text-tertiary)]">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-extrabold shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 relative">
                      <input
                        value={itemQueries[idx] ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setItemQueries(prev => prev.map((q, i) => i === idx ? val : q));
                          setOpenSearchIdx(idx);
                        }}
                        onFocus={() => setOpenSearchIdx(idx)}
                        onBlur={() => setTimeout(() => setOpenSearchIdx(null), 120)}
                        placeholder="Buscar producto…"
                        className="w-full h-10 px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-primary"
                      />
                      {openSearchIdx === idx && filtered.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-20 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl mt-1 max-h-56 overflow-y-auto shadow-lg">
                          {filtered.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={() => { changeProduct(idx, p.id); setItemQueries(prev => prev.map((_, i) => i === idx ? p.name : _)); setOpenSearchIdx(null); }}
                              className="w-full text-left px-4 py-2.5 hover:bg-[var(--surface-sunken)] flex items-center gap-2 text-sm border-b border-[var(--rule-soft)] last:border-0"
                            >
                              <Package className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-[var(--text-primary)] truncate">{p.name}</p>
                                {p.barcode && <p className="text-xs text-[var(--text-tertiary)]">{p.barcode}</p>}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      aria-label={`Quitar producto ${idx + 1}`}
                      className="h-10 w-10 inline-flex items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-500)] transition-colors shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 ml-9 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Field label="Cant" labelClassName="text-xs font-bold text-[var(--text-tertiary)] uppercase">
                        {(id) => (
                          <>
                            <input
                              id={id}
                              type="number" min="1" step="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                              className="w-20 h-10 px-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-right tabular-nums outline-none focus:border-primary"
                            />
                            <span className="text-xs font-bold text-[var(--text-tertiary)] ml-1">{item.unit}</span>
                          </>
                        )}
                      </Field>
                    </div>
                    <div className="flex items-center gap-1">
                      <Field label="Costo" labelClassName="text-xs font-bold text-[var(--text-tertiary)] uppercase">
                        {(id) => (
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-tertiary)]">S/</span>
                            <input
                              id={id}
                              type="number" min="0" step="0.01"
                              value={item.unitCost}
                              onChange={(e) => updateItem(idx, { unitCost: Number(e.target.value) })}
                              className="w-24 h-10 pl-7 pr-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-right tabular-nums outline-none focus:border-primary"
                            />
                          </div>
                        )}
                      </Field>
                    </div>
                    <div className="ml-auto inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      <span className="text-xs font-bold uppercase">Total</span>
                      <span className="text-base font-extrabold tabular-nums">{formatCurrency(lineTotal)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
