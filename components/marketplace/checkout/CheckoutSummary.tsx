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
import Image from "next/image";
import {
  ShieldCheck,
  Truck,
  ArrowRight,
  CheckCircle2,
  TrendingDown,
  ChevronRight,
} from "@buleje/design-system/icons";
import { PaymentMethodIcon } from "@/components/marketplace/PaymentIcons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart, modifierHashOf } from "@/hooks/use-marketplace-cart";
import Tooltip from "@/components/ui-system/Tooltip";

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
  /**
   * Ahorro extra por ofertas (precio tachado vs precio actual).
   * Lo calcula quien usa el componente sumando (originalPrice - price) * qty
   * de los items que tengan basePrice. Es solo preview visual — no altera el total.
   */
  offerSavings?: number;
  showItems?: boolean;
  helperText?: string;
  /** Slot para CouponInput u otro widget encima del breakdown (ronda 4). */
  beforeBreakdown?: React.ReactNode;
  /**
   * Estilo del resumen:
   *  - "shop" (default): estilo AliExpress — miniaturas + breakdown
   *    "Total de artículos / Descuento / Subtotal / Envío / Estimación total"
   *    + bloques de confianza. Igual en carrito / datos / entrega.
   *  - "review": versión de revisión final (confirmar) — breakdown clásico.
   */
  variant?: "shop" | "review";
};

/**
 * TrustBlock — bloque "Entrega rápida" / "Seguridad & Privacidad" estilo
 * AliExpress: título con ícono + chevron, y bullets con check verde.
 * Definido ANTES de CheckoutSummary (no al final) para que Fast Refresh /
 * Turbopack no lo dejen como referencia no resuelta en bundles parciales.
 */
