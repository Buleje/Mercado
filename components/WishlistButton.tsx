"use client";

import { useCallback } from "react";
import { Heart } from "@buleje/design-system/icons";
import { useWishlist } from "@/contexts/wishlist-context";
import { cn } from "@/lib/utils";

interface WishlistButtonProps {
  productId: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * #17 Wishlist — boton corazon reutilizable.
 * Touch target minimo 44x44px en mobile (sm: 36px, md: 44px).
 */
export default function WishlistButton({ productId, className, size = "md" }: WishlistButtonProps) {
  const { isInWishlist, addToWishlist, removeFromWishlist } = useWishlist();
  const inList = isInWishlist(productId);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (inList) {
        removeFromWishlist(productId);
      } else {
        addToWishlist(productId);
      }
    },
    [inList, productId, addToWishlist, removeFromWishlist]
  );

  return (
    <button
      onClick={handleToggle}
      aria-label={inList ? "Quitar de wishlist" : "Agregar a wishlist"}
      aria-pressed={inList}
      className={cn(
        "flex items-center justify-center rounded-full transition-all duration-200 active:scale-90",
        size === "md" ? "h-11 w-11" : "h-9 w-9",
        inList
          ? "bg-[var(--data-error-500)] text-white shadow-md scale-110"
          : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-[var(--data-error-500)] hover:bg-white dark:hover:bg-card shadow-sm",
        className
      )}
    >
      <Heart className={cn(size === "md" ? "h-5 w-5" : "h-4 w-4", inList && "fill-current")} />
    </button>
  );
}
