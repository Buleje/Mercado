"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  PurchaseProduct,
  calculateSuggestedQty,
  needsReorder,
} from "@/lib/types/purchases";
import { formatCurrency } from "@/lib/format";

interface PuntoCompraProductCardProps {
  product: PurchaseProduct;
  inCart: number;
  onAdd: (product: PurchaseProduct, qty: number) => void;
}

export default memo(function PuntoCompraProductCard({
  product,
  inCart,
  onAdd,
}: PuntoCompraProductCardProps) {
  const suggestedQty = calculateSuggestedQty(product);
  const targetStock = product.stockMax ?? (((product.stockMin ?? 0) * 3) || 10);

  const displayName = product.name || "Sin nombre";

  // Costo de la ficha, nunca el precio de venta (auditoría Compras O03: se veía S/35 de venta como costo).
  const costoFicha = product.costPrice != null && product.costPrice > 0 ? product.costPrice : null;
  // Distinguir "sin control de stock" (stock null → servicios/gastos como
  // "Aserrado de madera") de "agotado" (rastreado y en 0). En un Punto de
  // COMPRA, un producto agotado es justamente lo que querés pedir → la tarjeta
  // SIEMPRE agrega al carrito. Antes se deshabilitaba y el clic no hacía nada
  // sin ninguna explicación (reporte QA Compras 2026-07-08).
  const isOutOfStock = product.stock === 0;

  // Dos acciones a la vista (auditoría Compras O02/C02): antes un clic en la
  // tarjeta sumaba TODA la sugerencia (21 unidades) sin decirlo.
  const unidad = product.unit || "und";
  const botonCls = "h-10 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 transition-all bg-[var(--surface-raised)]",
        "text-left w-full hover:shadow-sm hover:border-primary/50",
      )}
    >
      {/* Badge AGOTADO / REPONER — bg neutro, color solo en dot + texto.
          AGOTADO solo si el stock está RASTREADO en 0 (no si es null/sin control). */}
      {isOutOfStock ? (
        <span role="img"
          aria-label="Producto agotado"
          className="absolute top-2 left-2 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--data-error-500)]/30 text-[var(--data-error-500)] z-10"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-error-500)]" />
          AGOTADO
        </span>
      ) : needsReorder(product) ? (
        <span role="img"
          aria-label="Necesita reposición"
          className="absolute top-2 left-2 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] z-10"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-warning-500)]" />
          REPONER
        </span>
      ) : null}

      {/* Badge en carrito */}
      {inCart > 0 && (
        <span role="img"
          aria-label={`${inCart} en canasta`}
          className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold z-10"
        >
          {inCart > 99 ? "99+" : inCart}
        </span>
      )}

      {/* Imagen o inicial */}
      <div className="flex justify-center mb-2 mt-1">
        {product.image ? (
          <div className="relative h-20 w-20 rounded-xl overflow-hidden bg-[var(--surface-sunken)] ">
            <Image
              src={product.image}
              alt={displayName}
              fill
              sizes="80px"
              className="object-cover"
              onError={() => {
                // next/image maneja el error internamente; el fallback
                // visual se ve al no cargar la imagen
              }}
            />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="h-20 w-20 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-[var(--accent-ink)] dark:text-[var(--accent)] font-bold text-xl"
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Nombre */}
      <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2 leading-tight mb-1.5 min-h-[2.5em]">
        {displayName}
      </p>

      {/* Precio y stock */}
      {/* Precio y stock en su renglón cada uno si no entran (a 130 px el precio se partía en «S/» y «18.00»). */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-1 mb-0.5">
        <span
          className={cn("whitespace-nowrap text-sm", costoFicha != null ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}
          title={`Costo de la ficha: ${costoFicha != null ? formatCurrency(costoFicha) : "sin cargar (lo escribes en la canasta)"} | Venta: ${formatCurrency(Number(product.price))} | Margen: ${costoFicha != null && product.price ? ((1 - costoFicha / product.price) * 100).toFixed(0) : "—"}%`}
        >
          {costoFicha != null ? formatCurrency(costoFicha) : "sin costo"}
        </span>
        <span
          className="whitespace-nowrap text-sm text-[var(--text-secondary)]"
          title={product.stock == null ? "Este producto no lleva control de inventario" : `${product.stock} ${product.unit ?? ""} en stock`}
        >
          Stock: {product.stock ?? "—"}
        </span>
      </div>

      {suggestedQty > 1 && (
        <p
          className="text-xs text-[var(--text-secondary)]"
          title={`Stock: ${product.stock ?? 0} · Meta: ${targetStock} → faltan ${suggestedQty} ${unidad}`}
        >
          Sugerido: {suggestedQty} {unidad}
        </p>
      )}

      {/* Agregar: +1 siempre; «+N» (la sugerencia entera) sólo si es más de 1. A 130 px «Pedir 21» se cortaba en «Ped…». */}
      <div className="mt-auto flex gap-1.5 pt-2">
        <button
          type="button"
          onClick={() => onAdd(product, 1)}
          aria-label={`Agregar 1 ${unidad} de ${displayName}${isOutOfStock ? " (agotado)" : ""}`}
          className={cn(botonCls, "flex-1", "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]")}
        >
          +1
        </button>
        {suggestedQty > 1 && (
          <button
            type="button"
            onClick={() => onAdd(product, suggestedQty)}
            title={`Stock: ${product.stock ?? 0} · Meta: ${targetStock} → faltan ${suggestedQty} ${unidad}`}
            aria-label={`Agregar los ${suggestedQty} ${unidad} sugeridos de ${displayName} (stock ${product.stock ?? 0}, meta ${targetStock})`}
            className={cn(botonCls, "min-w-0 flex-1 px-2 bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-[var(--accent-muted)]")}
          >
            +{suggestedQty}
          </button>
        )}
      </div>
    </div>
  );
});
