"use client";

import { Plus, Minus, X, Percent } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { Field } from "@/components/admin/shared/Field";
import { fmt, type CartItem } from "@/components/admin/pos/pos-shared";
import PromoBadge from "@/components/admin/pos/POSPromoBadge";
import { excedeTopeItemCajero, pctLegible } from "@/lib/pos/descuento-cajero";

interface POSCartItemProps {
  item: CartItem;
  lastAddedId: number | null;
  editingDiscount: number | null;
  setEditingDiscount: (productId: number | null) => void;
  updateQuantity: (productId: number, delta: number) => void;
  updateDiscount: (productId: number, discount: number) => void;
  removeFromCart: (productId: number) => void;
  /**
   * % máximo de descuento por producto que `POST /api/sales` le acepta a la
   * sesión (tope del cajero en Ajustes). `null`: admin, dueño o rol cargando —
   * sin tope en pantalla, decide la ruta.
   */
  topeItemPct?: number | null;
}

/** Una línea del carrito: cantidad, descuento por producto y quitar. */
export default function POSCartItem({ item, lastAddedId, editingDiscount, setEditingDiscount, updateQuantity, updateDiscount, removeFromCart, topeItemPct = null }: POSCartItemProps) {
                const discountMultiplier = 1 - (item.discount || 0) / 100;
                // El «-10 %» de producto por vencer o un carrito pausado pueden traer más que el tope:
                // se marca en rojo acá antes de que el cobro lo rechace (403).
                const pasaTope = topeItemPct != null && excedeTopeItemCajero(item.discount ?? 0, topeItemPct);
                const itemTotal = item.product.price * item.quantity * discountMultiplier;
  const botonCantidad = "h-12 w-12 shrink-0 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--rule-soft)] dark:hover:bg-[var(--rule-base)] transition-colors";
  const botonLinea = "h-12 w-12 shrink-0 rounded-xl flex items-center justify-center transition-colors";
  // Dos renglones (10-10): con la foto, la cantidad, el precio, «%» y «×» en uno solo, a 352 px el
  // nombre quedaba en 4 letras («Arro…», «Azú…»). Arriba el nombre entero y lo que suma la línea;
  // abajo los botones de 48 px para el dedo y el precio unitario.
  return (
                  <div className={cn("rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-2 hover:bg-[var(--surface-sunken)] transition-all duration-[var(--dur-base)]", lastAddedId === item.product.id && "ring-2 ring-[var(--data-success-500)]/40 bg-primary/10 dark:bg-primary/15")} data-pos-linea>
                    <div className="flex items-start gap-2 px-1">
                      <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-[var(--text-primary)] line-clamp-2">{item.product.name}</p>
                      <span className="shrink-0 text-base font-bold tabular-nums text-[var(--text-primary)]">{fmt(itemTotal)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <button type="button" aria-label={`Disminuir cantidad de ${item.product.name}`} onClick={() => updateQuantity(item.product.id, -1)} className={botonCantidad}>
                        <Minus className="h-4 w-4" aria-hidden />
                      </button>
                      <span className="w-8 text-center text-base font-bold tabular-nums text-[var(--text-primary)]">{item.quantity}</span>
                      <button type="button" aria-label={`Aumentar cantidad de ${item.product.name}`} onClick={() => updateQuantity(item.product.id, 1)} className={botonCantidad}>
                        <Plus className="h-4 w-4" aria-hidden />
                      </button>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 px-1">
                        <span className={cn("text-sm tabular-nums", item.discount ? "line-through text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]")}>
                          {fmt(item.product.price)}
                        </span>
                        {(item.discount ?? 0) > 0 && (
                          <span
                            title={pasaTope ? `Pasa tu tope de ${pctLegible(topeItemPct ?? 0)} %: que lo cobre el dueño o un admin` : undefined}
                            className={cn(
                              "text-xs font-bold px-1 py-0.5 rounded",
                              pasaTope
                                ? "text-[var(--data-error-600)] dark:text-[var(--data-error-500)] bg-[var(--data-error-500)]/12"
                                : "text-[var(--data-success-700)] dark:text-[var(--data-success-500)] bg-[var(--data-success-500)]/12",
                            )}
                          >
                            -{item.discount}%
                          </span>
                        )}
                        {/* Mejora 7: Stock bajo badge */}
                        {item.product.stock != null && item.product.stock > 0 && item.product.stock <= (item.product.stockMin || 5) && (
                          <span className="text-xs font-bold text-[var(--data-warning-ink)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/12 px-1 py-0.5 rounded">
                            Últimas {item.product.stock}
                          </span>
                        )}
                        {/* Mejora 3: Promo badge */}
                        <PromoBadge productId={item.product.id} quantity={item.quantity} unitPrice={item.product.price} />
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingDiscount(editingDiscount === item.product.id ? null : item.product.id)}
                        aria-pressed={editingDiscount === item.product.id}
                        aria-label={`Descuento a ${item.product.name}`}
                        className={cn(
                          botonLinea,
                          editingDiscount === item.product.id ? "text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
                        )}
                        title="Aplicar descuento"
                      >
                        <Percent className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar ${item.product.name}`}
                        onClick={() => removeFromCart(item.product.id)}
                        className={cn(botonLinea, "text-[var(--text-tertiary)] hover:text-[var(--data-error-ink)] hover:bg-[var(--surface-sunken)]")}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    {editingDiscount === item.product.id && (
                      <div className="mt-2 pt-2 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap items-center gap-2">
                        <Field label="Descuento:" labelClassName="text-sm text-[var(--text-secondary)] dark:text-muted font-medium">
                          <input
                            type="number"
                            min="0"
                            max={topeItemPct ?? 100}
                            step="1"
                            value={item.discount || 0}
                            onChange={e => {
                              const v = Number(e.target.value);
                              updateDiscount(item.product.id, topeItemPct != null ? Math.min(v, topeItemPct) : v);
                            }}
                            className="flex-1 h-10 px-2 text-sm border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-lg bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                            placeholder="0"
                          />
                        </Field>
                        <span className="text-sm text-[var(--text-tertiary)] dark:text-muted">%</span>
                        {topeItemPct != null && (
                          <span className={cn("text-sm", pasaTope ? "font-semibold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : "text-[var(--text-tertiary)] dark:text-muted")}>
                            {pasaTope ? `Tu tope es ${pctLegible(topeItemPct)} %` : `hasta ${pctLegible(topeItemPct)} %`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
  );
}
