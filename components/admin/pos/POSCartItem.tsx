"use client";

import { Plus, Minus, X, Package, Percent } from "@buleje/design-system/icons";
import Image from "next/image";
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
  return (
                  <div className={cn("rounded-lg border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-3 hover:bg-[var(--surface-sunken)] transition-all duration-[var(--dur-base)]", lastAddedId === item.product.id && "ring-2 ring-[var(--data-success-500)]/40 bg-primary/10 dark:bg-primary/15")}>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.product.image ? (
                        <Image src={item.product.image} alt={item.product.name} width={48} height={48} className="rounded-lg object-cover shrink-0 w-12 h-12" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-[var(--surface-sunken)] dark:bg-accent flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{item.product.name}</p>
                        <div className="flex items-center gap-1.5">
                          <p className={cn("text-[length:var(--ts-xs)]", item.discount ? "line-through text-[var(--text-tertiary)] dark:text-muted" : "text-[var(--text-tertiary)] dark:text-muted")}>
                            {fmt(item.product.price)}
                          </p>
                          {item.discount && item.discount > 0 && (
                            <span
                              title={pasaTope ? `Pasa tu tope de ${pctLegible(topeItemPct ?? 0)} %: que lo cobre el dueño o un admin` : undefined}
                              className={cn(
                                "text-[length:var(--ts-2xs)] font-bold px-1 py-0.5 rounded",
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
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-ink)] bg-[var(--data-warning-50)] px-1 py-0.5 rounded">
                              Ultimas {item.product.stock}
                            </span>
                          )}
                          {/* Mejora 3: Promo badge */}
                          <PromoBadge productId={item.product.id} quantity={item.quantity} unitPrice={item.product.price} />
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button aria-label="Disminuir cantidad"
                          onClick={() => updateQuantity(item.product.id, -1)}
                          className="h-6 w-6 rounded-lg bg-[var(--surface-sunken)] dark:bg-accent flex items-center justify-center hover:bg-[var(--surface-sunken)] transition-colors"
                        >
                          <Minus className="h-3 w-3 text-[var(--text-secondary)] dark:text-muted" />
                        </button>
                        <span className="w-6 text-center text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{item.quantity}</span>
                        <button aria-label="Aumentar cantidad"
                          onClick={() => updateQuantity(item.product.id, 1)}
                          className="h-6 w-6 rounded-lg bg-[var(--surface-sunken)] dark:bg-accent flex items-center justify-center hover:bg-[var(--surface-sunken)] transition-colors"
                        >
                          <Plus className="h-3 w-3 text-[var(--text-secondary)] dark:text-muted" />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] shrink-0 w-14 text-right">{fmt(itemTotal)}</span>
                      <button
                        onClick={() => setEditingDiscount(editingDiscount === item.product.id ? null : item.product.id)}
                        className={cn(
                          "p-1 rounded transition-colors shrink-0",
                          editingDiscount === item.product.id ? "text-primary bg-primary/10" : "text-[var(--text-tertiary)] dark:text-muted hover:text-primary"
                        )}
                        title="Aplicar descuento"
                      >
                        <Percent className="h-3.5 w-3.5" />
                      </button>
                      <button aria-label="Quitar"
                        onClick={() => removeFromCart(item.product.id)}
                        className="p-1 rounded text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--data-error-500)] transition-colors shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {editingDiscount === item.product.id && (
                      <div className="mt-2 pt-2 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex flex-wrap items-center gap-2">
                        <Field label="Descuento:" labelClassName="text-xs text-[var(--text-secondary)] dark:text-muted font-medium">
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
                            className="flex-1 px-2 py-1 text-xs border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:border-primary outline-none"
                            placeholder="0"
                          />
                        </Field>
                        <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">%</span>
                        {topeItemPct != null && (
                          <span className={cn("text-xs", pasaTope ? "font-semibold text-[var(--data-error-600)] dark:text-[var(--data-error-500)]" : "text-[var(--text-tertiary)] dark:text-muted")}>
                            {pasaTope ? `Tu tope es ${pctLegible(topeItemPct)} %` : `hasta ${pctLegible(topeItemPct)} %`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
  );
}
