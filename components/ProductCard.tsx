import { memo, useCallback, useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus, Minus, Package, Heart, Eye, GitCompareArrows, Bell, Flame, Clock } from "lucide-react";
import { getProductSlug } from "@/data/products";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useFavorites } from "@/contexts/favorites-context";
import { useCompare } from "@/contexts/compare-context";
import { cn } from "@/lib/utils";
import { trackAddToCart } from "@/lib/analytics";
import type { Product } from "@/data/products";
import { trackView } from "@/components/RecentlyViewed";

type LiveProduct = Product & { stock?: number; stockMin?: number };

/* U4: Selling fast tracker — counts add-to-cart events per product in a rolling 24h window */
const SELLING_FAST_KEY = "bsm-selling-fast";
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

  /* U4: Selling fast check — deferred to avoid localStorage read on mount for every card */
  const [sellingFast, setSellingFast] = useState(false);
  useEffect(() => { setSellingFast(isSellingFast(product.id)); }, [product.id]);

  /* Z1: Recently viewed badge — deferred to avoid localStorage read on mount for every card */
  const [recentlyViewed, setRecentlyViewed] = useState(false);
  useEffect(() => {
    try {
      const items: { id: number }[] = JSON.parse(localStorage.getItem("bsm-recently-viewed") || "[]");
      setRecentlyViewed(items.slice(0, 5).some((p) => p.id === product.id));
    } catch {}
  }, [product.id]);

  /* Y1: Offer countdown (shows when badge is "Oferta", displays time remaining until midnight) */
  const [offerCountdown, setOfferCountdown] = useState("");
  useEffect(() => {
    if (product.badge !== "Oferta") return;
    const calc = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setOfferCountdown(`${h}h ${String(m).padStart(2, "0")}m`);
    };
    calc();
    const t = setInterval(calc, 60000);
    return () => clearInterval(t);
  }, [product.badge]);

  const isOutOfStock = product.stock != null && product.stock <= 0;
  const isLowStock =
    !isOutOfStock &&
    product.stock != null &&
    product.stockMin != null &&
    product.stock <= product.stockMin;

  // Guard against ghost clicks on mobile: prevents add/remove from firing within 300ms of each other
  const lastActionRef = useRef(0);

  const handleAdd = useCallback(() => {
    const now = Date.now();
    if (now - lastActionRef.current < 300) return;
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
    /* W4: Confetti burst on first add */
    if (qty === 0) {
      import("canvas-confetti").then(({ default: confetti }) => {
        confetti({
          particleCount: 40,
          spread: 55,
          origin: { y: 0.75 },
          colors: ["#6366f1", "#818cf8", "#f59e0b", "#fbbf24", "#3b82f6"],
          scalar: 0.75,
          ticks: 120,
        });
      });
    }
  }, [isOutOfStock, addItem, product, showToast, qty]);

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
    const now = Date.now();
    if (now - lastActionRef.current < 300) return;
    lastActionRef.current = now;
    updateQty(product.id, qty - 1);
  }, [updateQty, product.id, qty]);

  /* Q4: Price alert bell — deferred */
  const [priceAlert, setPriceAlert] = useState(false);
  useEffect(() => {
    try { const a = JSON.parse(localStorage.getItem("price-alerts") || "{}"); setPriceAlert(!!a[product.id]); } catch {}
  }, [product.id]);
  const handlePriceAlert = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const key = "price-alerts";
    try {
      const alerts = JSON.parse(localStorage.getItem(key) || "{}");
      if (alerts[product.id]) { delete alerts[product.id]; setPriceAlert(false); }
      else { alerts[product.id] = { price: product.price, name: product.name, ts: Date.now() }; setPriceAlert(true); }
      localStorage.setItem(key, JSON.stringify(alerts));
    } catch { /* silent */ }
  }, [product.id, product.price, product.name]);

  return (
    <div
      className={cn(
        "group relative bg-white dark:bg-card rounded-2xl overflow-hidden border border-gray-100 dark:border-card-border hover:shadow-xl hover:shadow-primary/10 hover:border-primary/20 transition-shadow duration-300 flex flex-col",
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

      {/* Y1: Offer countdown */}
      {offerCountdown && (
        <span className="absolute top-3 left-20 z-10 rounded-full px-2 py-0.5 text-[9px] font-bold bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 shadow-sm flex items-center gap-0.5">
          <Clock className="h-3 w-3" /> {offerCountdown}
        </span>
      )}

      {/* U4: Selling fast badge */}
      {sellingFast && !isOutOfStock && (
        <span className="absolute z-10 rounded-full px-2 py-0.5 text-[9px] font-bold text-orange-700 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-300 shadow-sm flex items-center gap-0.5 animate-pulse" style={{ top: product.badge ? "2.5rem" : "0.75rem", left: "0.75rem" }}>
          <Flame className="h-3 w-3" /> Vendiendo rápido
        </span>
      )}

      {isOutOfStock && (
        <span className="absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm bg-gray-500">
          Agotado
        </span>
      )}
      {isLowStock && (
        <span className="absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm bg-amber-500 animate-pulse">
          ¡Quedan {product.stock}!
        </span>
      )}

      <button
        onClick={handleToggleFavorite}
        aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
        className={cn(
          "absolute z-10 flex items-center justify-center h-11 w-11 rounded-full transition-all duration-200 pointer-events-auto",
          isOutOfStock || isLowStock ? "top-8 right-1" : "top-1 right-1",
          fav
            ? "bg-red-500 text-white shadow-md scale-110"
            : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-card shadow-sm"
        )}
      >
        <Heart className={cn("h-5 w-5", fav && "fill-current")} />
      </button>

      <div className="relative aspect-square bg-gray-50 overflow-hidden shrink-0">
        {product.image && !imgError ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            loading="lazy"
            unoptimized={product.image.startsWith("data:")}
            className="object-cover group-hover:scale-110 transition-transform duration-500"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 20vw, 16vw"
            placeholder="blur"
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4="
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
            "absolute bottom-1 left-1 z-10 flex items-center justify-center h-11 w-11 rounded-full transition-all duration-200 pointer-events-auto opacity-0 group-hover:opacity-100",
            isCompare(product.id)
              ? "bg-primary text-white shadow-md"
              : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-primary hover:bg-white dark:hover:bg-card shadow-sm"
          )}
        >
          <GitCompareArrows className="h-4 w-4" />
        </button>

        {/* Q4: Price alert bell */}
        <button
          onClick={handlePriceAlert}
          aria-label={priceAlert ? "Desactivar alerta de precio" : "Alertarme si baja de precio"}
          className={cn(
            "absolute bottom-1 left-12 z-10 flex items-center justify-center h-11 w-11 rounded-full transition-all duration-200 pointer-events-auto opacity-0 group-hover:opacity-100",
            priceAlert
              ? "bg-amber-500 text-white shadow-md"
              : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-amber-500 hover:bg-white dark:hover:bg-card shadow-sm"
          )}
          title={priceAlert ? "Alerta activa — te avisamos si baja" : "Alertarme si baja de precio"}
        >
          <Bell className={cn("h-4 w-4", priceAlert && "fill-current")} />
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

      <div className="p-2.5 sm:p-3 flex flex-col gap-1.5 flex-1">
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

        {/* AA2: Bulk discount hint */}
        {product.unit === "und" && product.price <= 15 && !isOutOfStock && (
          <span className="text-[9px] font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 rounded-md px-1.5 py-0.5 w-fit">Lleva 3+ → 5% off</span>
        )}

        <div className="flex items-end justify-between gap-1.5">
          <div>
            <span className="text-base sm:text-lg font-extrabold text-primary leading-none">
              S/{product.price.toFixed(2)}
            </span>
            <span className="block text-[10px] text-muted mt-0.5">/{product.unit}</span>
          </div>

          {qty === 0 ? (
            <button
              onClick={handleAdd}
              className="flex items-center justify-center h-8 w-8 rounded-xl bg-primary text-white shadow-sm hover:bg-primary-dark hover:scale-110 active:scale-95 transition-all duration-200 animate-[scaleIn_0.15s_ease-out]"
              aria-label={`Agregar ${product.name}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center bg-primary rounded-xl overflow-hidden shadow-sm animate-[scaleIn_0.15s_ease-out]">
              <button
                onClick={handleDecrement}
                className="flex items-center justify-center h-8 w-7 text-white hover:bg-primary-dark transition-colors"
                aria-label="Reducir"
              >
                <Minus className="h-3.5 w-3.5" />
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
                className="w-8 text-center text-xs font-bold text-white bg-transparent border-none outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none animate-[pop_0.15s_ease-out]"
                aria-label={`Cantidad de ${product.name}`}
              />
              <button
                onClick={handleAdd}
                className="flex items-center justify-center h-8 w-7 text-white hover:bg-primary-dark transition-colors"
                aria-label="Aumentar"
              >
                <Plus className="h-3.5 w-3.5" />
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
    prev.product.image === next.product.image &&
    prev.onQuickView === next.onQuickView
  );
});

ProductCard.displayName = "ProductCard";
