"use client";

import { m } from "framer-motion";
import {
  ChevronLeft,
  Loader2,
  MapPin,
  User,
  Phone,
  CreditCard,
  Banknote,
  ShoppingBag,
  Shield,
  Truck,
  Star,
} from "lucide-react";
import type { CartItem } from "@/contexts/cart-context";
import type { Customer } from "@/contexts/customer-context";
import type { CheckoutState } from "../types";

/**
 * StepConfirmar — pantalla final de revisión antes del submit.
 *
 * Replica el patrón del paso "confirmacion" de MarketplaceCheckoutModal
 * (tienda individual): resumen compacto dentro del scroll + footer CTA
 * sticky anclado al borde inferior del modal.
 *
 * Export dividido en dos piezas:
 *  - `StepConfirmar`       → contenido scrolleable (cards de resumen)
 *  - `StepConfirmarFooter` → CTA sticky con gradient + trust badges
 *
 * El CheckoutModal los ensambla: el contenido va como children del shell
 * y el footer como `footerSlot`. Así el botón "Confirmar pedido" nunca
 * se pierde por más que el resumen sea largo.
 */

export type StepConfirmarProps = {
  state: CheckoutState;
  items: CartItem[];
  finalTotal: number;
  cartTotal: number;
  discount: number;
  effectiveCustomer: Customer | null;
  /** Opcional — si se provee, se muestra un botón "Editar" sobre la
   * card de dirección que regresa al paso Datos. */
  onEditAddress?: () => void;
};

