import { memo, useCallback, useRef, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Plus, Minus, Heart, Eye, Flame, Clock, ShoppingCart, Star, GitCompareArrows, BellRing } from "lucide-react";
import { ProductBadge, ProductPrice, type ProductBadgeIntent } from "@buleje/design-system";
import { getProductSlug } from "@/data/products";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useFavorites } from "@/contexts/favorites-context";
import { useCompare } from "@/contexts/compare-context";
import { useQuickAddSafe } from "@/contexts/quick-add-context";
import { cn } from "@/lib/utils";
import { trackAddToCart } from "@/lib/analytics";
import type { Product } from "@/data/products";
import { trackView } from "@/components/RecentlyViewedSingleTenant";
import ProductImagePlaceholder from "@/components/store/ProductImagePlaceholder";
import { SocioPriceBadge } from "@/components/marketplace/SocioPriceBadge";
import { BodegaAbriendo } from "@/components/ui-system/illustrations/contextual";
import { CanastaVacia } from "@/components/ui-system/illustrations/empty-states";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
} from "@/components/ui-system/illustrations/categories";

/**
 * Mapeo de categoria de producto -> ilustracion del DS.
 * Usa if/else explicit para cumplir react-hooks/static-components.
 */
function ProductCategoryIllustration({ category, className }: { category?: string; className?: string }) {
  const cat = (category ?? "").toLowerCase();
  const common = { size: 120, strokeWidth: 1.5, className } as const;
  if (cat.includes("abarrote")) return <BodegaAbriendo {...common} />;
  if (cat.includes("fruta") || cat.includes("verdura")) return <VerduraFresca {...common} />;
  if (cat.includes("carne")) return <CarniceriaFresca {...common} />;
  if (cat.includes("lacte") || cat.includes("láct")) return <LacteosRefresh {...common} />;
  if (cat.includes("bebida")) return <BebidasVarias {...common} />;
  if (cat.includes("limpie")) return <LimpiezaDomicilio {...common} />;
  return <CanastaVacia {...common} />;
}

type LiveProduct = Product & { stock?: number; stockMin?: number; rating?: number; reviewCount?: number; isTopSeller?: boolean; comparePrice?: number; promoEndDate?: string; socioPrice?: number };

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

// Map string badges del backend → intent canónico del DS.
const BADGE_INTENT: Record<string, ProductBadgeIntent> = {
  Popular: "popular",
  Oferta: "offer",
  Fresco: "fresh",
  Nuevo: "new",
  Premium: "premium",
};

