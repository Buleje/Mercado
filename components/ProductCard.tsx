import { memo, useCallback, useState } from "react";
import Image from "next/image";
import { Plus, Minus, Package, Heart, Eye, GitCompareArrows } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useFavorites } from "@/contexts/favorites-context";
import { useCompare } from "@/contexts/compare-context";
import { cn } from "@/lib/utils";
import { trackAddToCart } from "@/lib/analytics";
import type { Product } from "@/data/products";

type LiveProduct = Product & { stock?: number; stockMin?: number };

interface ProductCardProps {
  product: LiveProduct;
  onQuickView?: (product: LiveProduct) => void;
}

const badgeColors: Record<string, string> = {
  Oferta: "bg-red-500",
  Popular: "bg-secondary",
  Fresco: "bg-emerald-500",
  Premium: "bg-violet-600",
};

function ProductCardComponent({ product, onQuickView }: ProductCardProps) {
  const { items, addItem, updateQty } = useCart();
  const { showToast } = useToast();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const { add: addCompare, isIn: isCompare, remove: removeCompare } = useCompare();

  const cartItem = items.find((i) => i.id === product.id);
  const qty = cartItem?.quantity ?? 0;
  const fav = isFavorite(String(product.id));
  const [imgError, setImgError] = useState(false);

  const isOutOfStock = product.stock != null && product.stock <= 0;
  const isLowStock =
    !isOutOfStock &&
    product.stock != null &&
    product.stockMin != null &&
    product.stock <= product.stockMin;

  const handleAdd = useCallback(() => {
    if (isOutOfStock) return;
    addItem(product);
    showToast(product.name, product.image);
    trackAddToCart({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      quantity: 1,
    });
  }, [isOutOfStock, addItem, product, showToast]);

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFav(String(product.id));
    },
    [toggleFav, product.id]
  );

  const handleToggleCompare = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isCompare(product.id)) {
        removeCompare(product.id);
      } else {
        addCompare(product);
      }
    },
    [isCompare, removeCompare, addCompare, product]
  );

  const handleQuickView = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onQuickView?.(product);
    },
    [onQuickView, product]
  );

  const handleDecrement = useCallback(() => {
    updateQty(product.id, qty - 1);
  }, [updateQty, product.id, qty]);

  return (
    <div
      className={cn(
        "group relative bg-white dark:bg-card rounded-2xl overflow-hidden border border-gray-100 dark:border-card-border hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-2 hover:border-primary/20 transition-all duration-300 flex flex-col",
        isOutOfStock && "opacity-60 pointer-events-none"
      )}
    >
      {product.badge && (
        <span
          className={cn(
            "absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm",
            badgeColors[product.badge] ?? "bg-primary"
          )}
        >
          {product.badge}
        </span>
      )}

      {isOutOfStock && (
        <span className="absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm bg-gray-500">
          Agotado
        </span>
      )}
      {isLowStock && (
        <span className="absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm bg-amber-500 animate-pulse">
          ¡Últimas unidades!
        </span>
      )}

      <button
        onClick={handleToggleFavorite}
        aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
        className={cn(
          "absolute z-10 flex items-center justify-center h-8 w-8 rounded-full transition-all duration-200 pointer-events-auto",
          isOutOfStock || isLowStock ? "top-12 right-3" : "top-3 right-3",
          fav
            ? "bg-red-500 text-white shadow-md scale-110"
            : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-card shadow-sm"
        )}
      >
        <Heart className={cn("h-4 w-4", fav && "fill-current")} />
      </button>

      <div className="relative aspect-square bg-gray-50 overflow-hidden shrink-0">
        {product.image && !imgError ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            loading="lazy"
            className="object-cover group-hover:scale-110 transition-transform duration-500"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center bg-linear-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-300 gap-2">
            <Package className="h-10 w-10" />
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Sin imagen</span>
          </div>
        )}

        <button
          onClick={handleToggleCompare}
          aria-label={isCompare(product.id) ? "Quitar de comparación" : "Comparar"}
          className={cn(
            "absolute bottom-2 left-2 z-10 flex items-center justify-center h-7 w-7 rounded-full transition-all duration-200 pointer-events-auto opacity-0 group-hover:opacity-100",
            isCompare(product.id)
              ? "bg-primary text-white shadow-md"
              : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-primary hover:bg-white dark:hover:bg-card shadow-sm"
          )}
        >
          <GitCompareArrows className="h-3.5 w-3.5" />
        </button>

        {onQuickView && (
          <button
            onClick={handleQuickView}
            className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-300 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
            aria-label={`Vista rápida de ${product.name}`}
          >
            <span className="flex items-center gap-1.5 bg-white dark:bg-card text-foreground rounded-full px-3 py-1.5 text-xs font-bold shadow-lg scale-90 group-hover:scale-100 transition-transform">
              <Eye className="h-3.5 w-3.5" /> Vista rápida
            </span>
          </button>
        )}
      </div>

      <div className="p-3 sm:p-4 flex flex-col gap-2 flex-1">
        <h3 className="font-semibold text-foreground text-sm sm:text-base leading-tight line-clamp-2 flex-1">
          {product.name}
        </h3>

        <div className="flex items-end justify-between gap-2">
          <div>
            <span className="text-lg sm:text-xl font-extrabold text-primary leading-none">
              S/{product.price.toFixed(2)}
            </span>
            <span className="block text-[11px] text-muted mt-0.5">/{product.unit}</span>
          </div>

          {qty === 0 ? (
            <button
              onClick={handleAdd}
              className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary text-white shadow-md hover:bg-primary-dark hover:scale-110 active:scale-95 transition-all duration-200 animate-[scaleIn_0.15s_ease-out]"
              aria-label={`Agregar ${product.name}`}
            >
              <Plus className="h-5 w-5" />
            </button>
          ) : (
            <div className="flex items-center bg-primary rounded-xl overflow-hidden shadow-md animate-[scaleIn_0.15s_ease-out]">
              <button
                onClick={handleDecrement}
                className="flex items-center justify-center h-10 w-9 text-white hover:bg-primary-dark transition-colors"
                aria-label="Reducir"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span
                key={qty}
                className="w-7 text-center text-sm font-bold text-white animate-[pop_0.15s_ease-out]"
              >
                {qty}
              </span>
              <button
                onClick={handleAdd}
                className="flex items-center justify-center h-10 w-9 text-white hover:bg-primary-dark transition-colors"
                aria-label="Aumentar"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const ProductCard = memo(ProductCardComponent, (prev, next) => {
  return (
    prev.product.id === next.product.id &&
    prev.product.stock === next.product.stock &&
    prev.product.stockMin === next.product.stockMin &&
    prev.product.price === next.product.price &&
    prev.product.name === next.product.name &&
    prev.product.badge === next.product.badge &&
    prev.onQuickView === next.onQuickView
  );
});

ProductCard.displayName = "ProductCard";
