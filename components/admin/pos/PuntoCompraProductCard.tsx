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
  const isOutOfStock = (product.stock ?? 0) === 0;

  const handleClick = () => {
    if (isOutOfStock) return;
    onAdd(product, suggestedQty);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isOutOfStock}
      aria-label={isOutOfStock ? `${displayName} — agotado` : `Agregar ${displayName} al carrito — cantidad sugerida: ${suggestedQty}`}
      className={cn(
        "relative border border-gray-200 dark:border-card-border rounded-2xl p-3 transition-all bg-white dark:bg-card",
        "text-left w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f766e]",
        isOutOfStock
          ? "opacity-60 cursor-not-allowed"
          : "cursor-pointer hover:shadow-md hover:border-[#0f766e]/50 hover:scale-[1.02]",
      )}
    >
      {/* Badge AGOTADO / REPONER */}
      {(product.stock ?? 0) === 0 ? (
        <span
          aria-label="Producto agotado"
          className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white z-10"
        >
          AGOTADO
        </span>
      ) : needsReorder(product) ? (
        <span
          aria-label="Necesita reposición"
          className="absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 z-10"
        >
          REPONER
        </span>
      ) : null}

      {/* Badge en carrito */}
      {inCart > 0 && (
        <span
          aria-label={`${inCart} en canasta`}
          className="absolute top-2 right-2 h-5 w-5 rounded-full bg-[#0f766e] text-white text-xs flex items-center justify-center font-bold z-10"
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
            className="h-20 w-20 rounded-xl bg-[#0f766e]/10 dark:bg-[#0f766e]/20 flex items-center justify-center text-[#0f766e] font-bold text-xl"
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Nombre */}
      <p className="text-xs font-semibold text-gray-800 dark:text-white line-clamp-2 leading-tight mb-1.5 min-h-[2.5em]">
        {displayName}
      </p>

      {/* Precio y stock */}
      <div className="flex items-baseline justify-between gap-1 mb-0.5">
        <span
          className="text-sm font-bold text-gray-900 dark:text-white"
          title={`Costo: S/${displayPrice.toFixed(2)} | Venta: S/${product.price.toFixed(2)} | Margen: ${product.costPrice ? ((1 - product.costPrice / product.price) * 100).toFixed(0) : "—"}%`}
        >
          S/{displayPrice.toFixed(2)}
        </span>
        <span className="text-xs text-gray-400">
          Stock: {product.stock ?? "—"}
        </span>
      </div>

      {/* Cantidad sugerida */}
      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
        <span title={`Stock: ${product.stock ?? 0} | Meta: ${targetStock} → Pedir ${suggestedQty}`}>
          Sugerido: {suggestedQty} {product.unit}
        </span>
      </p>
    </button>
  );
});
