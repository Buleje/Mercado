"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Plus, Minus, ShoppingCart, Heart, Share2, ChevronRight,
  Package, Truck, Shield, Clock, Star, GitCompareArrows,
  BellRing, CheckCircle2, Loader2, Eye,
} from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useFavorites } from "@/contexts/favorites-context";
import { useCompare } from "@/contexts/compare-context";
import { useCachedData } from "@/hooks/use-cached-data";
import { useStoreProducts } from "@/hooks/use-store-products";
import { cn } from "@/lib/utils";
import type { Product } from "@/data/products";
import ProductGallery from "@/components/ProductGallery";
import ProductReviewsSection from "@/components/ProductReviewsSection";
import AlsoBoughtSection from "@/components/AlsoBoughtSection";
import PriceComparisonBadge from "@/components/PriceComparisonBadge";
import ProductBadges from "@/components/marketplace/ProductBadges";
import ProductVariantSelector from "@/components/marketplace/ProductVariantSelector";
import RatingByAttribute from "@/components/marketplace/RatingByAttribute";

function getProductSlug(product: { name: string; id: number }): string {
  return product.name
    .toLowerCase()
    .replace(/[áàä]/g, "a")
    .replace(/[éèë]/g, "e")
    .replace(/[íìï]/g, "i")
    .replace(/[óòö]/g, "o")
    .replace(/[úùü]/g, "u")
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    + `-${product.id}`;
}

type LiveProduct = Product & { stock?: number; stockMin?: number };

interface ProductVariant {
  id: string;
  name: string;
  sku?: string | null;
  priceModifier: number;
  stock?: number | null;
  attributesJson?: string | null;
}

interface DetailedReview {
  id: string;
  name: string;
  date: string;
  rating: number;
  qualityRating?: number;
  priceRating?: number;
  deliveryRating?: number;
  text: string;
  photosJson?: string | null;
  helpfulCount: number;
  verified: boolean;
}

interface ReviewSummary {
  avgRating: number;
  avgQuality?: number;
  avgPrice?: number;
  avgDelivery?: number;
  totalReviews: number;
  ratingDistribution: { [key: number]: number };
}

interface ProductDetailClientProps {
  product: Product;
}

