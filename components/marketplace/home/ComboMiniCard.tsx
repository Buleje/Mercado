"use client";

/**
 * ComboMiniCard — card mínima para las cajas de descubrimiento de la home
 * (Brandon 2026-06-14, estilo AliExpress "Combo Ahorro"). SIN bordes, SIN botón
 * de carrito: todo libre. Al pasar el mouse se pinta un fondo gris suave. Más
 * chica que UnifiedProductCard (imagen + nombre 2 líneas + precio + ★rating ·
 * vendidos). Click → detalle del producto.
 */

import Image from "next/image";
import Link from "next/link";
import { Star } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { ProductPhotoFallback } from "@/components/marketplace/ProductPhotoFallback";
import type { UnifiedProductCardProduct } from "@/components/marketplace/UnifiedProductCard";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

function soldLabel(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 1000)}mil+ vendidos`;
  return `${n} vendidos`;
}

export default function ComboMiniCard({
  product,
  href,
  rank,
  soldUnits,
}: {
  product: UnifiedProductCardProduct;
  href: string;
  index?: number;
  /** Posición en el ranking (caja "Lo más pedido"). */
  rank?: number;
  /** Unidades vendidas (dato real del ranking). */
  soldUnits?: number;
}) {
  const hasDiscount = product.originalPrice != null && product.originalPrice > product.price;
  const rating = product.storeRating ?? 0;
  const sold = soldUnits ?? 0;

  return (
    <Link
      href={href}
      className="group block rounded-lg p-1.5 transition-colors hover:bg-[var(--surface-sunken)]"
    >
      {/* Imagen */}
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-white">
        {rank != null && (
          <span className="absolute left-1.5 top-1.5 z-10 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-sm bg-[var(--text-primary)]/85 px-1 text-[length:var(--ts-2xs)] font-bold tabular-nums text-white">
            {rank}
          </span>
        )}
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 30vw, 180px"
            className="object-contain p-1.5 transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <ProductPhotoFallback name={product.name} category={product.category} />
        )}
      </div>

      {/* Nombre — 2 líneas, tipografía suave */}
      <h3 className="mt-1.5 min-h-[2.25rem] text-[length:var(--ts-xs)] leading-snug text-[var(--text-secondary)] line-clamp-2 sm:text-sm">
        {product.name}
      </h3>

      {/* Precio — rojo si hay oferta (tachado), si no primary */}
      <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
        <span
          className={cn(
            "text-sm font-bold tabular-nums sm:text-base",
            hasDiscount ? "text-[var(--data-error-600)]" : "text-[var(--text-primary)]",
          )}
        >
          {fmt(product.price)}
        </span>
        {hasDiscount && (
          <span className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] line-through tabular-nums">
            {fmt(product.originalPrice!)}
          </span>
        )}
      </div>

      {/* Meta — ★rating · vendidos (solo con dato real) */}
      {(rating > 0 || sold > 0) && (
        <p className="mt-0.5 flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          {rating > 0 && (
            <>
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" strokeWidth={0} aria-hidden />
              <span className="font-medium text-[var(--text-secondary)] tabular-nums">{rating.toFixed(1)}</span>
            </>
          )}
          {rating > 0 && sold > 0 && <span aria-hidden>·</span>}
          {sold > 0 && <span className="tabular-nums">{soldLabel(sold)}</span>}
        </p>
      )}
    </Link>
  );
}