export type StepConfirmarFooterProps = {
  submitting: boolean;
  submitError: string;
  finalTotal: number;
  onBack: () => void;
  onConfirm: () => void;
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

export function StepConfirmar({
  state,
  items,
  finalTotal,
  cartTotal,
  discount,
  effectiveCustomer,
  onEditAddress,
}: StepConfirmarProps) {
  const displayName =
    state.customer.name || effectiveCustomer?.name || "Sin nombre";
  const displayPhone =
    state.customer.phone || effectiveCustomer?.phone || "";
  const displayLocation =
    state.address.location || effectiveCustomer?.location || "";
  const displayReference =
    state.address.reference || effectiveCustomer?.reference || "";

  const methodLabel =
    state.payment.method === "yape"
      ? "Yape"
      : state.payment.method === "efectivo"
        ? "Efectivo"
        : "Sin seleccionar";

  return (
    <m.div
      key="confirmar"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="px-5 py-5 space-y-4"
    >
      {/* Encabezado */}
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          <Shield className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-foreground">
            Revisa tu pedido
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-muted">
            Confirma que todo esté correcto antes de enviar
          </p>
        </div>
      </div>

      {/* Cliente */}
      <div className="rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-4 space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Tus datos
        </p>
        <div className="flex items-start gap-2.5">
          <User className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-800 dark:text-foreground truncate">
              {displayName}
            </p>
            {state.customer.dni && (
              <p className="text-[11px] text-gray-500 dark:text-muted">
                DNI: {state.customer.dni}
              </p>
            )}
          </div>
        </div>
        {displayPhone && (
          <div className="flex items-start gap-2.5">
            <Phone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700 dark:text-foreground">
              {displayPhone}
            </p>
          </div>
        )}
      </div>

      {/* Dirección */}
      {displayLocation && (
        <div className="rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Entregaremos en
            </p>
            {onEditAddress && (
              <button
                type="button"
                onClick={onEditAddress}
                className="text-[10px] font-bold text-primary hover:underline"
                data-testid="confirmar-editar-direccion"
              >
                Editar
              </button>
            )}
          </div>
          <div className="flex items-start gap-2.5">
            <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 dark:text-foreground">
                {displayLocation}
              </p>
              {displayReference && (
                <p className="text-[11px] text-gray-500 dark:text-muted mt-0.5">
                  Ref: {displayReference}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Método de pago */}
      <div className="rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Método de pago
        </p>
        <div className="flex items-center gap-2.5">
          {state.payment.method === "yape" ? (
            <CreditCard className="h-4 w-4 text-primary shrink-0" />
          ) : (
            <Banknote className="h-4 w-4 text-primary shrink-0" />
          )}
          <p className="text-sm font-bold text-gray-800 dark:text-foreground">
            {methodLabel}
          </p>
          {state.payment.method === "yape" && state.payment.yapeOpNumber && (
            <span className="ml-auto text-[11px] text-gray-500 dark:text-muted font-mono">
              Op: {state.payment.yapeOpNumber}
            </span>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-4 space-y-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          {items.length} {items.length === 1 ? "producto" : "productos"}
        </p>
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {items.map((i) => (
            <div
              key={i.id}
              className="flex items-center gap-2 text-[12px]"
            >
              <span className="text-gray-500 dark:text-muted font-mono tabular-nums">
                {i.quantity}×
              </span>
              <span className="flex-1 truncate text-gray-800 dark:text-foreground">
                {i.name}
              </span>
              <span className="shrink-0 font-semibold text-gray-800 dark:text-foreground tabular-nums">
                {fmt(i.price * i.quantity)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Totales */}
      <div className="rounded-2xl bg-primary/5 dark:bg-primary/10 border border-primary/20 p-4 space-y-2">
        <div className="flex items-center justify-between text-[12px] text-gray-600 dark:text-muted">
          <span>Subtotal</span>
          <span className="tabular-nums">{fmt(cartTotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex items-center justify-between text-[12px] text-emerald-600 dark:text-emerald-400">
            <span>Descuento</span>
            <span className="tabular-nums">-{fmt(discount)}</span>
          </div>
        )}
        {state.coupon.discount > 0 && (
          <div className="flex items-center justify-between text-[12px] text-emerald-600 dark:text-emerald-400">
            <span>Cupón</span>
            <span className="tabular-nums">-{fmt(state.coupon.discount)}</span>
          </div>
        )}
        {state.payment.tip > 0 && (
          <div className="flex items-center justify-between text-[12px] text-gray-600 dark:text-muted">
            <span>Propina</span>
            <span className="tabular-nums">+{fmt(state.payment.tip)}</span>
          </div>
        )}
        <div className="h-px bg-primary/20 my-1" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-gray-900 dark:text-foreground">
            Total a pagar
          </span>
          <span className="text-lg font-extrabold text-primary tabular-nums">
            {fmt(finalTotal)}
          </span>
        </div>
      </div>
    </m.div>
  );
}

/**
 * Footer CTA sticky del paso confirmar — se renderiza fuera del área
 * de scroll del shell para quedar siempre visible, replicando el
 * patrón del MarketplaceCheckoutModal.
 */
export function StepConfirmarFooter({
  submitting,
  submitError,
  finalTotal,
  onBack,
  onConfirm,
}: StepConfirmarFooterProps) {
  return (
    <div className="px-6 py-4">
      {submitError && (
        <p className="mb-3 rounded-xl bg-red-50 dark:bg-red-950/20 px-4 py-2 text-xs text-red-700 dark:text-red-400 border border-red-200/50 dark:border-red-800/30">
          {submitError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0 disabled:opacity-50"
          aria-label="Volver al paso de pago"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-sm transition-all bg-linear-to-r from-primary to-emerald-600 text-white shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando…
            </>
          ) : (
            <>
              <ShoppingBag className="h-4 w-4" />
              Confirmar pedido · {fmt(finalTotal)}
            </>
          )}
        </button>
      </div>

      <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1">
          <Shield className="h-3 w-3" /> Compra segura
        </span>
        <span className="flex items-center gap-1">
          <Truck className="h-3 w-3" /> Delivery rápido
        </span>
        <span className="flex items-center gap-1">
          <Star className="h-3 w-3" /> Compra con confianza
        </span>
      </div>
    </div>
  );
}