export default function ProductDetailClient({ product }: ProductDetailClientProps) {
  const { items, addItem, updateQty } = useCart();
  const { showToast } = useToast();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const { add: addCompare, isIn: isCompare, remove: removeCompare } = useCompare();
  const { products, categories } = useStoreProducts();

  const cartItem = items.find((i) => i.id === product.id);
  const qty = cartItem?.quantity ?? 0;
  const fav = isFavorite(String(product.id));
  const compare = isCompare(product.id);
  const [copied, setCopied] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>();
  const [variantFinalPrice, setVariantFinalPrice] = useState<number | undefined>();

  // Fetch product variants
  // TODO: conectar a API real cuando backend termine → /api/marketplace/products/${product.id}/variants
  const { data: variants = [] } = useCachedData<ProductVariant[]>(
    `product-variants-${product.id}`,
    async () => {
      try {
        const res = await fetch(`/api/marketplace/products/${product.id}/variants`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.data) ? data.data : [];
      } catch { return []; }
    },
    { staleTime: 5 * 60 * 1000, refetchOnFocus: false },
  );

  // Fetch product badges
  // TODO: conectar a API real cuando backend termine → /api/marketplace/products/${product.id}/badges
  const { data: productBadges = [] } = useCachedData<string[]>(
    `product-badges-${product.id}`,
    async () => {
      try {
        const res = await fetch(`/api/marketplace/products/${product.id}/badges`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.data) ? data.data : [];
      } catch { return []; }
    },
    { staleTime: 10 * 60 * 1000, refetchOnFocus: false },
  );

  // Fetch detailed reviews with attribute ratings
  // TODO: conectar a API real cuando backend termine → /api/marketplace/products/${product.id}/reviews-detailed
  const { data: reviewsDetailed } = useCachedData<{ summary: ReviewSummary; reviews: DetailedReview[] }>(
    `product-reviews-detailed-${product.id}`,
    async () => {
      try {
        const res = await fetch(`/api/marketplace/products/${product.id}/reviews-detailed`);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.data ?? null;
      } catch { return null; }
    },
    { staleTime: 5 * 60 * 1000, refetchOnFocus: false },
  );

  // Restock notification state
  const [restockPhone, setRestockPhone] = useState("");
  const [restockSubmitted, setRestockSubmitted] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return !!localStorage.getItem(`bsm-restock-${product.id}`); } catch { return false; }
  });
  const [restockLoading, setRestockLoading] = useState(false);

  const handleRestockNotify = useCallback(async () => {
    const phone = restockPhone.trim();
    if (!phone || phone.length < 6) return;
    setRestockLoading(true);
    try {
      const res = await fetch(`/api/products/${product.id}/notify-restock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (res.ok) {
        setRestockSubmitted(true);
        localStorage.setItem(`bsm-restock-${product.id}`, "1");
      }
    } catch { /* silent */ }
    setRestockLoading(false);
  }, [restockPhone, product.id]);

  // Fetch live stock data
  const { data: liveProduct } = useCachedData<LiveProduct>(
    `product-live-${product.id}`,
    async () => {
      const res = await fetch("/api/products");
      if (!res.ok) return product;
      const data = await res.json();
      const found = (Array.isArray(data) ? data : []).find(
        (p: LiveProduct) => p.id === product.id,
      );
      return found ?? product;
    },
    { staleTime: 60 * 1000 },
  );

  const stock = liveProduct?.stock;
  const stockMin = liveProduct?.stockMin ?? 5;
  const isOutOfStock = stock != null && stock <= 0;

  // Fetch reviews for star display
  const { data: reviews = [] } = useCachedData<
    Array<{ name: string; rating: number; comment: string; createdAt: string }>
  >(
    `product-reviews-${product.id}`,
    async () => {
      const res = await fetch(`/api/reviews?productId=${product.id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    { staleTime: 5 * 60 * 1000, refetchOnFocus: false },
  );

  // Fetch price history
  const { data: priceHistory = [] } = useCachedData<Array<{ price: number; createdAt: string }>>(
    `price-history-${product.id}`,
    async () => {
      const res = await fetch(`/api/price-history?productId=${product.id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.slice(-10) : [];
    },
    { staleTime: 30 * 60 * 1000, refetchOnFocus: false },
  );

  // Fetch volume pricing tiers
  const { data: volumeTiers = [] } = useCachedData<Array<{ minQty: number; discount: number }>>(
    `volume-tiers-${product.id}`,
    async () => {
      try {
        const res = await fetch(`/api/wholesale/pricing?productId=${product.id}`);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data?.tiers) ? data.tiers : [];
      } catch { return []; }
    },
    { staleTime: 10 * 60 * 1000, refetchOnFocus: false },
  );

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : 0;

  // Track recently viewed
  useEffect(() => {
    try {
      const key = "bsm-recently-viewed";
      const saved: Product[] = JSON.parse(localStorage.getItem(key) || "[]");
      const filtered = saved.filter((p: Product) => p.id !== product.id);
      filtered.unshift(product);
      localStorage.setItem(key, JSON.stringify(filtered.slice(0, 12)));
      window.dispatchEvent(new Event("bsm:productViewed"));
    } catch {}
  }, [product]);

  const handleAdd = () => {
    if (isOutOfStock) return;
    const effectivePrice = variantFinalPrice ?? product.price;
    addItem({ ...product, price: effectivePrice });
    showToast(product.name, product.image);
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: product.name, text: `${product.name} — S/${product.price.toFixed(2)}`, url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const category = categories.find((c) => c.id === product.category);
  const relatedProducts = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  // Build gallery images — main + alternative angle crops
  const galleryImages = [
    product.image,
    product.image.replace("w=400&h=400", "w=800&h=600"),
    product.image.replace("w=400&h=400", "w=600&h=800"),
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-background">
      {/* Breadcrumbs */}
      <nav className="max-w-6xl mx-auto px-4 py-4" aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-sm text-muted flex-wrap">
          <li>
            <Link href="/" className="hover:text-primary transition-colors">
              Inicio
            </Link>
          </li>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <li>
            <Link href="/tienda" className="hover:text-primary transition-colors">
              Tienda
            </Link>
          </li>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          {category && (
            <>
              <li>
                <Link
                  href={`/tienda/categoria/${category.id}`}
                  className="hover:text-primary transition-colors"
                >
                  {category.emoji} {category.label}
                </Link>
              </li>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </>
          )}
          <li className="text-foreground font-medium truncate max-w-50">
            {product.name}
          </li>
        </ol>
      </nav>

      {/* Main product section */}
      <div className="max-w-6xl mx-auto px-4 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Gallery */}
          <ProductGallery images={galleryImages} alt={product.name} />

          {/* Product info */}
          <div className="space-y-6">
            {/* Title & meta */}
            <div>
              {(product.badge || productBadges.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {product.badge && (
                    <span
                      className={cn(
                        "inline-block px-3 py-1 rounded-full text-xs font-bold uppercase text-white",
                        product.badge === "Oferta" && "bg-red-500",
                        product.badge === "Popular" && "bg-secondary",
                        product.badge === "Fresco" && "bg-emerald-500",
                        product.badge === "Premium" && "bg-violet-600",
                      )}
                    >
                      {product.badge}
                    </span>
                  )}
                  <ProductBadges badges={productBadges} />
                </div>
              )}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground leading-tight">
                {product.name}
              </h1>
              {/* Mejora 11: Social proof — personas viendo */}
              {!isOutOfStock && (() => {
                const viewers = Math.floor(((product.id * 7 + 3) % 5) + 1);
                return (
                  <p className="flex items-center gap-1 mt-1.5 text-xs text-gray-500 dark:text-muted">
                    <Eye className="h-3.5 w-3.5" />
                    {viewers} {viewers === 1 ? "persona esta" : "personas estan"} viendo esto ahora
                  </p>
                );
              })()}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {category && (
                  <span className="text-sm text-muted">
                    {category.emoji} {category.label}
                  </span>
                )}
                {reviews.length > 0 && (
                  <a
                    href="#resenas"
                    className="flex items-center gap-1 text-sm hover:text-primary transition-colors"
                  >
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    <span className="font-semibold text-foreground">
                      {avgRating.toFixed(1)}
                    </span>
                    <span className="text-muted">({reviews.length} reseñas)</span>
                  </a>
                )}
              </div>
            </div>

            {/* Price */}
            <div className="bg-gray-50 dark:bg-surface rounded-2xl p-5 border border-gray-100 dark:border-card-border">
              <div className="flex items-end gap-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-primary">
                  S/{product.price.toFixed(2)}
                </span>
                <span className="text-base text-muted mb-1">por {product.unit}</span>
              </div>
              {stock != null && (
                <span
                  className={cn(
                    "inline-block mt-3 text-xs font-semibold px-3 py-1 rounded-full",
                    stock <= 0
                      ? "bg-red-50 text-red-500 dark:bg-red-500/10"
                      : stock <= stockMin
                        ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10"
                        : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10",
                  )}
                >
                  {stock <= 0
                    ? "Agotado"
                    : stock <= stockMin
                      ? `¡Solo quedan ${stock}!`
                      : `${stock} en stock`}
                </span>
              )}
              <div className="mt-3">
                <PriceComparisonBadge productId={product.id} />
              </div>
            </div>

            {/* Restock notification — shown when product is out of stock */}
            {isOutOfStock && (
              <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-700/40 rounded-2xl p-4">
                {restockSubmitted ? (
                  <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <p className="text-sm font-semibold">Te avisaremos por WhatsApp cuando vuelva a estar disponible.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <BellRing className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
                        Quiero que me avisen cuando vuelva
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={restockPhone}
                        onChange={e => setRestockPhone(e.target.value)}
                        placeholder="Tu WhatsApp (ej: 961234567)"
                        className="flex-1 px-3 py-2.5 rounded-xl text-sm border border-amber-300 dark:border-amber-600 bg-white dark:bg-surface text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <button
                        onClick={handleRestockNotify}
                        disabled={restockLoading || restockPhone.trim().length < 6}
                        className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        {restockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                        Avisarme
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mejora 11: Alternativas cuando producto agotado */}
            {isOutOfStock && (() => {
              const alternatives = products
                .filter((p) => p.category === product.category && p.id !== product.id && (p.stock == null || p.stock > 0))
                .slice(0, 3);
              return (
                <div className="bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-700/40 rounded-2xl p-4">
                  {alternatives.length > 0 ? (
                    <>
                      <p className="text-sm font-bold text-blue-700 dark:text-blue-300 mb-3">Prueba estas alternativas:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {alternatives.map((alt) => (
                          <Link
                            key={alt.id}
                            href={`/tienda/producto/${getProductSlug(alt)}`}
                            className="flex items-center gap-3 bg-white dark:bg-surface rounded-xl p-2.5 border border-blue-100 dark:border-card-border hover:border-primary/40 transition-colors group"
                          >
                            <Image src={alt.image} alt={alt.name} width={48} height={48} className="rounded-lg object-cover shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">{alt.name}</p>
                              <p className="text-xs font-semibold text-primary">S/{alt.price.toFixed(2)}</p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold">Vuelve pronto, estamos reabasteciendo.</p>
                  )}
                </div>
              );
            })()}

            {/* Volume discount tiers */}
            {volumeTiers.length > 0 && (
              <div className="bg-linear-to-r from-amber-50 to-orange-50 dark:from-amber-900/15 dark:to-orange-900/15 border border-amber-200 dark:border-amber-700/40 rounded-2xl p-4">
                <p className="text-sm font-bold text-amber-700 dark:text-amber-300 mb-2.5 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Comprá más, pagá menos
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[...volumeTiers].sort((a, b) => a.minQty - b.minQty).map((tier) => {
                    const discountedPrice = product.price * (1 - tier.discount / 100);
                    const isActive = qty >= tier.minQty;
                    return (
                      <div
                        key={tier.minQty}
                        className={cn(
                          "text-center rounded-xl p-2.5 border transition-all",
                          isActive
                            ? "bg-primary/10 border-primary/40 ring-1 ring-primary/20"
                            : "bg-white dark:bg-surface border-gray-200 dark:border-card-border"
                        )}
                      >
                        <p className="text-xs font-bold text-muted">{tier.minQty}+ unidades</p>
                        <p className="text-lg font-extrabold text-primary">-{tier.discount}%</p>
                        <p className="text-xs text-muted">S/{discountedPrice.toFixed(2)} c/u</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Variantes del producto */}
            {variants.length > 0 && (
              <ProductVariantSelector
                variants={variants}
                basePrice={product.price}
                selectedVariantId={selectedVariantId}
                onSelect={(variantId, finalPrice) => {
                  setSelectedVariantId(variantId);
                  setVariantFinalPrice(finalPrice);
                }}
              />
            )}

            {/* Add to cart */}
            <div className="flex items-center gap-3">
              {qty === 0 ? (
                <button
                  onClick={handleAdd}
                  disabled={isOutOfStock}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-6 py-4 font-bold text-base shadow-md hover:bg-primary-dark active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <ShoppingCart className="h-5 w-5" />
                  Agregar al carrito
                </button>
              ) : (
                <div className="flex-1 flex items-center gap-3">
                  <div className="flex items-center bg-primary rounded-xl overflow-hidden shadow-md">
                    <button
                      onClick={() => updateQty(product.id, qty - 1)}
                      className="h-12 w-12 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"
                    >
                      <Minus className="h-5 w-5" />
                    </button>
                    <span className="w-12 text-center font-bold text-white text-lg">
                      {qty}
                    </span>
                    <button
                      onClick={handleAdd}
                      className="h-12 w-12 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-primary">
                    En carrito · S/{(product.price * qty).toFixed(2)}
                  </span>
                </div>
              )}
              <button
                onClick={() => toggleFav(String(product.id))}
                className={cn(
                  "h-12 w-12 rounded-xl flex items-center justify-center border-2 transition-all shrink-0",
                  fav
                    ? "bg-red-50 border-red-200 text-red-500 dark:bg-red-500/10 dark:border-red-500/30"
                    : "border-gray-200 dark:border-card-border text-gray-400 hover:text-red-500 hover:border-red-200",
                )}
                aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
              >
                <Heart className={cn("h-5 w-5", fav && "fill-current")} />
              </button>
              <button
                onClick={() =>
                  compare ? removeCompare(product.id) : addCompare(product)
                }
                className={cn(
                  "h-12 w-12 rounded-xl flex items-center justify-center border-2 transition-all shrink-0",
                  compare
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-gray-200 dark:border-card-border text-gray-400 hover:text-primary hover:border-primary/30",
                )}
                aria-label={compare ? "Quitar de comparar" : "Comparar"}
              >
                <GitCompareArrows className="h-5 w-5" />
              </button>
              <button
                onClick={handleShare}
                className="h-12 w-12 rounded-xl flex items-center justify-center border-2 border-gray-200 dark:border-card-border text-gray-400 hover:text-primary hover:border-primary/30 transition-all shrink-0 relative"
                aria-label="Compartir"
              >
                <Share2 className="h-5 w-5" />
                {copied && (
                  <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs bg-foreground text-white dark:bg-white dark:text-background px-2 py-1 rounded-lg whitespace-nowrap">
                    ¡Copiado!
                  </span>
                )}
              </button>
            </div>

            {/* Benefits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: Truck, text: "Delivery gratis a domicilio", color: "text-emerald-500" },
                { icon: Clock, text: "Entrega en 30-60 minutos", color: "text-blue-500" },
                { icon: Shield, text: "Pago seguro: Yape o efectivo", color: "text-violet-500" },
                { icon: Package, text: "Productos frescos garantizados", color: "text-amber-500" },
              ].map((b, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 bg-gray-50 dark:bg-surface rounded-xl p-3 border border-gray-100 dark:border-card-border"
                >
                  <b.icon className={cn("h-5 w-5 shrink-0", b.color)} />
                  <span className="text-sm font-medium text-foreground">{b.text}</span>
                </div>
              ))}
            </div>

            {/* Mejora 15: Historial de precios mejorado con badges e insights */}
            {priceHistory.length > 1 && (() => {
              const prices = priceHistory.map((p) => p.price);
              const min = Math.min(...prices);
              const max = Math.max(...prices);
              const range = max - min || 1;
              const W = (priceHistory.length - 1) * 40;
              const currentPrice = prices[prices.length - 1];
              const isBestPrice = currentPrice <= min;
              const points = prices
                .map((p, i) => `${i * 40},${50 - ((p - min) / range) * 42}`)
                .join(" ");
              return (
                <div className="bg-white dark:bg-card rounded-xl p-4 border border-gray-100 dark:border-card-border">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-muted">
                      📈 Historial de precios
                    </p>
                    {isBestPrice && (
                      <span className="px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-[10px] font-bold animate-pulse">
                        🔥 Mejor precio
                      </span>
                    )}
                  </div>
                  <div className="relative h-14 group">
                    <svg
                      viewBox={`0 0 ${W || 1} 55`}
                      className="w-full h-full"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id="pdGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00B4A6" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#00B4A6" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <path
                        d={`${points
                          .split(" ")
                          .map((p, i) => (i === 0 ? `M${p}` : `L${p}`))
                          .join(" ")} L${W},55 L0,55 Z`}
                        fill="url(#pdGrad)"
                      />
                      <polyline
                        points={points}
                        fill="none"
                        stroke="#00B4A6"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      {prices.map((p, i) => (
                        <g key={i}>
                          <circle
                            cx={i * 40}
                            cy={50 - ((p - min) / range) * 42}
                            r="3"
                            fill={i === prices.length - 1 ? "#00B4A6" : "#2dd4bf"}
                            stroke="white"
                            strokeWidth="1.5"
                          />
                          <title>
                            {new Date(priceHistory[i].createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}: S/{p.toFixed(2)}
                          </title>
                        </g>
                      ))}
                    </svg>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
                    <span>
                      {new Date(priceHistory[0].createdAt).toLocaleDateString("es-PE", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                    <span className="font-semibold text-primary">
                      S/{currentPrice.toFixed(2)} actual
                    </span>
                    <span>
                      {new Date(
                        priceHistory[priceHistory.length - 1].createdAt,
                      ).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                  {/* Price range summary */}
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-400">
                    <span>Más bajo: <strong className="text-[#00B4A6]">S/{min.toFixed(2)}</strong></span>
                    <span className="text-gray-200 dark:text-gray-700">|</span>
                    <span>Más alto: <strong className="text-red-400">S/{max.toFixed(2)}</strong></span>
                    {prices.length >= 2 && (
                      <>
                        <span className="text-gray-200 dark:text-gray-700">|</span>
                        <span>
                          {currentPrice <= prices[prices.length - 2]
                            ? `↓ ${((1 - currentPrice / prices[prices.length - 2]) * 100).toFixed(0)}% vs anterior`
                            : `↑ ${((currentPrice / prices[prices.length - 2] - 1) * 100).toFixed(0)}% vs anterior`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
            {priceHistory.length === 1 && (
              <div className="bg-white dark:bg-card rounded-xl p-3 border border-gray-100 dark:border-card-border">
                <p className="text-xs text-gray-400 text-center">📊 Precio estable — sin variaciones recientes</p>
              </div>
            )}
          </div>
        </div>

        {/* Reviews section */}
        <div id="resenas" className="mt-12 lg:mt-16">
          <ProductReviewsSection productId={product.id} productName={product.name} />
          {reviewsDetailed && (
            <div className="mt-8 bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">
                Resenas detalladas
              </h3>
              <RatingByAttribute
                summary={reviewsDetailed.summary}
                reviews={reviewsDetailed.reviews}
              />
            </div>
          )}
        </div>

        {/* Also bought — cross-sell */}
        <AlsoBoughtSection productId={product.id} productName={product.name} />

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <div className="mt-12 lg:mt-16">
            <h2 className="text-xl sm:text-2xl font-extrabold text-foreground mb-6">
              Productos relacionados
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {relatedProducts.map((rp) => (
                <Link
                  key={rp.id}
                  href={`/tienda/${getProductSlug(rp)}`}
                  className="group bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border overflow-hidden hover:shadow-lg transition-all"
                >
                  <div className="relative aspect-square bg-gray-50 dark:bg-surface">
                    {rp.image && (
                      <Image
                        src={rp.image}
                        alt={rp.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        sizes="(max-width: 640px) 50vw, 25vw"
                      />
                    )}
                    {rp.badge && (
                      <span className="absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase text-white bg-primary">
                        {rp.badge}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                      {rp.name}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="font-extrabold text-primary text-sm">
                        S/{rp.price.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted">{rp.unit}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
