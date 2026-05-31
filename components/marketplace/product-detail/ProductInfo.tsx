"use client";

/**
 * ProductInfo — Bloque de identidad del producto en el PDP.
 *
 * Muestra: kicker tienda, H1 nombre, rating mock, ProductPrice DS,
 * stock indicator semántico, delivery estimate, métodos de pago.
 */

import Link from "next/link";
import { Store, MapPin, Truck } from "@buleje/design-system/icons";
import { BodyText, Caption, ProductPrice, ProductBadge } from "@buleje/design-system";
import { SocioBadge } from "./SocioBadge";
import RatingStars from "@/components/ui-system/RatingStars";
import Tooltip from "@/components/ui-system/Tooltip";

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

// ── Stock indicator ────────────────────────────────────────────────────────────

function StockIndicator({ stock }: { stock: number | null | undefined }) {
  if (stock === null || stock === undefined || stock > 10) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)]/10 px-3 py-1.5 border border-[var(--accent)]/20">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)] animate-pulse" />
        <span className="text-sm font-semibold text-[var(--accent)]">En stock — listo para entregar</span>
      </div>
    );
  }
  if (stock === 0) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-[var(--data-error-600)]/10 px-3 py-1.5 border border-[var(--data-error-600)]/30">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-error-600)]" />
        <span className="text-sm font-semibold text-[var(--data-error-600)]">Agotado</span>
      </div>
    );
  }
  // stock entre 1-10
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-[var(--data-warning-600)]/10 px-3 py-1.5 border border-[var(--data-warning-600)]/30">
      <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-warning-600)] animate-pulse" />
      <span className="text-sm font-semibold text-[var(--data-warning-700)]">
        ¡Últimas {stock} unidades!
      </span>
    </div>
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
  badge,
  ratingAverage = 0,
  ratingCount = 0,
}: ProductInfoProps) {
  const hasRating = ratingCount > 0 && ratingAverage > 0;
  const hasDiscount = previousPrice != null && previousPrice > price;
  const discountPct = hasDiscount
    ? Math.round(((previousPrice! - price) / previousPrice!) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Kicker editorial: accent line + tienda — text-sm para legibilidad */}
      <Link
        href={`/marketplace/${storeSlug}`}
        className="inline-flex items-center gap-2.5 group"
        aria-label={`Ver tienda ${storeName}`}
      >
        <span
          aria-hidden
          className="inline-flex h-1 w-12 rounded-full bg-[var(--accent)]"
        />
        <Store className="h-5 w-5 text-[var(--accent)]" />
        <span className="text-sm font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] group-hover:underline">
          {storeName}
          {storeZone && ` · ${storeZone}`}
          {storeKm && ` · ${storeKm}`}
        </span>
      </Link>

      {/* Nombre del producto — clamp editorial más generoso */}
      <h1 className="text-[clamp(2.25rem,5vw,3.75rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[1.02]">
        {name}
      </h1>

      {/* Rating — solo mostrar si hay reseñas reales */}
      {hasRating && (
        <div className="flex items-center gap-3">
          <RatingStars value={ratingAverage} count={ratingCount} size="md" />
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            {ratingAverage.toFixed(1)} de 5 · {ratingCount} {ratingCount === 1 ? "reseña" : "reseñas"}
          </span>
        </div>
      )}

      {/* Precio + badge oferta — destacado en card sutil */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <ProductPrice
            price={price}
            previousPrice={previousPrice ?? undefined}
            unit={unit ?? undefined}
            size="lg"
          />
          {hasDiscount && (
            <ProductBadge intent="offer">-{discountPct}% OFF</ProductBadge>
          )}
          {badge && !hasDiscount && (
            <ProductBadge intent="fresh">{badge}</ProductBadge>
          )}
        </div>

        {/* Precio Socio Buleje */}
        {socioPrice != null && socioPrice < price && (
          <SocioBadge regularPrice={price} socioPrice={socioPrice} />
        )}

        {/* Stock indicator (pill prominente) */}
        <StockIndicator stock={stock} />
      </div>

      {/* Delivery estimate — más prominente, text-base */}
      <div className="flex items-center gap-3 py-3 px-4 rounded-xl bg-[var(--accent)]/5 border-2 border-[var(--accent)]/20">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/15 shrink-0">
          <Truck className="h-5 w-5 text-[var(--accent)]" />
        </div>
        <div className="flex-1 min-w-0">
          <Tooltip content="Tiempo estimado desde que la bodega confirma tu pedido">
            <p className="text-base font-semibold text-[var(--text-primary)] underline decoration-dotted decoration-[var(--accent)]/40 underline-offset-4 cursor-help">
              Llega en 25 min aprox
            </p>
          </Tooltip>
          <div className="flex items-center gap-1.5 mt-0.5">
            <MapPin className="h-4 w-4 text-[var(--text-tertiary)]" />
            <span className="text-sm text-[var(--text-secondary)]">Entrega en Ciudad Constitución</span>
          </div>
        </div>
      </div>

      {/* Métodos de pago — chips más grandes y legibles */}
      <div className="space-y-2.5">
        <p className="text-sm font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Métodos de pago aceptados
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {["Yape", "Plin", "Efectivo"].map((method) => (
            <span
              key={method}
              className="inline-flex items-center px-3.5 py-2 rounded-xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-base font-semibold text-[var(--text-primary)]"
            >
              {method}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
