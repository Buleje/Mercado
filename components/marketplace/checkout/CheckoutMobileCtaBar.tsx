"use client";

/**
 * CheckoutMobileCtaBar — barra fija inferior MOBILE-ONLY que muestra el
 * total del pedido + un CTA grande del paso actual del checkout.
 *
 * Brandon, mayo 14 2026: en celular el cliente no deberia tener que scrollear
 * hasta el final del form/listado para encontrar el boton "Continuar". Esta
 * barra se queda anclada al viewport bottom, accesible siempre con el pulgar.
 *
 * Reglas de uso:
 *   - Renderizar dentro de /marketplace/carrito y /checkout/**.
 *   - El padre ya oculta su CTA mobile interno (lg:hidden) para no duplicar.
 *   - StickyCartBar global se oculta automaticamente en /carrito y /checkout/*
 *     (ver components/marketplace/StickyCartBar.tsx).
 */

import Link from "next/link";
import { m as motion, AnimatePresence } from "framer-motion";
import { ArrowRight, AlertCircle, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

interface CheckoutMobileCtaBarProps {
  /** Etiqueta de la primera linea (ej. "Total" o "Tu pedido"). */
  primaryLabel?: string;
  /** Total visible debajo de la etiqueta. Si null, se omite la columna total. */
  total?: number | null;
  /** Texto del boton. */
  ctaLabel: string;
  /** Si hay href, renderiza Link (mejor pre-fetch). Si no, usa onClick. */
  ctaHref?: string;
  ctaOnClick?: () => void;
  ctaDisabled?: boolean;
  /** Mensaje sutil bajo el CTA para guiar al cliente (ej. "Pago al recibir"). */
  helperText?: string;
  /** Cuando el CTA esta disabled, este motivo se muestra a la izquierda. */
  disabledReason?: string;
  /** Mientras está true muestra spinner + deshabilita el botón — evita double-submit. */
  ctaLoading?: boolean;
}

export default function CheckoutMobileCtaBar({
  primaryLabel = "Total",
  total,
  ctaLabel,
  ctaHref,
  ctaOnClick,
  ctaDisabled = false,
  helperText,
  disabledReason,
  ctaLoading = false,
}: CheckoutMobileCtaBarProps) {
  const showTotal = typeof total === "number";

  const button = (
    <button
      type="button"
      onClick={ctaOnClick}
      disabled={ctaDisabled || ctaLoading}
      aria-busy={ctaLoading}
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-full h-12 px-5",
        "text-sm font-extrabold tracking-tight transition-opacity duration-200 shrink-0",
        "bg-[var(--accent)] text-white hover:opacity-90",
        "disabled:cursor-not-allowed disabled:opacity-60",
        showTotal ? "min-w-[10rem]" : "w-full",
      )}
    >
      {ctaLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : null}
      {ctaLabel}
      {!ctaLoading && <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
    </button>
  );

  return (
    <AnimatePresence>
      <motion.div
        key="checkout-mobile-cta-bar"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--surface-canvas)] border-t border-[var(--rule-base)] shadow-[0_-12px_30px_-12px_rgba(0,0,0,0.18)]"
        // padding-bottom safe-area iOS + BottomNav (60px) — solo lo aplicamos
        // si el bar global de bottom nav estuviera presente. En /checkout no
        // hay BottomNav, en /marketplace/carrito SI. Usamos calc generico via
        // class env(safe-area-inset-bottom) + extra padding pa cubrir ambos.
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px))",
        }}
        aria-label="Resumen y CTA del checkout"
      >
        <div className="flex items-center gap-3 px-4 py-3 max-w-screen-sm mx-auto">
          {showTotal && (
            <div className="flex flex-col min-w-0 leading-tight flex-1">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {primaryLabel}
              </span>
              <span className="text-lg font-black tabular-nums text-[var(--text-primary)]">
                {fmt(total ?? 0)}
              </span>
              {ctaDisabled && disabledReason ? (
                <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warn-600,#b45309)] leading-tight">
                  <AlertCircle className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                  {disabledReason}
                </span>
              ) : helperText ? (
                <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-tight truncate">
                  {helperText}
                </span>
              ) : null}
            </div>
          )}
          {ctaHref && !ctaOnClick ? (
            <Link
              href={ctaHref}
              className={cn(
                "group inline-flex items-center justify-center gap-2 rounded-full h-12 px-5",
                "text-sm font-extrabold tracking-tight transition-opacity duration-200 shrink-0",
                "bg-[var(--accent)] text-white hover:opacity-90",
                ctaDisabled && "pointer-events-none opacity-60",
                showTotal ? "min-w-[10rem]" : "w-full",
              )}
              aria-disabled={ctaDisabled || undefined}
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </Link>
          ) : (
            button
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
