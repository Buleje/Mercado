"use client";

/** La pestaña «Ingredientes» del formulario del recetario: nombre (con sugerencias de tus productos), cantidad, unidad y precio. */
import { Plus, X } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { formatCurrency } from "@/lib/format";
import { UNIDADES, type Ingrediente, type ProductSearch } from "./recetario-tipos";

interface Props {
  ingredientes: Ingrediente[];
  products: ProductSearch[];
  totalIngredientes: number;
  onAgregar: () => void;
  onQuitar: (idx: number) => void;
  onCambiar: (idx: number, field: keyof Ingrediente, value: string | number) => void;
  onElegirProducto: (idx: number, prod: ProductSearch) => void;
}

export function PanelIngredientesRecetario({ ingredientes, products, totalIngredientes, onAgregar, onQuitar, onCambiar, onElegirProducto }: Props) {
  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-[var(--text-primary)]">Ingredientes ({ingredientes.length})</p>
                        <button onClick={onAgregar} className="text-sm font-bold text-primary hover:underline flex items-center gap-1">
                          <Plus className="h-3 w-3" /> Agregar ingrediente
                        </button>
                      </div>
                      {ingredientes.length === 0 && (
                        <p className="text-sm text-[var(--text-tertiary)] text-center py-6">Agrega ingredientes para la receta</p>
                      )}
                      {ingredientes.map((ing, idx) => (
                        <div key={idx} className="bg-[var(--surface-sunken)] rounded-xl p-3 space-y-2">
                          <div className="flex gap-2 items-start">
                            <Field
                              label="Nombre del ingrediente"
                              labelClassName="block text-sm font-bold text-[var(--text-tertiary)] mb-0.5"
                              className="flex-1"
                            >
                              {(id) => (
                                <>
                                  <div className="relative">
                                    <input
                                      id={id}
                                      type="text"
                                      value={ing.nombre}
                                      onChange={e => onCambiar(idx, "nombre", e.target.value)}
                                      placeholder="Buscar producto o escribir..."
                                      className="w-full px-2.5 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                                      list={`prod-list-${idx}`}
                                    />
                                    <datalist id={`prod-list-${idx}`}>
                                      {products
                                        .filter(p => p.name.toLowerCase().includes((ing.nombre || "").toLowerCase()))
                                        .slice(0, 8)
                                        .map(p => (
                                          <option key={p.id} value={p.name} onClick={() => onElegirProducto(idx, p)} />
                                        ))}
                                    </datalist>
                                  </div>
                                  {/* Quick product select buttons */}
                                  {ing.nombre && ing.nombre.length >= 2 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {products
                                        .filter(p => p.name.toLowerCase().includes(ing.nombre.toLowerCase()))
                                        .slice(0, 3)
                                        .map(p => (
                                          <button
                                            key={p.id}
                                            onClick={() => onElegirProducto(idx, p)}
                                            className="text-sm bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)] px-2 py-0.5 rounded-lg hover:bg-[var(--accent-muted)] transition-colors"
                                          >
                                            {p.name} — {formatCurrency(Number(p.price))}
                                          </button>
                                        ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </Field>
                            <button aria-label="Quitar" onClick={() => onQuitar(idx)} className="p-1 rounded-xl hover:bg-[var(--data-error-100)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors mt-4 shrink-0">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <Field label="Cantidad" labelClassName="block text-sm font-bold text-[var(--text-tertiary)] mb-0.5">
                              <input type="number" step="0.01" min="0" value={ing.cantidad} onChange={e => onCambiar(idx, "cantidad", parseFloat(e.target.value) || 0)} className="w-full px-2.5 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
                            </Field>
                            <Field label="Unidad" labelClassName="block text-sm font-bold text-[var(--text-tertiary)] mb-0.5">
                              <select value={ing.unidad} onChange={e => onCambiar(idx, "unidad", e.target.value)} className="w-full px-2.5 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-1 focus:ring-primary/30">
                                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </Field>
                            <Field label="Precio (S/)" labelClassName="block text-sm font-bold text-[var(--text-tertiary)] mb-0.5">
                              <input type="number" step="0.01" min="0" value={ing.precio} onChange={e => onCambiar(idx, "precio", parseFloat(e.target.value) || 0)} className="w-full px-2.5 h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:outline-none focus:ring-1 focus:ring-primary/30" />
                            </Field>
                          </div>
                        </div>
                      ))}
                      {ingredientes.length > 0 && (
                        <div className="flex items-center justify-between bg-primary/5 rounded-xl p-3 border border-primary/20">
                          <span className="text-sm font-bold text-primary">Total ingredientes</span>
                          <span className="text-sm font-bold text-primary">{formatCurrency(totalIngredientes)}</span>
                        </div>
                      )}
                    </div>
  );
}
