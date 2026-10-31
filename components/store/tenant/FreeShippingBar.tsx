"use client";

/**
 * FreeShippingBar — barra de progreso "envío gratis" para la tienda individual.
 *
 * Lee el carrito (cart-context) y muestra cuánto falta para alcanzar el umbral
 * de envío gratis del comercio. Palanca de conversión clásica de e-commerce:
 * empuja al cliente a sumar un producto más para no pagar delivery.
 *
 * Opt-in por tienda (ADR-298): se monta en el chrome `(store)` solo si el flag
 * "shipping" está en settings.storeTheme.features. El umbral vive en
 * settings.storeTheme.freeShippingThreshold (S/). Usa la marca del tenant
 * (var(--color-primary)) para la barra. Copy en tuteo peruano.
 */

import { useCart } from "@/contexts/cart-context";
import { Truck, Check } from "@buleje/design-system/icons";

const fmt = (n: number) => `S/${n.toFixed(2)}`;

export default function FreeShippingBar({ threshold }: { threshold: number }) {
  const { items } = useCart();
  if (!Number.isFinite(threshold) || threshold <= 0) return null;

  const total = items.reduce((s, i) => s + i.quantity * i.price, 0);
  const reached = total >= threshold;
  const remaining = Math.max(0, threshold - total);
  const pct = Math.min(100, Math.round((total / threshold) * 100));

  return (
    <div
      className="sticky top-14 md:top-16 z-30 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]/95 backdrop-blur"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto max-w-[1280px] px-4 py-2">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: "var(--color-primary)" }}
            aria-hidden
          >
            {reached ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Truck className="h-4 w-4" strokeWidth={2.25} />}
          </span>
          <p className="min-w-0 flex-1 text-sm font-bold text-[var(--text-primary)] leading-tight">
            {total === 0 ? (
              <>Envío <span style={{ color: "var(--color-primary)" }}>gratis</span> en pedidos desde {fmt(threshold)}</>
            ) : reached ? (
              <>¡Listo! Ya tienes <span style={{ color: "var(--color-primary)" }}>envío gratis</span></>
            ) : (
              <>Te faltan <span style={{ color: "var(--color-primary)" }}>{fmt(remaining)}</span> para el envío gratis</>
            )}
          </p>
        </div>
        {/* Barra de progreso — solo cuando hay algo en el carrito y aún no llega. */}
        {total > 0 && !reached && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className="h-full rounded-full transition-[width] duration-[var(--dur-slower)]"
              style={{ width: `${pct}%`, background: "var(--color-primary)" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
