"use client";

/**
 * ProductInfo — Bloque de identidad del producto en el PDP.
 *
 * Muestra: kicker tienda, H1 nombre, rating mock, ProductPrice DS,
 * stock indicator semántico, delivery estimate, métodos de pago.
 */

import Link from "next/link";
import { Star, Store, MapPin, Truck } from "@buleje/design-system/icons";
import { Kicker, BodyText, Caption, ProductPrice, ProductBadge } from "@buleje/design-system";
import { cn } from "@buleje/design-system";
import { SocioBadge } from "./SocioBadge";

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

// ── Rating stars ───────────────────────────────────────────────────────────────

function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5" aria-label={`${rating} de 5 estrellas`}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={cn(
              "h-4 w-4",
              s <= Math.round(rating)
                ? "text-[var(--text-primary)] fill-[var(--text-primary)]"
                : "text-[var(--rule-base)] fill-[var(--rule-base)]"
            )}
            aria-hidden
          />
        ))}
      </div>
      <Caption className="text-[var(--text-secondary)]">
        ({count} reseñas)
      </Caption>
    </div>
  );
}

// ── Stock indicator ────────────────────────────────────────────────────────────

function StockIndicator({ stock }: { stock: number | null | undefined }) {
  if (stock === null || stock === undefined || stock > 10) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        <Caption className="font-medium text-[var(--accent)]">En stock</Caption>
      </div>
    );
  }
  if (stock === 0) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-[var(--data-error-600)]" />
        <Caption className="font-medium text-[var(--data-error-600)]">Agotado</Caption>
      </div>
    );
  }
  // stock entre 1-10
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-[var(--data-warning-600)]" />
      <Caption className="font-medium text-[var(--data-warning-700)]">
        Quedan {stock} unidades
      </Caption>
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
  ratingAverage = 4.7,
  ratingCount = 24,
}: ProductInfoProps) {
  const hasDiscount = previousPrice != null && previousPrice > price;
  const discountPct = hasDiscount
    ? Math.round(((previousPrice! - price) / previousPrice!) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Kicker editorial: accent line + tienda */}
      <Link
        href={`/marketplace/${storeSlug}`}
        className="inline-flex items-center gap-2 group"
        aria-label={`Ver tienda ${storeName}`}
      >
        <span
          aria-hidden
          className="inline-flex h-[3px] w-10 rounded-full bg-[var(--accent)]"
        />
        <Store className="h-3.5 w-3.5 text-[var(--accent)]" />
        <span className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--accent)] group-hover:underline">
          {storeName}
          {storeZone && ` · ${storeZone}`}
          {storeKm && ` · ${storeKm}`}
        </span>
      </Link>

      {/* Nombre del producto — clamp editorial */}
      <h1 className="text-[clamp(2rem,4.5vw,3.25rem)] font-black tracking-[-0.035em] text-[var(--text-primary)] leading-[0.98]">
        {name}
      </h1>

      {/* Rating */}
      <StarRating rating={ratingAverage} count={ratingCount} />

      {/* Precio + badge oferta */}
      <div className="flex items-center gap-3 flex-wrap">
        <ProductPrice
          price={price}
          previousPrice={previousPrice ?? undefined}
          unit={unit ?? undefined}
          size="lg"
        />
        {hasDiscount && (
          <ProductBadge intent="offer">-{discountPct}%</ProductBadge>
        )}
        {badge && !hasDiscount && (
          <ProductBadge intent="fresh">{badge}</ProductBadge>
        )}
      </div>

      {/* Precio Socio Buleje — se muestra si hay socioPrice válido */}
      {socioPrice != null && socioPrice < price && (
        <SocioBadge regularPrice={price} socioPrice={socioPrice} />
      )}

      {/* Stock indicator */}
      <StockIndicator stock={stock} />

      {/* Delivery estimate */}
      <div className="flex items-center gap-2 py-2.5 px-3 rounded-lg bg-[var(--surface-sunken)] border border-[var(--rule-muted)]">
        <Truck className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
        <BodyText className="text-[var(--text-secondary)]">
          Llega en 25 min aprox
        </BodyText>
        <span className="text-[var(--rule-base)]">·</span>
        <div className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
          <Caption className="text-[var(--text-tertiary)]">Pucallpa</Caption>
        </div>
      </div>

      {/* Métodos de pago */}
      <div className="flex items-center gap-2 flex-wrap">
        <Caption className="text-[var(--text-tertiary)]">Acepta:</Caption>
        {["Yape", "Plin", "Efectivo"].map((method) => (
          <span
            key={method}
            className="px-2 py-0.5 rounded-md bg-[var(--surface-sunken)] border border-[var(--rule-muted)] text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)]"
          >
            {method}
          </span>
        ))}
      </div>
    </div>
  );
}
