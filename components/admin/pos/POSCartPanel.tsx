"use client";

import { CardTitle } from "@buleje/design-system";
import { useState } from "react";
import { ShoppingBasket, Banknote, X, Trash2, User } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { extractIgv } from "@/lib/tax";
import POSFiadoPanel from "@/components/admin/pos/POSFiadoPanel";
import POSPausedCarts from "@/components/admin/pos/POSPausedCarts";
import POSCrossSell from "@/components/admin/pos/POSCrossSell";
import POSCartDetail from "@/components/admin/pos/POSCartDetail";
import { formatCurrency } from "@/lib/format";
import { fmt, numeroAPalabras } from "@/components/admin/pos/pos-shared";
import POSCartItem from "@/components/admin/pos/POSCartItem";
import { useTopeDescuentoCajero } from "@/components/admin/pos/useTopeDescuentoCajero";
import type { POSCarrito } from "@/components/admin/pos/usePOSCarrito";

interface POSCartPanelProps {
  carrito: POSCarrito;
  expanded: boolean;
  customerPhone: string;
  /** Cliente elegido en el cobro (usePOSCobro): se ve aquí con lo que debe. */
  customerName?: string;
  onQuitarCliente?: () => void;
  openPaymentModal: () => void;
}

/** Columna del carrito: cola de clientes, líneas, total y Cobrar. */
export default function POSCartPanel({ carrito, expanded, customerPhone, customerName, onQuitarCliente, openPaymentModal }: POSCartPanelProps) {
  const {
    cart, cartCount, cartTotal, clientQueues, enqueueClient, loadFromQueue, removeFromQueue, clearCart,
    handlePauseCart, handleResumeCart, handleAddFromSearch, lastAddedId, updateQuantity, updateDiscount, removeFromCart,
  } = carrito;
  const [showQueueDropdown, setShowQueueDropdown] = useState(false);
  // Confirmar antes de vaciar: los dos botones sólo se ven con cart.length > 0.
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<number | null>(null);
  // Tope de descuento por producto del cajero: el mismo de Ajustes que aplica POST /api/sales.
  const tope = useTopeDescuentoCajero();
  // Otro carrito = otro cliente. Cambiar un carrito lleno por otro (cola o «Retomar») no lo vacía,
  // así que el efecto de usePOSCobro no limpia: sin esto el fiado del carrito B se anotaba al cliente A (09-10).
  const cambiarDeCarrito = (cargar: () => void) => { onQuitarCliente?.(); cargar(); };

  return (
        <div className={cn(
          "bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl flex flex-col shrink-0 min-h-0",
          "lg:w-80 xl:w-[22rem]"
        )} style={{ minHeight: "28rem", maxHeight: expanded ? "calc(100vh - 8rem)" : "calc(100vh - 14rem)" }}>
          {/* Cart header */}
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
            <div className="flex items-center justify-between">
              <CardTitle className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm flex flex-wrap items-center gap-2">
                <ShoppingBasket className="h-4 w-4 text-primary" />
                Carrito
                {cartCount > 0 && (
                  <span className="bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-bold px-2 py-0.5 rounded-full">{cartCount}</span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Mejora 1 nueva: Cola de clientes */}
                <button
                  onClick={enqueueClient}
                  disabled={clientQueues.length >= 5}
                  className="inline-flex items-center text-xs font-bold text-[var(--data-success-500)] hover:text-[var(--data-success-500)] px-1.5 max-sm:min-h-[40px] rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Guardar carrito y atender siguiente cliente"
                >
                  +Siguiente
                </button>
                {clientQueues.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowQueueDropdown(!showQueueDropdown)}
                      className="text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10 px-2 py-0.5 rounded-full hover:bg-primary/20 transition-colors"
                    >
                      Cola: {clientQueues.length}
                    </button>
                    {showQueueDropdown && (
                      <div className="absolute right-0 top-7 z-dropdown w-56 bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-2 space-y-1">
                        {clientQueues.map((q, idx) => {
                          const qTotal = q.reduce((s, i) => s + i.product.price * i.quantity, 0);
                          const qItems = q.reduce((s, i) => s + i.quantity, 0);
                          return (
                            <div key={idx} className="flex items-center gap-2 text-xs p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] ">
                              <button onClick={() => { cambiarDeCarrito(() => loadFromQueue(idx)); setShowQueueDropdown(false); }} className="flex-1 text-left">
                                <span className="font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Cliente {idx + 1}</span>
                                <span className="text-[var(--text-tertiary)] dark:text-muted ml-1">{qItems} items · {fmt(qTotal)}</span>
                              </button>
                              <button aria-label="Quitar" onClick={() => removeFromQueue(idx)} className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"><X className="h-3 w-3" /></button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {/* Feature 3: Vaciar carrito con confirmacion */}
                {cart.length > 0 && !confirmClear && (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="text-xs font-semibold text-[var(--data-error-500)] hover:text-[var(--data-error-600)] transition-colors flex items-center gap-1"
                    title="Vaciar carrito (pide confirmacion)"
                    aria-label="Vaciar carrito"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Vaciar
                    <kbd className="text-[length:var(--ts-2xs)] bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] text-[var(--text-tertiary)] px-1 rounded">F3</kbd>
                  </button>
                )}
                {cart.length > 0 && confirmClear && (
                  <div className="flex items-center gap-1 animate-in fade-in duration-[var(--dur-fast)]" role="group" aria-label="Confirmar vaciar carrito">
                    <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)]">Vaciar?</span>
                    <button
                      onClick={() => { clearCart(); setConfirmClear(false); }}
                      className="px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold bg-[var(--data-error-500)] text-white hover:bg-[var(--data-error-600)] transition-colors"
                      aria-label="Confirmar: vaciar carrito"
                    >
                      Si
                    </button>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="px-2 py-0.5 rounded-lg text-[length:var(--ts-2xs)] font-bold border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-sunken)] transition-colors"
                      aria-label="Cancelar: mantener carrito"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* Mejora 10: Paused Carts */}
            <div className="mt-1.5">
              <POSPausedCarts
                currentCartItems={cart as { product: { id: number; name: string; price: number; unit: string; image?: string; [k: string]: unknown }; quantity: number; discount?: number }[]}
                currentTotal={cartTotal}
                onPause={handlePauseCart}
                onResume={(items) => cambiarDeCarrito(() => handleResumeCart(items))}
              />
            </div>
          </div>

          {/* Cart items + extras (scrollable) */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-1.5">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[var(--text-tertiary)] dark:text-muted">
                <ShoppingBasket className="h-6 w-6 mb-1.5" />
                <p className="text-xs">Carrito vacío</p>
              </div>
            ) : (
              cart.map(item => (
                <POSCartItem
                  key={item.product.id}
                  item={item}
                  lastAddedId={lastAddedId}
                  editingDiscount={editingDiscount}
                  setEditingDiscount={setEditingDiscount}
                  updateQuantity={updateQuantity}
                  updateDiscount={updateDiscount}
                  removeFromCart={removeFromCart}
                  topeItemPct={tope.rol == null || tope.sinTope ? null : tope.pct}
                />
              ))
            )}

            {/* Mejora P-2: Subtotal por categoria */}
            {cart.length > 0 && (() => {
              const categoryTotals = cart.reduce((acc, item) => {
                const cat = item.product.category || "Otros";
                acc[cat] = (acc[cat] || 0) + item.product.price * item.quantity * (1 - (item.discount || 0) / 100);
                return acc;
              }, {} as Record<string, number>);
              const cats = Object.entries(categoryTotals);
              if (cats.length < 2) return null;
              return (
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted px-3 pb-1">
                  {cats.map(([cat, total]) => `${cat}: S/${total.toFixed(0)}`).join(" · ")}
                </p>
              );
            })()}

            {/* Mejora 11: Cross-sell suggestion */}
            {cart.length > 0 && (
              <POSCrossSell
                cartProductIds={cart.map(i => i.product.id)}
                onAddToCart={handleAddFromSearch}
              />
            )}

            {/* Cliente elegido en el cobro + lo que debe (Upgrade 5). */}
            {customerPhone && (
              <div className="px-3 pb-1 space-y-1.5" data-pos-cliente-carrito>
                <div className="flex items-center gap-2 min-w-0">
                  <User className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                  <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{customerName || customerPhone}</span>
                  {customerName && <span className="text-xs text-[var(--text-tertiary)] tabular-nums shrink-0">{customerPhone}</span>}
                  {onQuitarCliente && (
                    <button
                      type="button"
                      onClick={onQuitarCliente}
                      aria-label="Quitar cliente de esta venta"
                      title="Quitar cliente"
                      className="ml-auto shrink-0 p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--surface-sunken)] max-sm:min-h-10 max-sm:min-w-10 inline-flex items-center justify-center"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <POSFiadoPanel customerPhone={customerPhone} cartTotal={cartTotal} />
              </div>
            )}
          </div>

          {/* Cart total + pay button — sticky bottom */}
          {cart.length > 0 && (
            <div className="shrink-0 border-t border-[var(--rule-base)] dark:border-[var(--rule-base)] p-3 space-y-2 bg-[var(--surface-raised)] rounded-b-2xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              {/* Mejora 5: Expandable cart detail */}
              <div className="flex justify-between items-center">
                <POSCartDetail
                  items={cart.map(i => ({
                    name: i.product.name,
                    quantity: i.quantity,
                    price: i.product.price,
                    discount: i.discount,
                  }))}
                  count={cartCount}
                />
                <span className="text-lg font-extrabold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{fmt(cartTotal)}</span>
              </div>
              {/* Mejora 4R2: Total en palabras */}
              <p className="text-xs text-[var(--text-tertiary)] italic capitalize text-right">{numeroAPalabras(cartTotal)}</p>
              {/* Desglose IGV. TODO: leer rate de settings del tenant (taxRate) cuando el SettingsCtx lo exponga; por ahora usa IGV_RATE default. */}
              {(() => {
                const { base, igv } = extractIgv(cartTotal);
                return (
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] font-mono text-right">Sub: {formatCurrency(base)} · IGV: {formatCurrency(igv)}</p>
                );
              })()}

              <div className="flex gap-2">
                <button
                  onClick={openPaymentModal}
                  className="flex-1 min-h-12 rounded-xl bg-primary text-white font-bold text-base hover:bg-primary-dark transition-colors flex flex-wrap items-center justify-center gap-2"
                >
                  <Banknote className="h-4 w-4" />
                  Cobrar {fmt(cartTotal)}
                  <kbd className="ml-1 text-[length:var(--ts-2xs)] bg-white/20 px-1 rounded">F2</kbd>
                </button>
              </div>
            </div>
          )}
        </div>
  );
}

/** A 400 px el carrito queda abajo: esta barra fija deja cobrar con el pulgar sin bajar. */
export function POSBarraCobroMovil({ cartCount, cartTotal, onCobrar }: { cartCount: number; cartTotal: number; onCobrar: () => void }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface-raised)] border-t border-[var(--rule-base)] px-4 py-3 z-40 sm:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-medium text-[var(--text-primary)]">{cartCount} {cartCount === 1 ? "producto" : "productos"}</span>
          <span className="text-lg font-bold font-mono ml-2 text-[var(--text-primary)]">{formatCurrency(cartTotal)}</span>
        </div>
        <button onClick={onCobrar} className="bg-primary text-white px-7 min-h-12 rounded-xl font-bold text-base">
          Cobrar
        </button>
      </div>
    </div>
  );
}
