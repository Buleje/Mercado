"use client";

import { Heart } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useWishlist, type WishlistItem } from "@/hooks/use-wishlist";

interface Props {
  product: Omit<WishlistItem, "addedAt">;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-11 w-11",
};

const ICON_SIZES = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export default function WishlistButton({ product, className, size = "md" }: Props) {
  const { isInWishlist, toggle } = useWishlist();
  const active = isInWishlist(product.productId, product.storeSlug);

  return (
    <button
      type="button"
      aria-label={active ? "Quitar de favoritos" : "Agregar a favoritos"}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(product);
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-full border transition-all active:scale-90",
        SIZES[size],
        active
          ? "bg-rose-50 border-rose-200 text-[var(--data-error-500)] hover:bg-rose-100"
          : "bg-white/90 backdrop-blur border-gray-200 text-gray-400 hover:text-[var(--data-error-500)] hover:border-rose-200",
        className,
      )}
    >
      <Heart
        className={cn(ICON_SIZES[size], active && "fill-current")}
        aria-hidden="true"
      />
    </button>
  );
}
