"use client";

import Image from "next/image";
import { X, ShoppingCart } from "@buleje/design-system/icons";
import type { StoreTheme } from "@/contexts/settings-context";

/**
 * CheckoutModalHeader — header con logo, título, contador de items
 * y botón cerrar. Solo presentación, no maneja state.
 */

export type CheckoutModalHeaderProps = {
  businessName: string;
  storeTheme: StoreTheme | null;
  itemCount: number;
  onClose: () => void;
};

export function CheckoutModalHeader({
  businessName,
  storeTheme,
  itemCount,
  onClose,
}: CheckoutModalHeaderProps) {
  // Cadena de fallback: el campo real editado por el dueño suele ser
  // `storeTheme.storeName`. Solo si está vacío caemos a `storeTheme.name`,
  // luego a `businessName` y finalmente al genérico "Mi Tienda".
  const themeAny = storeTheme as (StoreTheme & { storeName?: string }) | null;
  const displayName =
    themeAny?.storeName?.trim() ||
    themeAny?.name?.trim() ||
    businessName?.trim() ||
    "Mi Tienda";

  return (
    <div className="flex items-center justify-between px-6 py-5 shrink-0 bg-linear-to-r from-primary to-primary-dark">
      <div className="flex items-center gap-4">
        <div className="relative h-12 w-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg overflow-hidden">
          {storeTheme?.logo ? (
            <Image
              src={storeTheme.logo}
              alt={`Logo de ${displayName}`}
              fill
              sizes="48px"
              className="object-cover"
            />
          ) : (
            <ShoppingCart className="h-6 w-6 text-white" aria-hidden />
          )}
        </div>
        <div>
          <h2 className="font-extrabold text-white text-xl leading-tight">
            Completar pedido
          </h2>
          <p className="text-sm text-white/70">
            {displayName} · {itemCount}{" "}
            {itemCount === 1 ? "producto" : "productos"}
          </p>
        </div>
      </div>
      <button
        onClick={onClose}
        aria-label="Cerrar checkout"
        className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
      >
        <X className="h-6 w-6 text-white" />
      </button>
    </div>
  );
}