function ProductCardComponent({ product, onQuickView }: ProductCardProps) {
  const { items, addItem, updateQty } = useCart();
  const { showToast } = useToast();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const { add: addToCompare, isIn: isInCompare, remove: removeFromCompare } = useCompare();
  const quickAdd = useQuickAddSafe();
  const router = useRouter();
  const pathname = usePathname();
  // Tienda individual: prefijo `/t/<slug>` para que el detail no salga del
  // contexto del comerciante. Detectado del pathname del cliente.
  const tenantSlug = pathname?.match(/^\/t\/([^/]+)/)?.[1] ?? null;
  const productHref = tenantSlug
    ? `/t/${tenantSlug}/tienda/${getProductSlug(product)}`
    : `/tienda/${getProductSlug(product)}`;

  // Mejora 18: Prefetch product page on hover (desktop only)
  const prefetchedRef = useRef(false);
  const handlePrefetch = useCallback(() => {
    if (prefetchedRef.current) return;
    // Only prefetch on desktop (no touchscreen)
    if (typeof window !== "undefined" && !("ontouchstart" in window)) {
      router.prefetch(productHref);
      prefetchedRef.current = true;
    }
  }, [router, productHref]);

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

  /* Z1: Recently viewed badge — deferred via queueMicrotask para cumplir
     react-hooks/set-state-in-effect (no setState síncrono dentro del effect). */
  const [recentlyViewed, setRecentlyViewed] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const items: { id: number }[] = JSON.parse(localStorage.getItem("buleje-recently-viewed") || "[]");
        setRecentlyViewed(items.slice(0, 5).some((p) => p.id === product.id));
      } catch {}
    });
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
      if (quickAdd) {
        quickAdd.openQuickAdd(product);
        return;
      }
      onQuickView?.(product);
    },
    [onQuickView, product, quickAdd]
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
        "product-card group relative bg-white dark:bg-card rounded-2xl overflow-hidden border border-gray-100 dark:border-card-border hover:shadow-xl hover:shadow-primary/10 hover:border-primary/20 transition-shadow duration-300 flex flex-col",
        isOutOfStock && "opacity-60 pointer-events-none"
      )}
      onMouseEnter={handlePrefetch}
    >
      {/* Mejora 11: Badge "Mas vendido" — priorizado sobre otros badges */}
      {product.isTopSeller ? (
        <div className="absolute top-3 left-3 z-10">
          <ProductBadge intent="popular" className="gap-1">
            <Flame className="h-3 w-3" /> Mas vendido
          </ProductBadge>
        </div>
      ) : product.badge ? (
        <div className="absolute top-3 left-3 z-10">
          <ProductBadge intent={BADGE_INTENT[product.badge] ?? "popular"}>
            {product.badge}
          </ProductBadge>
        </div>
      ) : null}

      {/* Y1+M11: Offer countdown with urgency */}
      {offerCountdown && !offerExpired && (
        <span className={cn(
          "absolute top-3 left-20 z-10 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold shadow-sm flex items-center gap-0.5",
          offerUrgent
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--accent-soft)] text-[var(--accent)]"
        )}>
          <Clock className="h-3 w-3" /> {offerUrgent ? "Última hora" : offerCountdown}
        </span>
      )}

      {/* U4: Selling fast badge with count */}
      {sellingFast && !isOutOfStock && (
        <span className="absolute z-10 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-semibold shadow-sm flex items-center gap-0.5" style={{ top: product.badge ? "2.5rem" : "0.75rem", left: "0.75rem" }}>
          {soldCount >= 20 ? (
            <span className="flex items-center gap-0.5 bg-[var(--accent)] text-white rounded-full px-2 py-0.5">
              <Star className="h-3 w-3 fill-current" /> Popular
            </span>
          ) : soldCount >= 5 ? (
            <span className="flex items-center gap-0.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded-full px-2 py-0.5">
              <Flame className="h-3 w-3" /> {soldCount} vendidos hoy
            </span>
          ) : (
            <span className="flex items-center gap-0.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded-full px-2 py-0.5">
              <Flame className="h-3 w-3" /> Vendiendo rápido
            </span>
          )}
        </span>
      )}

      {isOutOfStock && (
        <span className="absolute top-3 right-3 z-10 rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-white shadow-sm bg-gray-500">
          Agotado
        </span>
      )}
      {!isOutOfStock && product.socioPrice != null && product.socioPrice < product.price && (
        <span className="absolute top-3 right-3 z-10">
          <SocioPriceBadge
            regularPrice={product.price}
            socioPrice={product.socioPrice}
          />
        </span>
      )}
      {!isOutOfStock && product.stock === 1 && (
        <div className="absolute top-3 right-3 z-10">
          <ProductBadge intent="scarcity">Última unidad</ProductBadge>
        </div>
      )}
      {isLowStock && product.stock !== 1 && (
        <div className="absolute top-3 right-3 z-10">
          <ProductBadge intent="scarcity">Quedan {product.stock}</ProductBadge>
        </div>
      )}
      {/* #30: Scarcity real — stock <= 5 even when stockMin not configured */}
      {isScarcity && (
        <div className="absolute top-3 right-3 z-10">
          <ProductBadge intent="scarcity">Pocas unidades · {product.stock}</ProductBadge>
        </div>
      )}

      <button
        onClick={handleToggleFavorite}
        aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
        className={cn(
          // MK-12: mínimo 44px en mobile (h-11 w-11) para cumplir a11y tap target
          "absolute z-10 flex items-center justify-center h-11 w-11 rounded-full transition-all duration-200 pointer-events-auto",
          isOutOfStock || isLowStock || product.stock === 1 ? "top-8 right-1.5" : "top-1.5 right-1.5",
          fav
            ? "bg-[var(--data-error-500)] text-white shadow-md scale-110"
            : "bg-white/80 dark:bg-card/80 text-gray-400 hover:text-[var(--data-error-500)] hover:bg-white dark:hover:bg-card shadow-sm"
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

      <div
        className="relative aspect-square bg-[var(--surface-sunken)] overflow-hidden shrink-0 cursor-pointer"
        onClick={(e) => {
          if (isOutOfStock) return;
          e.stopPropagation();
          if (quickAdd) {
            quickAdd.openQuickAdd(product);
          }
        }}
      >
        {product.image && !imgError ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            loading="lazy"
            unoptimized={product.image.startsWith("data:")}
            className={cn(
              "object-cover transition-opacity duration-300 group-hover:scale-105",
              "[transition-property:opacity,transform] [transition-duration:300ms,500ms]",
              imgLoaded ? "opacity-100" : "opacity-0"
            )}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 20vw, 16vw"
            placeholder="blur"
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNCIgaGVpZ2h0PSI0IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4="
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        ) : (
          /* Placeholder estándar — sin ilustraciones decorativas. */
          <ProductImagePlaceholder size={32} />
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
            <span className="bg-gray-500/90 text-white text-[length:var(--ts-2xs)] font-bold px-2 py-1 rounded-full">Agotado</span>
          </div>
        )}
      </div>

      <div className="p-3 sm:p-4 flex flex-col gap-2 flex-1 min-h-[10.5rem] sm:min-h-[12rem]">
        {/* Z1: Recently viewed badge */}
        {recentlyViewed && !isOutOfStock && (
          <span className="text-xs font-semibold text-[var(--text-tertiary)] flex items-center gap-1 -mt-0.5 mb--0.5">
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} /> Lo viste hoy
          </span>
        )}
        {/* Click en el título abre el modal de quick-view (no PDP). En la
            tienda individual no hay página de detalle separada — toda la
            interacción se resuelve en el drawer lateral. */}
        <button
          type="button"
          className="flex-1 text-left"
          onClick={(e) => {
            e.stopPropagation();
            trackView(product);
            if (quickAdd) quickAdd.openQuickAdd(product);
          }}
        >
          <h3 className="font-bold text-foreground text-sm sm:text-base leading-snug line-clamp-2 hover:text-primary transition-colors">
            {product.name}
          </h3>
          <span className="mt-1 text-xs font-semibold text-primary/0 group-hover:text-primary/70 transition-colors leading-none inline-flex items-center gap-0.5">
            Ver detalles →
          </span>
        </button>

        {product.description && (
          <p className="text-xs sm:text-sm text-muted leading-snug line-clamp-2 -mt-0.5">
            {product.description}
          </p>
        )}

        {/* Star rating — editorial solid (Holded-style, no amber) */}
        {product.rating != null && product.rating > 0 && (
          <div className="flex items-center gap-1 -mt-0.5">
            <div className="flex items-center gap-px">
              {[1, 2, 3, 4, 5].map(s => (
                <Star
                  key={s}
                  className={cn(
                    "h-3 w-3",
                    s <= Math.round(product.rating!)
                      ? "text-[var(--text-primary)] fill-[var(--text-primary)]"
                      : "text-[var(--rule-base)]"
                  )}
                  strokeWidth={1.5}
                />
              ))}
            </div>
            <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)]">
              {Number(product.rating).toFixed(1)}
              {product.reviewCount != null && <span className="ml-0.5">({product.reviewCount})</span>}
            </span>
          </div>
        )}

        {/* AA2: Bulk discount hint */}
        {product.unit === "und" && product.price <= 15 && !isOutOfStock && (
          <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--accent)] bg-[var(--accent-soft)] rounded-md px-1.5 py-0.5 w-fit">Lleva 3+ · 5% off</span>
        )}

        <div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <div>
              {/* Precio canonico via DS: text-primary bold + previousPrice tachado */}
              {product.comparePrice && product.comparePrice > product.price ? (
                <div className="flex flex-col gap-0.5">
                  <ProductPrice
                    price={product.price}
                    previousPrice={product.comparePrice}
                    unit={product.unit}
                    size="md"
                  />
                  <span className="text-[length:var(--ts-2xs)] bg-[var(--accent-soft)] text-[var(--accent)] px-1.5 py-0.5 rounded font-bold w-fit">
                    -{Math.round(((product.comparePrice - product.price) / product.comparePrice) * 100)}%
                  </span>
                </div>
              ) : (
                <ProductPrice price={product.price} unit={product.unit} size="md" />
              )}
              {/* Stock indicator */}
              {product.stock != null && product.stock > 0 && !isLowStock && (
                <span className="block text-[length:var(--ts-2xs)] font-semibold text-gray-400 dark:text-muted mt-0.5">
                  Stock: {product.stock} {product.unit}
                </span>
              )}
              {isLowStock && (
                <span className="block text-[length:var(--ts-2xs)] font-semibold text-[var(--accent)] mt-0.5">
                  Solo quedan {product.stock}
                </span>
              )}
              {/* #30: Scarcity text below price */}
              {isScarcity && (
                <span className="block text-[length:var(--ts-2xs)] font-semibold text-[var(--accent)] mt-0.5">
                  Solo quedan {product.stock}
                </span>
              )}
              {isOutOfStock && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (quickAdd) quickAdd.openQuickAdd(product);
                  }}
                  className="flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)] mt-0.5 hover:text-[var(--accent)] transition-colors pointer-events-auto"
                >
                  <BellRing className="h-3 w-3" />
                  Avisarme cuando vuelva
                </button>
              )}
            </div>

            {qty === 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  // Si hay QuickAddProvider (marketplace), abre drawer con
                  // variaciones + cantidad. Sino, fallback a agregar directo.
                  if (quickAdd) {
                    quickAdd.openQuickAdd(product);
                  } else {
                    handleAdd();
                  }
                }}
                className={cn(
                  // MK-12: 44px mínimo en todos los tamaños
                  "flex items-center justify-center h-11 w-11 rounded-2xl text-white shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 shrink-0 animate-[scaleIn_0.15s_ease-out]",
                  justAdded ? "bg-[var(--accent)] scale-95" : "bg-primary hover:bg-primary-dark"
                )}
                aria-label={`Agregar ${product.name} al carrito`}
              >
                {/* Icono unificado: siempre carrito (no `+`). El click abre el
                    modal de quick-add donde el cliente confirma cantidad. */}
                {justAdded ? <span className="text-sm font-bold">✓</span> : <ShoppingCart className="h-5 w-5" strokeWidth={2.25} />}
              </button>
            ) : (
              // MK-12: botones +/- h-11 w-9 (44px alto) en todos los tamaños
              <div className="flex items-center bg-primary rounded-2xl overflow-hidden shadow-md animate-[scaleIn_0.15s_ease-out] shrink-0">
                <button
                  onClick={handleDecrement}
                  className="flex items-center justify-center h-11 w-9 text-white hover:bg-primary-dark transition-colors"
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
                  className="flex items-center justify-center h-11 w-9 text-white hover:bg-primary-dark transition-colors"
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
