"use client";

/**
 * ProductInfo — Bloque de identidad del producto en el PDP.
 * Rediseño Brandon 2026-06-14: estilo MercadoLibre — bordes RECTOS, tipografía
 * suave (sin font-black), sin colores neón (sin tintes accent/10 de fondo).
 */

import Link from "next/link";
import { Store, Truck, Tag, Smartphone } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { SocioBadge } from "./SocioBadge";
import RatingStars from "@/components/ui-system/RatingStars";
import { PaymentMethodIcon } from "@/components/marketplace/PaymentIcons";

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface ProductInfoProps {
  name: string;
  storeName: string;
  storeSlug: string;
  storeZone?: string | null;
  storeKm?: string | null;
  price: number;
  previousPrice?: number | null;
  /** Precio exclusivo para Socios Buleje; si es menor a `price`, se muestra SocioBadge. */
  socioPrice?: number | null;
  unit?: string | null;
  stock?: number | null;
  category?: string | null;
  badge?: string | null;
  ratingAverage?: number;
  ratingCount?: number;
}

// ── Stock indicator (chip recto, sin pulso neón) ─────────────────────────────────

function StockIndicator({ stock }: { stock: number | null | undefined }) {
  if (stock === null || stock === undefined || stock > 10) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-[var(--accent)]">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        En stock — listo para entregar
      </span>
    );
  }
  if (stock === 0) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-[var(--data-error-600)]">
        <span className="h-2 w-2 rounded-full bg-[var(--data-error-600)]" />
        Agotado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-sm text-[var(--data-warning-700)]">
      <span className="h-2 w-2 rounded-full bg-[var(--data-warning-600)]" />
      ¡Últimas {stock} unidades!
    </span>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export function ProductInfo({
  name,
  storeName,
  storeSlug,
  storeZone,
  storeKm,
  price,
  previousPrice,
  socioPrice,
  unit,
  stock,
  ratingAverage = 0,
  ratingCount = 0,
}: ProductInfoProps) {
  const hasRating = ratingCount > 0 && ratingAverage > 0;
  const hasDiscount = previousPrice != null && previousPrice > price;
  const discountPct = hasDiscount
    ? Math.round(((previousPrice! - price) / previousPrice!) * 100)
    : 0;

  return (
    <div className="space-y-3">
      {/* Tienda — kicker chico */}
      <Link
        href={`/marketplace/${storeSlug}`}
        className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--accent)] hover:underline"
        aria-label={`Ver tienda ${storeName}`}
      >
        <Store className="h-3.5 w-3.5" aria-hidden />
        {storeName}
        {storeZone && ` · ${storeZone}`}
        {storeKm && ` · ${storeKm}`}
      </Link>

      {/* Título — suave (sin font-black) */}
      <h1 className="text-lg sm:text-xl font-medium leading-snug text-[var(--text-primary)]">
        {name}
      </h1>

      {/* Rating + valoraciones — SIEMPRE visible */}
      <div className="flex items-center gap-2 text-sm">
        <RatingStars value={hasRating ? ratingAverage : 0} count={ratingCount} size="sm" />
        {hasRating ? (
          <span className="text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)] tabular-nums">{ratingAverage.toFixed(1)}</span>
            {" · "}
            {ratingCount} {ratingCount === 1 ? "valoración" : "valoraciones"}
          </span>
        ) : (
          <span className="text-[var(--text-tertiary)]">Nuevo · sé el primero en opinar</span>
        )}
      </div>

      <div className="border-t border-[var(--rule-soft)]" />

      {/* Precio — estilo MercadoLibre: grande pero tipografía suave, sin caja neón */}
      <div className="space-y-1">
        {hasDiscount && (
          <span className="inline-flex items-center rounded-sm bg-[var(--data-error-500)] px-2 py-0.5 text-[length:var(--ts-xs)] font-semibold uppercase tracking-wide text-white">
            Oferta −{discountPct}%
          </span>
        )}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className={cn(
              "text-3xl font-semibold tabular-nums tracking-tight",
              hasDiscount ? "text-[var(--data-error-600)]" : "text-[var(--text-primary)]",
            )}
          >
            {fmt(price)}
          </span>
          {unit && <span className="text-sm text-[var(--text-tertiary)]">/ {unit}</span>}
          {hasDiscount && (
            <span className="text-base text-[var(--text-tertiary)] line-through tabular-nums">
              {fmt(previousPrice!)}
            </span>
          )}
        </div>
        {hasDiscount && (
          <p className="inline-flex items-center gap-1.5 rounded-sm bg-[var(--data-success-50,#ecfdf5)] dark:bg-[var(--data-success-500)]/10 px-2.5 py-1 text-sm font-semibold text-[var(--data-success-700,#047857)]">
            <Tag className="h-4 w-4 shrink-0" aria-hidden />
            Ahorras {fmt(previousPrice! - price)} ({discountPct}%)
          </p>
        )}
        <p className="flex items-center gap-1.5 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
          <Smartphone className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
          Paga con <span className="font-semibold text-[var(--text-secondary)]">Yape</span>, Plin o efectivo al recibir
        </p>
        {socioPrice != null && socioPrice < price && (
          <div className="pt-1">
            <SocioBadge regularPrice={price} socioPrice={socioPrice} />
          </div>
        )}
        <div className="pt-1">
          <StockIndicator stock={stock} />
        </div>
      </div>

      <div className="border-t border-[var(--rule-soft)]" />

      {/* Delivery — honesto: zona real + pago contra entrega (sin ETA inventado) */}
      <div className="flex items-start gap-2.5 text-sm">
        <Truck className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="font-medium text-[var(--text-primary)]">
            Entrega a domicilio{storeZone ? <> en <span className="capitalize">{storeZone}</span></> : null}
          </p>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            Pago contra entrega · coordinas la hora al confirmar tu pedido
          </p>
        </div>
      </div>

      {/* Métodos de pago — ícono de marca + wordmark */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">Pago:</span>
        {["Yape", "Plin", "Efectivo"].map((method) => (
          <span
            key={method}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] py-1 pl-1 pr-2.5 text-sm text-[var(--text-secondary)]"
          >
            <PaymentMethodIcon method={method} size="sm" />
            {method}
          </span>
        ))}
      </div>
    </div>
  );
}
