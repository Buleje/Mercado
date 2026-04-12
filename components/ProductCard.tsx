import { memo, useCallback, useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Minus, Package, Heart, Eye, Flame, Clock, ShoppingCart, Star, GitCompareArrows, BellRing } from "lucide-react";
import { getProductSlug } from "@/data/products";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useFavorites } from "@/contexts/favorites-context";
import { useCompare } from "@/contexts/compare-context";
import { cn } from "@/lib/utils";
import { trackAddToCart } from "@/lib/analytics";
import type { Product } from "@/data/products";
import { trackView } from "@/components/RecentlyViewed";

type LiveProduct = Product & { stock?: number; stockMin?: number; rating?: number; reviewCount?: number; isTopSeller?: boolean; comparePrice?: number; promoEndDate?: string };

/* U4: Selling fast tracker — counts add-to-cart events per product in a rolling 24h window */
const SELLING_FAST_KEY = "buleje-selling-fast";
const SELLING_FAST_THRESHOLD = 3;
function recordPurchaseActivity(productId: number) {
  try {
    const now = Date.now();
    const data: Record<string, number[]> = JSON.parse(localStorage.getItem(SELLING_FAST_KEY) || "{}");
    const timestamps = (data[productId] || []).filter(t => now - t < 86400000);
    timestamps.push(now);
    data[productId] = timestamps.slice(-20);
    localStorage.setItem(SELLING_FAST_KEY, JSON.stringify(data));
  } catch { /* silent */ }
}
function isSellingFast(productId: number): boolean {
  try {
    const now = Date.now();
    const data: Record<string, number[]> = JSON.parse(localStorage.getItem(SELLING_FAST_KEY) || "{}");
    const timestamps = (data[productId] || []).filter(t => now - t < 86400000);
    return timestamps.length >= SELLING_FAST_THRESHOLD;
  } catch { return false; }
}
function getSellingCount(productId: number): number {
  try {
    const now = Date.now();
    const data: Record<string, number[]> = JSON.parse(localStorage.getItem(SELLING_FAST_KEY) || "{}");
    return (data[productId] || []).filter(t => now - t < 86400000).length;
  } catch { return 0; }
}

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
  const { add: addToCompare, isIn: isInCompare, remove: removeFromCompare } = useCompare();
  const router = useRouter();

  // Mejora 18: Prefetch product page on hover (desktop only)
  const prefetchedRef = useRef(false);
  const handlePrefetch = useCallback(() => {
    if (prefetchedRef.current) return;
    // Only prefetch on desktop (no touchscreen)
    if (typeof window !== "undefined" && !("ontouchstart" in window)) {
      router.prefetch(`/tienda/${getProductSlug(product)}`);
      prefetchedRef.current = true;
    }
  }, [router, product]);

  const cartItem = items.find((i) => i.id === product.id);
  const qty = cartItem?.quantity ?? 0;
  const fav = isFavorite(String(product.id));
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  /* Mejora 12: Animacion feedback al agregar */
  const [justAdded, setJustAdded] = useState(false);

  /* U4: Selling fast check — deferred to avoid localStorage read on mount for every card */
  const [sellingFast, setSellingFast] = useState(false);
  const [soldCount, setSoldCount] = useState(0);
  useEffect(() => {
    setSellingFast(isSellingFast(product.id));
    setSoldCount(getSellingCount(product.id));
  }, [product.id]);

  /* Z1: Recently viewed badge — deferred to avoid localStorage read on mount for every card */
  const [recentlyViewed, setRecentlyViewed] = useState(false);
  useEffect(() => {
    try {
      const items: { id: number }[] = JSON.parse(localStorage.getItem("buleje-recently-viewed") || "[]");
      setRecentlyViewed(items.slice(0, 5).some((p) => p.id === product.id));
    } catch {}
  }, [product.id]);

  /* Y1+M11: Offer countdown — uses promoEndDate if available, else midnight */
  const [offerCountdown, setOfferCountdown] = useState("");
  const [offerUrgent, setOfferUrgent] = useState(false);
  const [offerExpired, setOfferExpired] = useState(false);
  useEffect(() => {
    if (product.badge !== "Oferta") return;
    const calc = () => {
      const now = new Date();
      const endDate = product.promoEndDate ? new Date(product.promoEndDate) : (() => { const m = new Date(now); m.setHours(24, 0, 0, 0); return m; })();
      const diff = endDate.getTime() - now.getTime();
      if (diff <= 0) { setOfferExpired(true); setOfferCountdown(""); return; }
      setOfferExpired(false);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setOfferUrgent(diff < 3600000); // < 1 hora
      setOfferCountdown(h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`);
    };
    calc();
    const t = setInterval(calc, 60000);
    return () => clearInterval(t);
  }, [product.badge, product.promoEndDate]);

  const isOutOfStock = product.stock != null && product.stock <= 0;
  const isLowStock =
    !isOutOfStock &&
    product.stock != null &&
    product.stockMin != null &&
    product.stock <= product.stockMin;
  /* #30: Scarcity real — badge "Solo quedan N" when stock <= 5, even without stockMin */
  const isScarcity =
    !isOutOfStock &&
    !isLowStock &&
    product.stock != null &&
    product.stock <= 5 &&
    product.stock > 1;

  // Guard against ghost clicks on mobile: prevents add/remove from firing within 300ms of each other
  const lastActionRef = useRef(0);

  const handleAdd = useCallback(() => {
    const now = Date.now();
    if (now - lastActionRef.current < 150) return;
    lastActionRef.current = now;
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
    /* U4: Track selling activity */
    recordPurchaseActivity(product.id);
    setSellingFast(isSellingFast(product.id));
    setSoldCount(getSellingCount(product.id));
    /* Mejora 12: Feedback visual */
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);

  }, [isOutOfStock, addItem, product, showToast]);

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFav(String(product.id));
    },
    [toggleFav, product.id]
  );

  const handleQuickView = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onQuickView?.(product);
    },
    [onQuickView, product]
  );

  const handleCompareToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isInCompare(product.id)) {
        removeFromCompare(product.id);
      } else {
        addToCompare({
          id: product.id,
          name: product.name,
          category: product.category,
          price: product.price,
          image: product.image,
          unit: product.unit,
          badge: product.badge,
        });
      }
    },
    [isInCompare, removeFromCompare, addToCompare, product]
  );

  const handleDecrement = useCallback(() => {
    const now = Date.now();
    if (now - lastActionRef.current < 150) return;
    lastActionRef.current = now;
    updateQty(product.id, qty - 1);
  }, [updateQty, product.id, qty]);

  return (
    <div
      role="article"
      aria-label={product.name}
      className={cn(
        "group relative bg-white dark:bg-card rounded-2xl overflow-hidden border border-gray-100 dark:border-card-border hover:shadow-xl hover:shadow-primary/10 hover:border-primary/20 transition-shadow duration-300 flex flex-col",
        isOutOfStock && "opacity-60 pointer-events-none"
      )}
      onMouseEnter={handlePrefetch}
    >
      {/* Mejora 11: Badge "Mas vendido" — priorizado sobre otros badges */}
      {product.isTopSeller ? (
        <span className="absolute top-3 left-3 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm bg-orange-500 animate-pulse flex items-center gap-1">
          <Flame className="h-3 w-3" /> Mas vendido
        </span>
      ) : product.badge ? (
        <span
          className={cn(
            "absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm",
            badgeColors[product.badge] ?? "bg-primary"
          )}
        >
          {product.badge}
        </span>
      ) : null}

      {/* Y1+M11: Offer countdown with urgency */}
      {offerCountdown && !offerExpired && (
        <span className={cn(
          "absolute top-3 left-20 z-10 rounded-full px-2 py-0.5 text-[9px] font-bold shadow-sm flex items-center gap-0.5",
          offerUrgent
            ? "bg-red-500 text-white animate-pulse"
            : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
        )}>
          <Clock className="h-3 w-3" /> {offerUrgent ? "Ultima hora!" : offerCountdown}
        </span>
      )}

      {/* U4: Selling fast badge with count */}
      {sellingFast && !isOutOfStock && (
        <span className="absolute z-10 rounded-full px-2 py-0.5 text-[9px] font-bold shadow-sm flex items-center gap-0.5" style={{ top: product.badge ? "2.5rem" : "0.75rem", left: "0.75rem" }}>
          {soldCount >= 20 ? (
            <span className="flex items-center gap-0.5 bg-red-500 text-white rounded-full px-2 py-0.5">
              <Star className="h-3 w-3 fill-current" /> Popular
            </span>
          ) : soldCount >= 5 ? (
            <span className="flex items-center gap-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded-full px-2 py-0.5 animate-pulse">
              <Flame className="h-3 w-3" /> {soldCount} vendidos hoy
            </span>
          ) : (
            <span className="flex items-center gap-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded-full px-2 py-0.5 animate-pulse">
              <Flame className="h-3 w-3" /> Vendiendo rápido
            </span>
          )}
        </span>
      )}

      {isOutOfStock && (
        <span className="absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm bg-gray-500">
          Agotado
        </span>
      )}
      {!isOutOfStock && product.stock === 1 && (
        <span className="absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm bg-red-500 animate-pulse">
          ¡Última unidad!
        </span>
      )}
      {isLowStock && product.stock !== 1 && (
        <span className="absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm bg-amber-500 animate-pulse">
          ¡Quedan {product.stock}!
        </span>
      )}
      {/* #30: Scarcity real — stock <= 5 even when stockMin not configured */}
      {isScarcity && (
        <span className="absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm bg-red-500 animate-pulse">
          Solo quedan {product.stock}
        </span>
      )}

      <button
        onClick={handleToggleFavorite}
        aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
        className={cn(
          "absolute z-10 flex items-center justify-center h-9 w-9 sm:h-11 sm:w-11 rounded-full transition-all duration-200 pointer-events-auto",
          isOutOfStock || isLowStock || product.stock === 1 ? "top-8 right-1.5" : "top-1.5 right-1.5",
          fav
            ? "bg-red-500 text-white shadow-md scale-110"
            : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-card shadow-sm"
        )}
      >
        <Heart className={cn("h-5 w-5", fav && "fill-current")} />
      </button>

      {/* Compare button */}
      <button
        onClick={handleCompareToggle}
        aria-label={isInCompare(product.id) ? "Quitar de comparación" : "Agregar a comparación"}
        className={cn(
          "absolute z-10 flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-full transition-all duration-200 pointer-events-auto opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
          isOutOfStock || isLowStock || product.stock === 1 ? "top-[4.2rem] right-1.5" : "top-[2.8rem] right-2",
          isInCompare(product.id)
            ? "bg-primary text-white shadow-md scale-105"
            : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-primary hover:bg-white dark:hover:bg-card shadow-sm"
        )}
        style={{ opacity: isInCompare(product.id) ? 1 : undefined }}
      >
        <GitCompareArrows className="h-3.5 w-3.5" />
      </button>

      <div className="relative aspect-square bg-gray-50 overflow-hidden shrink-0">
        {product.image && !imgError ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            loading="lazy"
            unoptimized={product.image.startsWith("data:")}
            className={cn(
              "object-cover group-hover:scale-110 transition-all duration-500",
              imgLoaded ? "opacity-100" : "opacity-0"
            )}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 20vw, 16vw"
            placeholder="blur"
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4="
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center bg-linear-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-300 gap-2">
            <Package className="h-10 w-10" />
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Sin imagen</span>
          </div>
        )}

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

        {isOutOfStock && (
          <div className="absolute bottom-2 right-2 z-10">
            <span className="bg-gray-500/90 text-white text-[9px] font-bold px-2 py-1 rounded-full">Agotado</span>
          </div>
        )}
      </div>

      <div className="p-2.5 sm:p-3 flex flex-col gap-1.5 flex-1 min-h-[9.5rem] sm:min-h-[10.5rem]">
        {/* Z1: Recently viewed badge */}
        {recentlyViewed && !isOutOfStock && (
          <span className="text-[9px] font-semibold text-blue-500 dark:text-blue-400 flex items-center gap-1 -mt-0.5 mb--0.5">
            👁 Lo viste hoy
          </span>
        )}
        <Link href={`/tienda/${getProductSlug(product)}`} className="flex-1" onClick={(e) => { e.stopPropagation(); trackView(product); }}>
          <h3 className="font-semibold text-foreground text-xs sm:text-sm leading-tight line-clamp-2 hover:text-primary transition-colors">
            {product.name}
          </h3>
          <span className="mt-0.5 text-[10px] font-semibold text-primary/0 group-hover:text-primary/60 transition-colors leading-none inline-flex items-center gap-0.5">
            Ver detalles →
          </span>
        </Link>

        {product.description && (
          <p className="text-[10px] text-muted leading-snug line-clamp-2 -mt-0.5">
            {product.description}
          </p>
        )}

        {/* Star rating */}
        {product.rating != null && product.rating > 0 && (
          <div className="flex items-center gap-1 -mt-0.5">
            <div className="flex items-center gap-px">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={cn("h-3 w-3", s <= Math.round(product.rating!) ? "text-amber-400 fill-amber-400" : "text-gray-200 dark:text-gray-600")} />
              ))}
            </div>
            <span className="text-[10px] font-semibold text-muted">
              {product.rating.toFixed(1)}
              {product.reviewCount != null && <span className="ml-0.5">({product.reviewCount})</span>}
            </span>
          </div>
        )}

        {/* AA2: Bulk discount hint */}
        {product.unit === "und" && product.price <= 15 && !isOutOfStock && (
          <span className="text-[9px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-md px-1.5 py-0.5 w-fit">Lleva 3+ → 5% off</span>
        )}

        <div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <div>
              {/* Mejora 12: Precio anterior tachado cuando hay descuento */}
              {product.comparePrice && product.comparePrice > product.price ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-gray-400 line-through">S/{product.comparePrice.toFixed(2)}</span>
                  <span className="text-base sm:text-lg font-extrabold text-green-700 dark:text-green-400 leading-none">
                    S/{product.price.toFixed(2)}
                  </span>
                  <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1 rounded font-bold">
                    -{Math.round(((product.comparePrice - product.price) / product.comparePrice) * 100)}%
                  </span>
                </div>
              ) : (
                <span className="text-base sm:text-lg font-extrabold text-primary leading-none">
                  S/{product.price.toFixed(2)}
                </span>
              )}
              <span className="block text-[10px] text-muted mt-0.5">/{product.unit}</span>
              {/* Stock indicator */}
              {product.stock != null && product.stock > 0 && !isLowStock && (
                <span className="block text-[9px] font-semibold text-gray-400 dark:text-muted mt-0.5">
                  Stock: {product.stock} {product.unit}
                </span>
              )}
              {isLowStock && (
                <span className="block text-[9px] font-bold text-amber-600 dark:text-amber-400 mt-0.5 animate-pulse">
                  ⚠ ¡Solo quedan {product.stock}!
                </span>
              )}
              {/* #30: Scarcity text below price */}
              {isScarcity && (
                <span className="block text-[9px] font-bold text-red-600 dark:text-red-400 mt-0.5 animate-pulse">
                  ⚠ Solo quedan {product.stock}
                </span>
              )}
              {isOutOfStock && (
                <Link
                  href={`/tienda/${getProductSlug(product)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-[9px] font-bold text-amber-600 dark:text-amber-400 mt-0.5 hover:text-amber-700 dark:hover:text-amber-300 transition-colors pointer-events-auto"
                >
                  <BellRing className="h-3 w-3" />
                  Avisarme cuando vuelva
                </Link>
              )}
            </div>

            {qty === 0 ? (
              <button
                onClick={handleAdd}
                className={cn(
                  "flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-2xl text-white shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 shrink-0 animate-[scaleIn_0.15s_ease-out]",
                  justAdded ? "bg-green-600 scale-95" : "bg-primary hover:bg-primary-dark"
                )}
                aria-label={`Agregar ${product.name}`}
              >
                {justAdded ? <span className="text-sm font-bold">✓</span> : <ShoppingCart className="h-5 w-5" />}
              </button>
            ) : (
              <div className="flex items-center bg-primary rounded-2xl overflow-hidden shadow-md animate-[scaleIn_0.15s_ease-out] shrink-0">
                <button
                  onClick={handleDecrement}
                  className="flex items-center justify-center h-10 w-8 sm:h-11 sm:w-9 text-white hover:bg-primary-dark transition-colors"
                  aria-label={`Reducir cantidad de ${product.name}`}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  key={qty}
                  type="number"
                  min={1}
                  max={product.stock != null && product.stock > 0 ? product.stock : 20}
                  value={qty}
                  onChange={(e) => {
                    const cap = product.stock != null && product.stock > 0 ? product.stock : 20;
                    const v = Math.min(cap, Math.max(1, Number(e.target.value) || 1));
                    updateQty(product.id, v);
                  }}
                  className="w-7 sm:w-8 text-center text-xs sm:text-sm font-bold text-white bg-transparent border-none outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none animate-[pop_0.15s_ease-out]"
                  aria-label={`Cantidad de ${product.name}`}
                />
                <button
                  onClick={handleAdd}
                  className="flex items-center justify-center h-10 w-8 sm:h-11 sm:w-9 text-white hover:bg-primary-dark transition-colors"
                  aria-label={`Aumentar cantidad de ${product.name}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
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
    prev.product.image === next.product.image &&
    prev.product.rating === next.product.rating &&
    prev.product.isTopSeller === next.product.isTopSeller &&
    prev.product.comparePrice === next.product.comparePrice &&
    prev.onQuickView === next.onQuickView
  );
});

ProductCard.displayName = "ProductCard";
