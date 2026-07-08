"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  PurchaseProduct,
  calculateSuggestedQty,
  needsReorder,
} from "@/lib/types/purchases";

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

  const displayPrice = product.costPrice ?? product.price;
  // Distinguir "sin control de stock" (stock null → servicios/gastos como
  // "Aserrado de madera") de "agotado" (rastreado y en 0). En un Punto de
  // COMPRA, un producto agotado es justamente lo que querés pedir → la tarjeta
  // SIEMPRE agrega al carrito. Antes se deshabilitaba y el clic no hacía nada
  // sin ninguna explicación (reporte QA Compras 2026-07-08).
  const isOutOfStock = product.stock === 0;

  const handleClick = () => {
    onAdd(product, suggestedQty);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Agregar ${displayName} al carrito — cantidad sugerida: ${suggestedQty}${isOutOfStock ? " (agotado, repón stock)" : ""}`}
      className={cn(
        "relative border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-3 transition-all bg-[var(--surface-raised)]",
        "text-left w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        "cursor-pointer hover:shadow-sm hover:border-primary/50 hover:scale-[1.02]",
      )}
    >
      {/* Badge AGOTADO / REPONER — bg neutro, color solo en dot + texto.
          AGOTADO solo si el stock está RASTREADO en 0 (no si es null/sin control). */}
      {isOutOfStock ? (
        <span
          aria-label="Producto agotado"
          className="absolute top-2 left-2 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--data-error-500)]/30 text-[var(--data-error-500)] z-10"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-error-500)]" />
          AGOTADO
        </span>
      ) : needsReorder(product) ? (
        <span
          aria-label="Necesita reposición"
          className="absolute top-2 left-2 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-raised)] border border-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] z-10"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-warning-500)]" />
          REPONER
        </span>
      ) : null}

      {/* Badge en carrito */}
      {inCart > 0 && (
        <span
          aria-label={`${inCart} en canasta`}
          className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold z-10"
        >
          {inCart > 99 ? "99+" : inCart}
        </span>
      )}

      {/* Imagen o inicial */}
      <div className="flex justify-center mb-2 mt-1">
        {product.image ? (
          <div className="relative h-20 w-20 rounded-xl overflow-hidden bg-gray-50 dark:bg-white/5">
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
            className="h-20 w-20 rounded-xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary font-bold text-xl"
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Nombre */}
      <p className="text-xs font-semibold text-[var(--text-primary)] line-clamp-2 leading-tight mb-1.5 min-h-[2.5em]">
        {displayName}
      </p>

      {/* Precio y stock */}
      <div className="flex items-baseline justify-between gap-1 mb-0.5">
        <span
          className="text-sm font-bold text-[var(--text-primary)]"
          title={`Costo: S/${displayPrice.toFixed(2)} | Venta: S/${Number(product.price).toFixed(2)} | Margen: ${product.costPrice ? ((1 - product.costPrice / product.price) * 100).toFixed(0) : "—"}%`}
        >
          S/{displayPrice.toFixed(2)}
        </span>
        <span
          className="text-xs text-[var(--text-tertiary)]"
          title={product.stock == null ? "Este producto no lleva control de inventario" : `${product.stock} ${product.unit ?? ""} en stock`}
        >
          Stock: {product.stock ?? "—"}
        </span>
      </div>

      {/* Cantidad sugerida */}
      <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-medium">
        <span title={`Stock: ${product.stock ?? 0} | Meta: ${targetStock} → Pedir ${suggestedQty}`}>
          Sugerido: {suggestedQty} {product.unit}
        </span>
      </p>
    </button>
  );
});