function TrustBlock({
  Icon,
  title,
  lines,
}: {
  Icon: typeof Truck;
  title: string;
  lines: string[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden />
        <span className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
          {title}
        </span>
        <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-[var(--text-tertiary)]" strokeWidth={2} aria-hidden />
      </div>
      <ul className="mt-1.5 space-y-1 pl-6">
        {lines.map((l) => (
          <li
            key={l}
            className="flex items-start gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-snug"
          >
            <CheckCircle2
              className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--data-success-600)]"
              strokeWidth={2.25}
              aria-hidden
            />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CheckoutSummary({
  ctaLabel,
  ctaHref,
  onCtaClick,
  ctaDisabled = false,
  ctaLoading = false,
  couponDiscount = 0,
  loyaltyDiscount = 0,
  offerSavings = 0,
  showItems = false,
  helperText,
  beforeBreakdown,
  variant = "shop",
}: SummaryProps) {
  const { byStore, grandTotal, itemCount, items } = useMarketplaceCart();
  const storeIds = Object.keys(byStore);
  const subtotal = grandTotal;
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : subtotal > 0 ? 5 : 0;
  const total = Math.max(0, subtotal - couponDiscount - loyaltyDiscount + shipping);

  // Ahorro por ofertas: suma (basePrice - price) * qty de items que tengan basePrice > price.
  // Es preview visual puro — no entra al cálculo del total real.
  const offerSavingsCalc = offerSavings > 0
    ? offerSavings
    : items.reduce((acc, i) => {
        if (i.basePrice != null && i.basePrice > i.price) {
          acc += (i.basePrice - i.price) * i.quantity;
        }
        return acc;
      }, 0);
  const totalSavings = offerSavingsCalc + couponDiscount + loyaltyDiscount;
  const hasSavings = totalSavings > 0.005; // evitar mostrar S/0.00
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
    "group inline-flex w-full items-center justify-center rounded-full px-6 h-13",
    "text-base font-bold tracking-[var(--ls-tight)] transition-opacity duration-200",
    "bg-[var(--accent)] text-white hover:opacity-90",
    "disabled:cursor-not-allowed disabled:opacity-60",
  );

  // ── Variante "shop" (AliExpress) — carrito / datos / entrega ──────────
  if (variant === "shop") {
    return (
      <aside
        aria-label="Resumen del pedido"
        className={cn(
          "lg:sticky lg:top-24 lg:self-start",
          "rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-sm",
          "p-5 space-y-4",
        )}
      >
        <h2 className="text-xl font-bold tracking-[var(--ls-tight)] text-[var(--text-primary)]">
          Resumen
        </h2>

        {/* Miniaturas de los productos (estilo AliExpress) */}
        {!isEmpty && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {items.slice(0, 6).map((it, idx) => (
              <span
                key={`thumb-${idx}-${it.productId}`}
                className="relative h-11 w-11 shrink-0 rounded-lg overflow-hidden border border-[var(--rule-soft)] bg-[var(--surface-sunken)]"
              >
                {it.image ? (
                  <Image src={it.image} alt={it.name} fill sizes="44px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm font-black uppercase text-[var(--accent)]">
                    {it.name.trim().charAt(0)}
                  </span>
                )}
                {it.quantity > 1 && (
                  <span className="absolute bottom-0 right-0 bg-black/65 px-1 text-[9px] font-bold text-white leading-tight tabular-nums">
                    ×{it.quantity}
                  </span>
                )}
              </span>
            ))}
            {items.length > 6 && (
              <span className="shrink-0 text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)]">
                +{items.length - 6}
              </span>
            )}
          </div>
        )}

        {!isEmpty && beforeBreakdown && <div>{beforeBreakdown}</div>}

        {!isEmpty ? (
          <dl className="space-y-2.5 text-[length:var(--ts-sm)] border-t border-[var(--rule-soft)] pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[var(--text-secondary)]">Total de artículos</dt>
              <dd className="tabular-nums text-[var(--text-secondary)]">
                {offerSavingsCalc > 0 && (
                  <span className="line-through text-[var(--text-tertiary)] mr-1.5">
                    {fmt(subtotal + offerSavingsCalc)}
                  </span>
                )}
                {fmt(subtotal)}
              </dd>
            </div>
            {totalSavings > 0.005 && (
              <div className="flex items-baseline justify-between gap-3 text-[var(--data-error-600)]">
                <dt>Descuento de artículos</dt>
                <dd className="tabular-nums font-semibold">−{fmt(totalSavings)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-semibold text-[var(--text-primary)]">Subtotal</dt>
              <dd className="font-bold tabular-nums text-[var(--text-primary)]">
                {fmt(Math.max(0, subtotal - couponDiscount - loyaltyDiscount))}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                <Truck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Envío
              </dt>
              <dd>
                {shipping === 0 ? (
                  <span className="font-bold uppercase text-[length:var(--ts-xs)] tracking-[var(--ls-wider)] text-[var(--accent)]">
                    Gratis
                  </span>
                ) : (
                  <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(shipping)}</span>
                )}
              </dd>
            </div>
            {remainingForFree > 0 && subtotal > 0 && (
              <div className="space-y-1.5">
                <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] leading-snug">
                  Agregá{" "}
                  <span className="font-bold tabular-nums text-[var(--text-primary)]">
                    {fmt(remainingForFree)}
                  </span>{" "}
                  más para <span className="font-semibold text-[var(--accent)]">envío gratis</span>
                </p>
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
          </dl>
        ) : (
          <p className="text-sm text-[var(--text-tertiary)]">No hay productos en tu carrito.</p>
        )}

        {/* Estimación total */}
        {!isEmpty && (
          <div className="flex items-end justify-between gap-3 border-t border-[var(--rule-soft)] pt-4">
            <span className="text-[length:var(--ts-sm)] font-semibold text-[var(--text-primary)]">
              Estimación total
            </span>
            <span className="text-2xl font-black tabular-nums tracking-[-0.02em] text-[var(--text-primary)] leading-none">
              {fmt(total)}
            </span>
          </div>
        )}

        {/* CTA */}
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

        {/* Bloques de confianza (estilo AliExpress, contenido real Buleje) */}
        {!isEmpty && (
          <div className="space-y-3 border-t border-[var(--rule-soft)] pt-4">
            <TrustBlock
              Icon={Truck}
              title="Entrega rápida"
              lines={["Delivery en ~25 min", "Pago al recibir o por Yape", "Coordinas todo por WhatsApp"]}
            />
            <TrustBlock
              Icon={ShieldCheck}
              title="Seguridad & Privacidad"
              lines={["Pago seguro", "Tus datos personales protegidos"]}
            />
            {/* Medios de pago con ícono de marca (arte original) */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)]">
                Aceptamos
              </span>
              <span className="flex items-center gap-1.5">
                <PaymentMethodIcon method="yape" size={22} title="Yape" />
                <PaymentMethodIcon method="plin" size={22} title="Plin" />
                <PaymentMethodIcon method="efectivo" size={22} title="Efectivo" />
              </span>
            </div>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside
      aria-label="Resumen del pedido"
      className={cn(
        "lg:sticky lg:top-24 lg:self-start",
        "rounded-none border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
        "p-5 space-y-5",
      )}
    >
      {/* ── Kicker editorial (más grande) ──────────────────────── */}
      <header>
        <p className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-2">
          <span
            aria-hidden
            className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
          />
          Resumen
        </p>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-2xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
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
              <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
                {byStore[sid].storeName}
              </p>
              <ul className="space-y-1.5 text-sm">
                {byStore[sid].items.map((it) => (
                  <li
                    key={`${it.storeId}-${it.productId}-${it.modifierHash ?? modifierHashOf(it.modifiers)}`}
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

      {/* ── Slot ronda 4 (CouponInput, etc) ───────────────────────── */}
      {!isEmpty && beforeBreakdown && (
        <div>{beforeBreakdown}</div>
      )}

      {/* ── Breakdown (uppercase 11px, valores base) ─────────────── */}
      {!isEmpty ? (
        <dl className="space-y-3 text-base border-t border-[var(--rule-soft)] pt-4">
          <div className="flex items-baseline justify-between">
            <dt className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Subtotal
            </dt>
            <dd className="font-black text-[var(--text-primary)] tabular-nums text-lg">
              {fmt(subtotal)}
            </dd>
          </div>
          {couponDiscount > 0 && (
            <div className="flex items-baseline justify-between text-[var(--accent)]">
              <dt className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)]">
                Cupones
              </dt>
              <dd className="font-black tabular-nums text-lg">−{fmt(couponDiscount)}</dd>
            </div>
          )}
          {loyaltyDiscount > 0 && (
            <div className="flex items-baseline justify-between text-[var(--accent)]">
              <dt className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)]">
                Puntos canjeados
              </dt>
              <dd className="font-black tabular-nums text-lg">−{fmt(loyaltyDiscount)}</dd>
            </div>
          )}
          {/* ── Línea de ahorro total (preview visual, no altera total backend) ─── */}
          {hasSavings && (
            <div
              aria-label={`Estás ahorrando ${fmt(totalSavings)}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-[var(--data-success-50,var(--accent-soft))] px-4 py-2.5 border border-[var(--data-success-200,var(--accent))/30]"
            >
              <span className="inline-flex items-center gap-2 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-success-600)]">
                <TrendingDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
                Estás ahorrando
              </span>
              <span className="tabular-nums font-black text-lg text-[var(--data-success-600)]">
                {fmt(totalSavings)}
              </span>
            </div>
          )}

          <div className="flex items-baseline justify-between">
            <dt className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              <Truck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              <Tooltip content={`Envío gratis desde S/${FREE_SHIPPING_THRESHOLD}`}>
                <span className="underline decoration-dotted cursor-help">Envío</span>
              </Tooltip>
            </dt>
            <dd>
              {shipping === 0 ? (
                <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[length:var(--ts-xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
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
                <p className="font-bold uppercase tracking-[var(--ls-wider)] text-[length:var(--ts-2xs)] text-[var(--accent)]">
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
              Ya tienes envío gratis
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
        <div className="relative pt-4">
          <span
            aria-hidden
            className="absolute left-0 top-0 h-px w-full bg-[var(--rule-soft)]"
          />
          <div className="flex items-end justify-between gap-3">
            <span className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2">
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
        <ul className="flex items-center justify-between gap-2 border-t border-[var(--rule-soft)] pt-4">
          {[
            { Icon: ShieldCheck, label: "Seguro" },
            { Icon: Truck, label: "25 min" },
          ].map(({ Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)]"
            >
              <Icon className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
              {label}
            </li>
          ))}
          {/* Íconos de marca para los pagos (arte original) */}
          <li className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] py-1 pl-1 pr-3 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)]">
            <PaymentMethodIcon method="yape" size={18} />
            <PaymentMethodIcon method="plin" size={18} />
            Yape · Plin
          </li>
        </ul>
      )}
    </aside>
  );
}
