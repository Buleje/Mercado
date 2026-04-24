"use client";

/**
 * CheckoutSummary — columna sticky derecha con resumen del pedido.
 *
 * Versión con tipografía AMPLIADA (user reportó letras muy chicas):
 *   - Kicker 11px (antes 10)
 *   - Título "Tu pedido" 2xl (antes xl)
 *   - Items font-sm (antes xs)
 *   - Labels breakdown 11px (antes 10)
 *   - Valores base (antes sm)
 *   - Total clamp(2rem, 3.5vw, 2.75rem) (antes 1.75/3vw/2.25)
 *   - CTA h-14 text-base (antes h-12 sm)
 *   - Chips trust 11px (antes 10)
 */

import Link from "next/link";
import {
  ShieldCheck,
  Truck,
  ArrowRight,
  Smartphone,
  CheckCircle2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

const FREE_SHIPPING_THRESHOLD = 50;

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export type SummaryProps = {
  ctaLabel: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
  couponDiscount?: number;
  loyaltyDiscount?: number;
  showItems?: boolean;
  helperText?: string;
};

export default function CheckoutSummary({
  ctaLabel,
  ctaHref,
  onCtaClick,
  ctaDisabled = false,
  ctaLoading = false,
  couponDiscount = 0,
  loyaltyDiscount = 0,
  showItems = false,
  helperText,
}: SummaryProps) {
  const { byStore, grandTotal, itemCount } = useMarketplaceCart();
  const storeIds = Object.keys(byStore);
  const subtotal = grandTotal;
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : subtotal > 0 ? 5 : 0;
  const total = Math.max(0, subtotal - couponDiscount - loyaltyDiscount + shipping);
  const remainingForFree = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  const isEmpty = itemCount === 0;

  const ctaInner = ctaLoading ? (
    <span className="inline-flex items-center gap-2">
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
        <path
          d="M4 12a8 8 0 018-8"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="opacity-75"
        />
      </svg>
      Procesando...
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 group-hover:gap-3 transition-all duration-200">
      {ctaLabel}
      <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />
    </span>
  );

  const ctaCls = cn(
    "group inline-flex w-full items-center justify-center rounded-full px-6 h-14",
    "text-base font-bold tracking-[-0.01em] transition-all duration-200",
    "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90",
    "shadow-[0_6px_20px_-10px_var(--accent)] hover:shadow-[0_10px_28px_-10px_var(--accent)]",
    "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
  );

  return (
    <aside
      aria-label="Resumen del pedido"
      className={cn(
        "lg:sticky lg:top-24 lg:self-start",
        "rounded-2xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)]",
        "p-7 space-y-6",
      )}
    >
      {/* ── Kicker editorial (más grande) ──────────────────────── */}
      <header>
        <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--accent)] mb-2">
          <span
            aria-hidden
            className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
          />
          Resumen
        </p>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-2xl font-black tracking-[-0.02em] text-[var(--text-primary)]">
            Tu pedido
          </h2>
          {!isEmpty && (
            <span className="text-sm font-bold text-[var(--text-tertiary)] tabular-nums">
              {itemCount} {itemCount === 1 ? "producto" : "productos"}
            </span>
          )}
        </div>
      </header>

      {/* ── Items detallados (base size) ────────────────────────── */}
      {!isEmpty && showItems && (
        <ul className="max-h-72 overflow-y-auto -mx-2 px-2 divide-y divide-[var(--rule-soft)]">
          {storeIds.map((sid) => (
            <li key={sid} className="py-3 first:pt-0 last:pb-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2">
                {byStore[sid].storeName}
              </p>
              <ul className="space-y-1.5 text-sm">
                {byStore[sid].items.map((it) => (
                  <li
                    key={`${it.storeId}-${it.productId}`}
                    className="flex justify-between gap-3 text-[var(--text-secondary)]"
                  >
                    <span className="truncate">
                      <span className="tabular-nums font-bold text-[var(--text-primary)] mr-1.5">
                        {it.quantity}×
                      </span>
                      {it.name}
                    </span>
                    <span className="tabular-nums shrink-0 font-bold text-[var(--text-primary)]">
                      {fmt(it.price * it.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {/* ── Breakdown (uppercase 11px, valores base) ─────────────── */}
      {!isEmpty ? (
        <dl className="space-y-3 text-base border-t border-[var(--rule-soft)] pt-5">
          <div className="flex items-baseline justify-between">
            <dt className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              Subtotal
            </dt>
            <dd className="font-black text-[var(--text-primary)] tabular-nums text-lg">
              {fmt(subtotal)}
            </dd>
          </div>
          {couponDiscount > 0 && (
            <div className="flex items-baseline justify-between text-[var(--accent)]">
              <dt className="text-[11px] font-bold uppercase tracking-[0.18em]">
                Cupones
              </dt>
              <dd className="font-black tabular-nums text-lg">−{fmt(couponDiscount)}</dd>
            </div>
          )}
          {loyaltyDiscount > 0 && (
            <div className="flex items-baseline justify-between text-[var(--accent)]">
              <dt className="text-[11px] font-bold uppercase tracking-[0.18em]">
                Puntos canjeados
              </dt>
              <dd className="font-black tabular-nums text-lg">−{fmt(loyaltyDiscount)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <dt className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
              <Truck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Envío
            </dt>
            <dd>
              {shipping === 0 ? (
                <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--accent)]">
                  Gratis
                </span>
              ) : (
                <span className="font-black text-[var(--text-primary)] tabular-nums text-lg">
                  {fmt(shipping)}
                </span>
              )}
            </dd>
          </div>
          {remainingForFree > 0 && subtotal > 0 && (
            <div className="-mt-1 space-y-1.5">
              <div className="flex items-baseline justify-between text-xs">
                <p className="text-[var(--text-tertiary)] leading-snug">
                  Agregá{" "}
                  <span className="font-bold tabular-nums text-[var(--text-primary)]">
                    {fmt(remainingForFree)}
                  </span>{" "}
                  más
                </p>
                <p className="font-bold uppercase tracking-[0.14em] text-[10px] text-[var(--accent)]">
                  Envío gratis
                </p>
              </div>
              {/* Progress bar visual */}
              <div
                aria-hidden
                className="h-1.5 w-full rounded-full bg-[var(--surface-sunken)] overflow-hidden"
              >
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}
          {shipping === 0 && subtotal >= FREE_SHIPPING_THRESHOLD && (
            <p className="text-xs font-bold text-[var(--accent)] -mt-1 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              Ya tenés envío gratis
            </p>
          )}
        </dl>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">
          No hay productos en tu carrito.
        </p>
      )}

      {/* ── Total — hero clamp más grande ─────────────────────────── */}
      {!isEmpty && (
        <div className="relative pt-5">
          <span
            aria-hidden
            className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-[var(--accent)]/60 to-transparent"
          />
          <div className="flex items-end justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--text-tertiary)] mb-2">
              Total a pagar
            </span>
            <span className="text-[clamp(2rem,3.5vw,2.75rem)] font-black tabular-nums tracking-[-0.035em] text-[var(--text-primary)] leading-none">
              {fmt(total)}
            </span>
          </div>
        </div>
      )}

      {/* ── CTA (h-14 base) ───────────────────────────────────────── */}
      {!isEmpty && ctaHref && (
        <Link href={ctaHref} className={ctaCls}>
          {ctaInner}
        </Link>
      )}
      {!isEmpty && !ctaHref && (
        <button
          type="button"
          onClick={onCtaClick}
          disabled={ctaDisabled || ctaLoading}
          className={ctaCls}
        >
          {ctaInner}
        </button>
      )}

      {!isEmpty && helperText && (
        <p className="text-xs text-center text-[var(--text-tertiary)] leading-relaxed">
          {helperText}
        </p>
      )}

      {/* ── Trust chips (11px) ─────────────────────────────────────── */}
      {!isEmpty && (
        <ul className="flex items-center justify-between gap-2 border-t border-[var(--rule-soft)] pt-5">
          {[
            { Icon: ShieldCheck, label: "Seguro" },
            { Icon: Truck, label: "25 min" },
            { Icon: Smartphone, label: "Yape / Plin" },
          ].map(({ Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-2 text-[11px] font-bold text-[var(--text-secondary)]"
            >
              <Icon className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
