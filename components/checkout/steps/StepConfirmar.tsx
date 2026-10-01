"use client";

import { useState } from "react";
import Image from "next/image";
import { m } from "framer-motion";
import {
  ChevronLeft,
  Loader2,
  MapPin,
  Phone,
  CreditCard,
  Banknote,
  ShoppingBag,
  Shield,
  Truck,
  Star,
  Eye,
  Check,
  Clock,
  Sparkles,
  Pencil,
} from "@buleje/design-system/icons";
import type { CartItem } from "@/contexts/cart-context";
import type { Customer } from "@/contexts/customer-context";
import type { CheckoutState } from "../types";
import { OrderItemsDetailModal } from "../parts/OrderItemsDetailModal";

/**
 * StepConfirmar — pantalla final de revisión antes del submit.
 *
 * Rediseño 2026-05-05 v3 — BRAND-FIRST: el color de marca del negocio
 * (definido en `--color-primary`) es el protagonista visual. Hero
 * en gradient sólido, cards con tint brand sutil, headings y totales
 * en brand-dark. El negro foreground se reserva solo para body text
 * de máxima legibilidad. Sin numeración "1 2 3" (era ruido).
 */

export type StepConfirmarProps = {
  state: CheckoutState;
  items: CartItem[];
  finalTotal: number;
  cartTotal: number;
  discount: number;
  effectiveCustomer: Customer | null;
  onEditAddress?: () => void;
};

export type StepConfirmarFooterProps = {
  submitting: boolean;
  submitError: string;
  finalTotal: number;
  onBack: () => void;
  onConfirm: () => void;
  hasBlockingStockError?: boolean;
  stockWarnings?: string[];
};

function fmt(n: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);
}

/** Hairline brand-tinted — separador sutil en color de marca. */
function BrandHair() {
  return (
    <div
      className="h-px"
      aria-hidden="true"
      style={{
        background:
          "color-mix(in oklch, var(--color-primary, #00A0A0) 18%, transparent)",
      }}
    />
  );
}

