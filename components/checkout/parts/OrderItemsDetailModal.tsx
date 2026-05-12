"use client";

/**
 * OrderItemsDetailModal — modal con lista detallada de items del pedido
 * mostrando imagen, nombre, descripción, precio y subtotal.
 *
 * Se abre desde el StepConfirmar al hacer click en el icono "ojo" del
 * resumen de productos. Da al cliente una última verificación visual
 * antes de confirmar.
 *
 * UI ONLY — no toca lógica de orden, totales, reservas ni providers.
 */

import { AnimatePresence, m as motion } from "framer-motion";
import Image from "next/image";
import { X, Package, ShoppingBag } from "@buleje/design-system/icons";
import type { CartItem } from "@/contexts/cart-context";

function fmt(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

export interface OrderItemsDetailModalProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  finalTotal: number;
  cartTotal: number;
  discount: number;
}

export function OrderItemsDetailModal({
  open,
  onClose,
  items,
  finalTotal,
  cartTotal,
  discount,
}: OrderItemsDetailModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="items-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-end sm:items-center justify-center sm:p-6 backdrop-blur-md bg-slate-950/65"
          style={{ zIndex: 2147483646 }}
          onClick={onClose}
        >
          <motion.div
            key="items-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de productos"
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-xl max-h-[90svh] flex flex-col rounded-t-3xl sm:rounded-[28px] bg-[var(--surface-raised)] overflow-hidden"
            style={{ boxShadow: "0 30px 70px -15px rgba(0,0,0,0.45)" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[var(--rule-soft)] bg-gradient-to-b from-[color-mix(in_oklch,var(--color-primary,#00B4A6)_4%,transparent)] to-transparent">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md"
                  style={{
                    background: "linear-gradient(135deg, var(--color-primary, #00B4A6) 0%, var(--color-primary-dark, #009690) 100%)",
                  }}
                >
                  <ShoppingBag className="h-5 w-5" strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-extrabold text-[var(--text-primary)] tracking-tight leading-tight">
                    Detalle de tu pedido
                  </h3>
                  <p className="text-xs text-muted leading-snug mt-0.5">
                    {items.length} {items.length === 1 ? "producto" : "productos"} · Total {fmt(finalTotal)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-sunken)] hover:bg-[var(--rule-base)] text-[var(--text-primary)] transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* Lista de items con imágenes */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 p-3 rounded-2xl border-2 border-[var(--rule-soft)] hover:border-[var(--color-primary,#00B4A6)]/30 transition-colors"
                >
                  {/* Imagen */}
                  <div className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-xl overflow-hidden bg-[var(--surface-sunken)] shrink-0">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        sizes="96px"
                        className="object-cover"
                        unoptimized={item.image.startsWith("data:")}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[var(--rule-base)]">
                        <Package className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
                      </div>
                    )}
                    <span
                      className="absolute -top-1 -right-1 h-7 min-w-[1.75rem] px-1.5 rounded-full text-xs font-extrabold tabular-nums flex items-center justify-center shadow-md"
                      style={{
                        background: "var(--color-primary, #00B4A6)",
                        color: "#fff",
                      }}
                    >
                      {item.quantity}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="min-w-0">
                      <p className="text-sm sm:text-base font-bold text-[var(--text-primary)] leading-tight line-clamp-2">
                        {item.name}
                      </p>
                      {item.unit && (
                        <p className="text-xs font-bold uppercase tracking-wider text-muted mt-1">
                          Por {item.unit}
                        </p>
                      )}
                      {item.note && (
                        <p className="text-xs text-muted mt-1.5 line-clamp-2 italic">
                          Nota: {item.note}
                        </p>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-xs text-muted tabular-nums">
                        {fmt(item.price)} {item.unit ? `/ ${item.unit}` : "c/u"}
                      </span>
                      <span
                        className="text-base sm:text-lg font-extrabold tabular-nums tracking-tight"
                        style={{ color: "var(--color-primary, #00B4A6)" }}
                      >
                        {fmt(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer con total */}
            <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]/50 px-6 py-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Subtotal</span>
                <span className="tabular-nums font-semibold text-[var(--text-primary)]">{fmt(cartTotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex items-center justify-between text-sm text-[var(--data-success-600)]">
                  <span>Descuento aplicado</span>
                  <span className="tabular-nums font-bold">-{fmt(discount)}</span>
                </div>
              )}
              <div className="h-px bg-[var(--rule-soft)] my-1" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--text-primary)]">Total a pagar</span>
                <span
                  className="text-2xl font-extrabold tabular-nums tracking-tight"
                  style={{ color: "var(--color-primary, #00B4A6)" }}
                >
                  {fmt(finalTotal)}
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
