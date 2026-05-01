"use client";

/**
 * CartIconBtn — botón circular de carrito compacto para agregar al precio.
 *
 * Inspirado en UnifiedProductCard de /marketplace/[slug] (bodega):
 *  - Siempre visible, no flotante
 *  - Pegado al precio (flex row con precio + botón)
 *  - Tamaño h-10 w-10 con icono h-5 w-5
 *  - Accent color por default, check al agregar
 *
 * Uso:
 *   <div className="flex items-center justify-between gap-2">
 *     <span>S/ 12.50</span>
 *     <CartIconBtn onAdd={() => addToCart(item)} />
 *   </div>
 */

import { useState } from "react";
import { ShoppingCart, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  onAdd: (e: React.MouseEvent) => void | Promise<void>;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
  className?: string;
  /** Cantidad actual de este producto en el carrito. Si > 0, muestra badge. */
  quantityInCart?: number;
}

export default function CartIconBtn({
  onAdd,
  disabled = false,
  size = "md",
  label = "Agregar al carrito",
  className,
  quantityInCart = 0,
}: Props) {
  const [added, setAdded] = useState(false);
  const hasInCart = quantityInCart > 0;

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    await onAdd(e);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  const sizeCls = size === "sm" ? "h-9 w-9" : "h-10 w-10";
  const iconCls = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={
        hasInCart
          ? `${label} — tienes ${quantityInCart} en el carrito`
          : label
      }
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full transition-all duration-200 ring-1",
        sizeCls,
        disabled
          ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] ring-[var(--rule-soft)] cursor-not-allowed"
          : added
            ? "bg-[var(--data-success)] text-white ring-[var(--data-success)]/40 scale-95"
            : "bg-[var(--accent)] text-white ring-[var(--accent)]/30 shadow-md hover:bg-[var(--accent)]/90 hover:scale-105 active:scale-95",
        "motion-reduce:hover:scale-100 motion-reduce:transition-none",
        className,
      )}
    >
      {added ? (
        <Check className={iconCls} strokeWidth={2.5} aria-hidden />
      ) : (
        <ShoppingCart className={iconCls} strokeWidth={2} aria-hidden />
      )}
      {hasInCart && !added && (
        <span
          aria-hidden
          className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[length:var(--ts-2xs)] font-black tabular-nums text-[var(--accent)] shadow ring-2 ring-[var(--surface-raised)]"
        >
          {quantityInCart > 99 ? "99+" : quantityInCart}
        </span>
      )}
    </button>
  );
}