/** Header de fila — icono brand-tinted + label brand-dark. */
function RowLabel({
  icon: Icon,
  children,
  action,
}: {
  icon: React.ComponentType<{
    className?: string;
    strokeWidth?: number;
    style?: React.CSSProperties;
  }>;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Icon
          className="h-3.5 w-3.5"
          strokeWidth={2.25}
          style={{ color: "var(--color-primary, #00A0A0)" }}
        />
        <div
          className="text-xs font-extrabold uppercase tracking-wider"
          style={{ color: "var(--color-primary-dark, #009690)" }}
        >
          {children}
        </div>
      </div>
      {action}
    </div>
  );
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
  const [itemsModalOpen, setItemsModalOpen] = useState(false);

  const displayName =
    state.customer.name || effectiveCustomer?.name || "Sin nombre";
  const firstName = displayName.split(" ")[0] || displayName;
  const displayPhone =
    state.customer.phone || effectiveCustomer?.phone || "";
  const displayLocation =
    state.address.location || effectiveCustomer?.location || "";
  const displayReference =
    state.address.reference || effectiveCustomer?.reference || "";

  const isYape = state.payment.method === "yape";
  const methodLabel =
    state.payment.method === "yape"
      ? "Yape"
      : state.payment.method === "efectivo"
        ? "Efectivo"
        : "Sin seleccionar";

  return (
    <m.div
      key="confirmar"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="px-4 sm:px-6 py-5 sm:py-6 space-y-4"
    >
      {/* ─── HERO — bloque brand sólido ─── */}
      <div
        className="relative overflow-hidden rounded-3xl px-6 py-6 text-white"
        style={{
          background:
            "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
          boxShadow:
            "0 20px 40px -16px color-mix(in oklch, var(--color-primary, #00A0A0) 50%, transparent)",
        }}
      >
        {/* Decoración: blob suave */}
        <div
          className="absolute -top-12 -right-12 h-40 w-40 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.10)" }}
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-8 -left-10 h-28 w-28 rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.07)" }}
          aria-hidden="true"
        />

        <div className="relative flex items-start gap-4">
          <m.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              delay: 0.1,
              type: "spring",
              stiffness: 220,
              damping: 16,
            }}
            className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 bg-white/20 backdrop-blur-sm"
          >
            <Sparkles className="h-7 w-7 text-white" strokeWidth={2.25} />
          </m.div>
          <div className="flex-1 min-w-0">
            <p className="text-base text-white/85 font-semibold leading-snug">
              ¡Casi listo
              {firstName !== "Sin nombre" ? `, ${firstName}` : ""}!
            </p>
            <p className="text-xs text-white/75 mt-0.5">
              Confirma los detalles abajo
            </p>
          </div>
        </div>

        <div className="relative mt-5 flex items-baseline justify-between gap-3">
          <span className="text-sm font-bold uppercase tracking-wider text-white/80">
            Total
          </span>
          <span className="text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums text-white">
            {fmt(finalTotal)}
          </span>
        </div>
        <div className="relative mt-2 inline-flex items-center gap-1.5 text-xs text-white/85">
          <Clock className="h-3.5 w-3.5" strokeWidth={2.25} />
          <span>
            {items.length} {items.length === 1 ? "producto" : "productos"} · entrega en ~25 min
          </span>
        </div>
      </div>

      {/* ─── TICKET — card brand-tinted con resumen ─── */}
      <div
        className="rounded-3xl overflow-hidden"
        style={{
          background:
            "color-mix(in oklch, var(--color-primary, #00A0A0) 4%, var(--color-card))",
          border:
            "1px solid color-mix(in oklch, var(--color-primary, #00A0A0) 22%, transparent)",
          boxShadow:
            "0 4px 12px -6px color-mix(in oklch, var(--color-primary, #00A0A0) 18%, transparent)",
        }}
      >
        <div className="px-5 sm:px-6 py-5 space-y-4">
          {/* Dirección */}
          {displayLocation && (
            <>
              <div className="space-y-2">
                <RowLabel
                  icon={MapPin}
                  action={
                    onEditAddress && (
                      <button
                        type="button"
                        onClick={onEditAddress}
                        className="inline-flex items-center gap-1 text-xs font-bold hover:underline underline-offset-2"
                        style={{
                          color: "var(--color-primary-dark, #009690)",
                        }}
                        data-testid="confirmar-editar-direccion"
                      >
                        <Pencil className="h-3 w-3" strokeWidth={2.5} />
                        Editar
                      </button>
                    )
                  }
                >
                  Entregaremos a
                </RowLabel>
                <div className="pl-5">
                  <p className="text-base font-bold text-[var(--text-primary)] leading-snug">
                    {displayLocation}
                  </p>
                  {displayReference && (
                    <p className="text-sm text-muted mt-0.5 leading-snug">
                      Referencia: {displayReference}
                    </p>
                  )}
                </div>
              </div>
              <BrandHair />
            </>
          )}

          {/* Cliente */}
          <div className="space-y-2">
            <RowLabel icon={Phone}>Cliente</RowLabel>
            <div className="pl-5">
              <p className="text-base font-bold text-[var(--text-primary)] truncate leading-tight">
                {displayName}
              </p>
              <div className="flex items-center gap-1.5 text-sm text-muted mt-0.5 tabular-nums">
                {displayPhone && <span>{displayPhone}</span>}
                {state.customer.dni && displayPhone && (
                  <span className="text-muted/50">·</span>
                )}
                {state.customer.dni && <span>DNI {state.customer.dni}</span>}
              </div>
            </div>
          </div>

          <BrandHair />

          {/* Método de pago */}
          <div className="space-y-2">
            <RowLabel icon={isYape ? CreditCard : Banknote}>
              Método de pago
            </RowLabel>
            <div className="pl-5 flex items-center gap-2 flex-wrap">
              <p className="text-base font-bold text-[var(--text-primary)]">
                {methodLabel}
              </p>
              {isYape && state.payment.yapeOpNumber && (
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded-md"
                  style={{
                    background:
                      "color-mix(in oklch, var(--color-primary, #00A0A0) 12%, transparent)",
                    color: "var(--color-primary-dark, #009690)",
                  }}
                >
                  Op {state.payment.yapeOpNumber}
                </span>
              )}
            </div>
          </div>

          <BrandHair />

          {/* Items con thumbnails */}
          <div className="space-y-3">
            <RowLabel
              icon={ShoppingBag}
              action={
                <button
                  type="button"
                  onClick={() => setItemsModalOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-bold hover:underline underline-offset-2"
                  style={{ color: "var(--color-primary-dark, #009690)" }}
                  aria-label="Ver detalle"
                >
                  <Eye className="h-3 w-3" strokeWidth={2.5} />
                  Ver detalle
                </button>
              }
            >
              Tu pedido · {items.length}{" "}
              {items.length === 1 ? "producto" : "productos"}
            </RowLabel>
            <div className="space-y-2.5 max-h-56 overflow-y-auto -mx-1 px-1">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-3">
                  <div
                    className="relative h-12 w-12 rounded-xl overflow-hidden shrink-0"
                    style={{
                      background:
                        "color-mix(in oklch, var(--color-primary, #00A0A0) 8%, var(--color-card))",
                      border:
                        "1px solid color-mix(in oklch, var(--color-primary, #00A0A0) 18%, transparent)",
                    }}
                  >
                    {i.image ? (
                      <Image
                        src={i.image}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <ShoppingBag
                          className="h-4 w-4"
                          style={{
                            color:
                              "var(--color-primary-dark, #009690)",
                          }}
                        />
                      </div>
                    )}
                    <span
                      className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1 rounded-full text-[length:var(--ts-2xs)] font-extrabold tabular-nums text-white"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                      }}
                    >
                      {i.quantity}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">
                      {i.name}
                    </p>
                    <p className="text-xs text-muted tabular-nums mt-0.5">
                      {fmt(i.price)} c/u
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-[var(--text-primary)] tabular-nums">
                    {fmt(i.price * i.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── TOTAL — barra brand sólida ─── */}
        <div className="space-y-1 px-5 sm:px-6 py-4"
          style={{
            background:
              "color-mix(in oklch, var(--color-primary, #00A0A0) 10%, transparent)",
            borderTop:
              "1px dashed color-mix(in oklch, var(--color-primary, #00A0A0) 35%, transparent)",
          }}
        >
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Subtotal</span>
              <span
                className="tabular-nums font-semibold"
                style={{ color: "var(--color-primary-dark, #009690)" }}
              >
                {fmt(cartTotal)}
              </span>
            </div>
            {discount > 0 && (
              <div className="flex items-center justify-between text-[var(--data-success-700)] dark:text-emerald-400">
                <span>Descuento</span>
                <span className="tabular-nums font-bold">
                  −{fmt(discount)}
                </span>
              </div>
            )}
            {state.coupon.discount > 0 && (
              <div className="flex items-center justify-between text-[var(--data-success-700)] dark:text-emerald-400">
                <span>Cupón aplicado</span>
                <span className="tabular-nums font-bold">
                  −{fmt(state.coupon.discount)}
                </span>
              </div>
            )}
            {state.payment.tip > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted">Propina</span>
                <span
                  className="tabular-nums font-semibold"
                  style={{ color: "var(--color-primary-dark, #009690)" }}
                >
                  +{fmt(state.payment.tip)}
                </span>
              </div>
            )}
          </div>
          <div
            className="pt-3 mt-2 flex items-baseline justify-between"
            style={{
              borderTop:
                "1px solid color-mix(in oklch, var(--color-primary, #00A0A0) 25%, transparent)",
            }}
          >
            <span
              className="text-sm font-extrabold uppercase tracking-wider"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              Total a pagar
            </span>
            <span
              className="tabular-nums text-3xl font-extrabold"
              style={{ color: "var(--color-primary-dark, #009690)" }}
            >
              {fmt(finalTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* ─── TIMELINE — qué pasa después ─── */}
      <div
        className="rounded-2xl px-4 py-3.5"
        style={{
          background:
            "color-mix(in oklch, var(--color-primary, #00A0A0) 5%, var(--color-card))",
        }}
      >
        <p
          className="text-xs font-extrabold uppercase tracking-wider mb-3 text-center"
          style={{ color: "var(--color-primary-dark, #009690)" }}
        >
          Qué pasa cuando confirmes
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Confirmamos", icon: Check, active: true },
            { label: "Preparamos", icon: ShoppingBag, active: false },
            { label: "En camino", icon: Truck, active: false },
          ].map((step, i) => (
            <div
              key={step.label}
              className="flex flex-col items-center text-center"
            >
              <div className="relative w-full flex items-center justify-center">
                {i < 2 && (
                  <span
                    className="absolute top-1/2 left-1/2 right-0 h-0.5 -translate-y-1/2"
                    style={{
                      background: step.active
                        ? "color-mix(in oklch, var(--color-primary, #00A0A0) 50%, transparent)"
                        : "color-mix(in oklch, var(--color-primary, #00A0A0) 18%, transparent)",
                    }}
                    aria-hidden="true"
                  />
                )}
                <div
                  className="relative h-10 w-10 rounded-full flex items-center justify-center"
                  style={
                    step.active
                      ? {
                          background:
                            "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
                          boxShadow:
                            "0 4px 12px -2px color-mix(in oklch, var(--color-primary, #00A0A0) 45%, transparent)",
                        }
                      : {
                          background: "var(--color-card)",
                          border:
                            "2px solid color-mix(in oklch, var(--color-primary, #00A0A0) 22%, transparent)",
                        }
                  }
                >
                  <step.icon
                    className="h-4 w-4"
                    strokeWidth={2.5}
                    style={{
                      color: step.active
                        ? "white"
                        : "var(--color-primary, #00A0A0)",
                    }}
                  />
                </div>
              </div>
              <p
                className="text-xs mt-2 leading-tight font-bold"
                style={{
                  color: step.active
                    ? "var(--color-primary-dark, #009690)"
                    : "var(--color-muted)",
                }}
              >
                {step.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <OrderItemsDetailModal
        open={itemsModalOpen}
        onClose={() => setItemsModalOpen(false)}
        items={items}
        finalTotal={finalTotal}
        cartTotal={cartTotal}
        discount={discount}
      />
    </m.div>
  );
}

export function StepConfirmarFooter({
  submitting,
  submitError,
  finalTotal,
  onBack,
  onConfirm,
  hasBlockingStockError = false,
  stockWarnings = [],
}: StepConfirmarFooterProps) {
  const isBlocked = submitting || hasBlockingStockError;

  return (
    <div className="px-5 sm:px-6 py-4">
      {hasBlockingStockError && stockWarnings.length > 0 && (
        <div className="mb-3 rounded-xl bg-red-50 dark:bg-red-950/20 px-4 py-2 border border-red-200/50 dark:border-red-800/30">
          <p className="text-sm font-medium text-[var(--data-error-700)] dark:text-red-400 mb-1">
            No se puede completar el pedido:
          </p>
          {stockWarnings.map((w, i) => (
            <p
              key={i}
              className="text-sm text-[var(--data-error-600)] dark:text-red-400"
            >
              • {w}
            </p>
          ))}
        </div>
      )}

      {submitError && (
        <p className="mb-3 rounded-xl bg-red-50 dark:bg-red-950/20 px-4 py-2 text-sm text-[var(--data-error-700)] dark:text-red-400 border border-red-200/50 dark:border-red-800/30">
          {submitError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex h-14 w-14 items-center justify-center rounded-2xl transition-all shrink-0 disabled:opacity-50"
          style={{
            border:
              "2px solid color-mix(in oklch, var(--color-primary, #00A0A0) 25%, transparent)",
            color: "var(--color-primary-dark, #009690)",
          }}
          aria-label="Volver al paso de pago"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={isBlocked}
          className="flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl font-extrabold text-base text-white transition-all active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)",
            boxShadow:
              "0 12px 28px color-mix(in oklch, var(--color-primary, #00A0A0) 40%, transparent), 0 2px 6px rgba(0,0,0,0.06)",
          }}
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Procesando…
            </>
          ) : (
            <>
              <ShoppingBag className="h-5 w-5" strokeWidth={2.25} />
              <span className="tracking-wide">
                Confirmar · {fmt(finalTotal)}
              </span>
            </>
          )}
        </button>
      </div>

      <div className="flex items-center justify-center gap-5 mt-4 text-xs font-bold uppercase tracking-wider text-muted">
        <span className="flex items-center gap-1.5">
          <Shield
            className="h-3.5 w-3.5"
            style={{ color: "var(--color-primary, #00A0A0)" }}
          />
          Compra segura
        </span>
        <span className="flex items-center gap-1.5">
          <Truck
            className="h-3.5 w-3.5"
            style={{ color: "var(--color-primary, #00A0A0)" }}
          />
          Delivery rápido
        </span>
        <span className="flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
          100% confiable
        </span>
      </div>
    </div>
  );
}
