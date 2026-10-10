"use client";

import { CardTitle } from "@buleje/design-system";
import { useState } from "react";
import { ShoppingBasket, Banknote, X, Trash2, User } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { extractIgv } from "@/lib/tax";
import POSFiadoPanel from "@/components/admin/pos/POSFiadoPanel";
import POSPausedCarts from "@/components/admin/pos/POSPausedCarts";
import POSCrossSell from "@/components/admin/pos/POSCrossSell";
import { formatCurrency } from "@/lib/format";
import { fmt, numeroAPalabras } from "@/components/admin/pos/pos-shared";
import POSCartItem from "@/components/admin/pos/POSCartItem";
import { useTopeDescuentoCajero } from "@/components/admin/pos/useTopeDescuentoCajero";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import type { POSCarrito } from "@/components/admin/pos/usePOSCarrito";

interface POSCartPanelProps {
  carrito: POSCarrito;
  /** Ya no cambia nada: el alto lo pone el mostrador (useAltoDelMostrador). */
  expanded?: boolean;
  customerPhone: string;
  /** Cliente elegido en el cobro (usePOSCobro): se ve aquí con lo que debe. */
  customerName?: string;
  onQuitarCliente?: () => void;
  openPaymentModal: () => void;
}

/** Columna del carrito: cola de clientes, líneas, total y Cobrar. */
export default function POSCartPanel({ carrito, customerPhone, customerName, onQuitarCliente, openPaymentModal }: POSCartPanelProps) {
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

  const botonCabecera = "inline-flex h-12 items-center gap-1.5 rounded-xl px-2 text-sm font-bold transition-colors";

  return (
        <div
          className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl flex flex-col shrink-0 min-h-[14rem] lg:min-h-0 lg:w-[22rem] 2xl:w-[24rem]"
          data-pos-carrito
        >
          {/* Cabecera en una fila: título con la cuenta · pausar · siguiente cliente · vaciar */}
          <div className="px-2 sm:px-3 py-1 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
            <div className="flex flex-wrap items-center justify-between gap-x-1">
              <CardTitle className="font-bold text-[var(--text-primary)] text-sm flex items-center gap-2">
                <ShoppingBasket className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
                Carrito
                {cartCount > 0 && (
                  <span className="bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-sm font-bold px-2 py-0.5 rounded-full tabular-nums">{cartCount}</span>
                )}
              </CardTitle>
              <div className="flex flex-wrap items-center justify-end gap-x-1">
                {/* Mejora 10: Paused Carts */}
                <POSPausedCarts
                  currentCartItems={cart as { product: { id: number; name: string; price: number; unit: string; image?: string; [k: string]: unknown }; quantity: number; discount?: number }[]}
                  currentTotal={cartTotal}
                  onPause={handlePauseCart}
                  onResume={(items) => cambiarDeCarrito(() => handleResumeCart(items))}
                />
                {/* Mejora 1 nueva: Cola de clientes */}
                <button
                  type="button"
                  onClick={enqueueClient}
                  disabled={clientQueues.length >= 5}
                  className={cn(botonCabecera, "text-[var(--data-success-700)] dark:text-[var(--data-success-500)] hover:bg-[var(--surface-sunken)] disabled:opacity-40 disabled:cursor-not-allowed")}
                  title="Guardar carrito y atender siguiente cliente"
                >
                  +Siguiente
                </button>
                {clientQueues.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowQueueDropdown(!showQueueDropdown)}
                      aria-expanded={showQueueDropdown}
                      className={cn(botonCabecera, "text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10")}
                    >
                      Cola: {clientQueues.length}
                    </button>
                    {showQueueDropdown && (
                      <div className="absolute right-0 top-12 z-dropdown w-64 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-2 space-y-1 shadow-[var(--shadow-md)]">
                        {clientQueues.map((q, idx) => {
                          const qTotal = q.reduce((s, i) => s + i.product.price * i.quantity, 0);
                          const qItems = q.reduce((s, i) => s + i.quantity, 0);
                          return (
                            <div key={idx} className="flex items-center gap-1 text-sm rounded-lg hover:bg-[var(--surface-sunken)]">
                              <button type="button" onClick={() => { cambiarDeCarrito(() => loadFromQueue(idx)); setShowQueueDropdown(false); }} className="flex-1 min-h-12 px-2 text-left">
                                <span className="font-bold text-[var(--text-primary)]">Cliente {idx + 1}</span>
                                <span className="text-[var(--text-tertiary)] ml-1">{qItems} items · {fmt(qTotal)}</span>
                              </button>
                              <button type="button" aria-label="Quitar" onClick={() => removeFromQueue(idx)} className="h-12 w-12 shrink-0 inline-flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--data-error-ink)]"><X className="h-4 w-4" /></button>
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
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className={cn(botonCabecera, "w-12 justify-center px-0 text-[var(--data-error-ink)] hover:bg-[var(--data-error-500)]/10")}
                    title="Vaciar carrito (F3)"
                    aria-label="Vaciar carrito"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {cart.length > 0 && confirmClear && (
                  <div className="flex items-center gap-1 animate-in fade-in duration-[var(--dur-fast)]" role="group" aria-label="Confirmar vaciar carrito">
                    <span className="text-sm font-bold text-[var(--data-error-ink)]">¿Vaciar?</span>
                    <button
                      type="button"
                      onClick={() => { clearCart(); setConfirmClear(false); }}
                      className="h-10 px-3 rounded-lg text-sm font-bold bg-[var(--data-error-600)] text-white hover:bg-[var(--data-error-700)] transition-colors"
                      aria-label="Confirmar: vaciar carrito"
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="h-10 px-3 rounded-lg text-sm font-bold border border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                      aria-label="Cancelar: mantener carrito"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cart items + extras (scrollable) */}
          <div className="flex-1 overflow-y-auto min-h-0 p-2 sm:p-3 space-y-1.5">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-1 text-[var(--text-tertiary)]">
                <ShoppingBasket className="h-6 w-6" aria-hidden />
                <p className="text-sm">Escanea o toca un producto</p>
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
                <p className="text-sm text-[var(--text-tertiary)] px-1 pb-1">
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
              <div className="px-1 pb-1 space-y-1.5" data-pos-cliente-carrito>
                <div className="flex items-center gap-2 min-w-0">
                  <User className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                  <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{customerName || customerPhone}</span>
                  {customerName && <span className="text-sm text-[var(--text-tertiary)] tabular-nums shrink-0">{customerPhone}</span>}
                  {onQuitarCliente && (
                    <button
                      type="button"
                      onClick={onQuitarCliente}
                      aria-label="Quitar cliente de esta venta"
                      title="Quitar cliente"
                      className="ml-auto shrink-0 h-10 w-10 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-ink)] hover:bg-[var(--surface-sunken)] inline-flex items-center justify-center"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <POSFiadoPanel customerPhone={customerPhone} cartTotal={cartTotal} />
              </div>
            )}
          </div>

          {/* Cobrar, siempre abajo del carrito. El total en letras y el IGV, en la ⓘ: antes eran dos
              renglones más y una lista desplegable que repetía las líneas de arriba. */}
          {cart.length > 0 && (() => {
            const { base, igv } = extractIgv(cartTotal);
            return (
              <div className="shrink-0 border-t border-[var(--rule-base)] p-2 sm:p-3 flex items-center gap-2 bg-[var(--surface-raised)] rounded-b-xl">
                <InfoTip
                  side="top"
                  title={fmt(cartTotal)}
                  what={<span className="capitalize">{numeroAPalabras(cartTotal)}</span>}
                  affects={`Base ${formatCurrency(base)} · IGV ${formatCurrency(igv)}`}
                />
                <button
                  type="button"
                  onClick={openPaymentModal}
                  data-pos-cobrar
                  className={button({ variant: "primary", className: "flex-1 min-h-14 rounded-xl text-lg font-extrabold tabular-nums" })}
                >
                  <Banknote className="h-5 w-5" aria-hidden />
                  Cobrar {fmt(cartTotal)}
                  <kbd className="ml-1 text-xs font-semibold opacity-80 border border-current/30 px-1 rounded">F2</kbd>
                </button>
              </div>
            );
          })()}
        </div>
  );
}

/**
 * A 400 px el carrito queda debajo de la grilla: esta barra deja cobrar con el pulgar sin bajar.
 * Va ENCIMA de la barra de navegación del panel (antes la tapaba: las dos en bottom-0) y tocar la
 * cuenta baja hasta el carrito para revisar o cambiar una línea.
 */
export function POSBarraCobroMovil({ cartCount, cartTotal, onCobrar }: { cartCount: number; cartTotal: number; onCobrar: () => void }) {
  const verCarrito = () => document.querySelector("[data-pos-carrito]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="fixed left-0 right-0 bottom-[calc(62px+max(env(safe-area-inset-bottom),4px))] bg-[var(--surface-raised)] border-t border-[var(--rule-base)] px-3 py-2 z-40 sm:hidden shadow-[var(--shadow-md)]" data-pos-barra-cobro>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={verCarrito} className="min-w-0 min-h-12 flex flex-col items-start justify-center rounded-xl px-2 text-left hover:bg-[var(--surface-sunken)]" title="Ver el carrito">
          <span className="text-sm font-medium text-[var(--text-secondary)]">{cartCount} {cartCount === 1 ? "producto" : "productos"} · Ver</span>
          <span className="text-lg font-bold font-mono text-[var(--text-primary)] tabular-nums">{formatCurrency(cartTotal)}</span>
        </button>
        <button type="button" onClick={onCobrar} className={button({ variant: "primary", className: "min-h-12 rounded-xl px-7 text-base" })}>
          Cobrar
        </button>
      </div>
    </div>
  );
}
