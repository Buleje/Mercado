"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { m as motion } from "framer-motion";
import {
  ArrowLeft,
  ShoppingCart,
  Minus,
  Plus,
  Store,
  Share2,
  Package,
  Star,
  ChevronRight,
  Truck,
  Scale,
  Check,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { useCompare } from "@/contexts/compare-context";
import ProductGallery from "@/components/marketplace/ProductGallery";
import ProductVariantSelector from "@/components/marketplace/ProductVariantSelector";
import { RecommendationsWidget } from "@/components/marketplace/RecommendationsWidget";
import SubscribeAndSaveWidget, {
  isSubscribableCategory,
} from "@/components/marketplace/product-detail/SubscribeAndSaveWidget";
import { BulejeAssistant } from "@/components/marketplace/product-detail/BulejeAssistant";
import { BotMessageSquare } from "lucide-react";
import ProductReviews from "@/components/marketplace/product-detail/ProductReviews";
import ProductQA from "@/components/marketplace/product-detail/ProductQA";

// ── Types ────────────────────────────────────────────────────────────────────

interface ProductData {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  wholesalePrice: number | null;
  basePrice: number;
  unit: string | null;
  badge: string | null;
  stock: number | null;
  image: string;
  images: { id: string; url: string; alt: string | null; isPrimary: boolean }[];
  variants: {
    id: string;
    name: string;
    sku: string | null;
    priceModifier: number;
    stock: number | null;
    attributesJson: string | null;
  }[];
  storeProductId: string;
  minOrderQty: number;
  store: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    description: string | null;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Component ────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const params = useParams<{ slug: string; productId: string }>();
  const router = useRouter();
  const { addItem } = useMarketplaceCart();
  const { add: addToCompare, remove: removeCompare, isIn: isInCompare, max: compareMax, items: compareItems } = useCompare();

  const [product, setProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>();
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [added, setAdded] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => {
    if (!params.productId) return;
    setLoading(true);
    fetch(`/api/marketplace/products/${params.productId}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((json) => {
        setProduct(json.data);
        setQuantity(json.data.minOrderQty || 1);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [params.productId]);

  const handleVariantSelect = useCallback((variantId: string, price: number) => {
    setSelectedVariantId(variantId);
    setFinalPrice(price);
  }, []);

  const displayPrice = finalPrice ?? product?.price ?? 0;

  const handleAddToCart = useCallback(() => {
    if (!product) return;
    addItem({
      storeId: product.store.id,
      storeName: product.store.name,
      storeSlug: product.store.slug,
      storeProductId: product.storeProductId,
      productId: product.id,
      name: product.name,
      price: displayPrice,
      image: product.image,
      unit: product.unit,
      quantity,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }, [product, addItem, displayPrice, quantity]);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: product?.name, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
  }, [product]);

  const handleToggleCompare = useCallback(() => {
    if (!product) return;
    if (isInCompare(product.id)) {
      removeCompare(product.id);
      return;
    }
    if (compareItems.length >= compareMax) {
      return;
    }
    addToCompare({
      id: product.id,
      name: product.name,
      category: product.category ?? "",
      price: displayPrice,
      image: product.image,
      unit: product.unit ?? "",
      badge: product.badge ?? undefined,
      stock: product.stock ?? undefined,
      description: product.description ?? undefined,
      storeSlug: product.store.slug,
      storeName: product.store.name,
    });
  }, [product, isInCompare, removeCompare, addToCompare, compareItems.length, compareMax, displayPrice]);

  const inCompare = product ? isInCompare(product.id) : false;
  const compareFull = compareItems.length >= compareMax;

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="animate-pulse grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="aspect-square rounded-2xl bg-gray-200 dark:bg-gray-800" />
            <div className="space-y-4">
              <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-8 w-3/4 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-800 rounded" />
              <div className="h-12 w-48 bg-gray-200 dark:bg-gray-800 rounded-xl mt-6" />
              <div className="h-14 w-full bg-gray-200 dark:bg-gray-800 rounded-xl mt-4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/5 dark:bg-primary/10 text-primary">
            <Package className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
            Producto no encontrado
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Este producto ya no está disponible o la tienda lo retiró.
          </p>
          <Link
            href={`/marketplace/${params.slug}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a la tienda
          </Link>
        </div>
      </div>
    );
  }

  // ── Gallery images ───────────────────────────────────────────────────────

  const galleryImages =
    product.images.length > 0
      ? product.images.map((img) => ({ url: img.url, alt: img.alt ?? product.name }))
      : product.image
        ? [{ url: product.image, alt: product.name }]
        : [];

  const inStock = product.stock === null || product.stock > 0;
  const stockBajo = product.stock !== null && product.stock > 0 && product.stock <= 5;

  // ── JSON-LD ──────────────────────────────────────────────────────────────

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || "",
    image: product.image,
    offers: {
      "@type": "Offer",
      price: displayPrice,
      priceCurrency: "PEN",
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: product.store.name },
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <nav className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
            <Link href="/marketplace" className="hover:text-primary transition-colors">
              Marketplace
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link
              href={`/marketplace/${product.store.slug}`}
              className="hover:text-primary transition-colors"
            >
              {product.store.name}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-gray-800 dark:text-gray-200 font-medium truncate max-w-48">
              {product.name}
            </span>
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-6xl px-4 py-6 lg:py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12"
        >
          {/* LEFT — Gallery */}
          <div>
            <ProductGallery
              images={galleryImages}
              productName={product.name}
              fallbackImage={product.image || undefined}
            />
          </div>

          {/* RIGHT — Info */}
          <div className="space-y-6">
            {/* Store badge */}
            <Link
              href={`/marketplace/${product.store.slug}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 dark:bg-primary/10 text-primary text-sm font-medium hover:bg-primary/10 transition-colors"
            >
              {product.store.logo ? (
                <Image
                  src={product.store.logo}
                  alt={product.store.name}
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <Store className="h-4 w-4" />
              )}
              {product.store.name}
            </Link>

            {/* Title + badge */}
            <div>
              <div className="flex items-start gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                  {product.name}
                </h1>
                {product.badge && (
                  <span className="shrink-0 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary text-xs font-bold uppercase mt-1">
                    {product.badge}
                  </span>
                )}
              </div>
              {product.category && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {product.category}
                </p>
              )}
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-gray-900 dark:text-white">
                {fmt(displayPrice)}
              </span>
              {product.unit && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  / {product.unit}
                </span>
              )}
              {product.wholesalePrice && (
                <span className="text-sm text-primary font-semibold">
                  Mayorista: {fmt(product.wholesalePrice)}
                </span>
              )}
            </div>

            {/* Stock status */}
            <div className="flex items-center gap-2">
              {inStock ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    {stockBajo ? `¡Solo quedan ${product.stock}!` : "En stock"}
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-[var(--data-error-500)]" />
                  <span className="text-sm font-medium text-[var(--data-error-500)]">Agotado</span>
                </>
              )}
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 flex items-center gap-1">
                <Truck className="h-3.5 w-3.5" />
                Delivery disponible
              </span>
            </div>

            {/* Description */}
            {product.description && (
              <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                {product.description}
              </p>
            )}

            {/* Asistente Buleje CTA */}
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-primary/40 hover:text-primary transition-colors"
              aria-label="Abrir el asistente Buleje para preguntar sobre este producto"
            >
              <BotMessageSquare className="h-4 w-4" />
              ¿Tienes dudas? Preguntale al asistente
            </button>

            {/* Variants */}
            {product.variants.length > 0 && (
              <ProductVariantSelector
                variants={product.variants}
                basePrice={product.price}
                selectedVariantId={selectedVariantId}
                onSelect={handleVariantSelect}
              />
            )}

            {/* Bodega al Mes — Subscribe & Save */}
            {isSubscribableCategory(product.category) && (
              <SubscribeAndSaveWidget
                productId={product.id}
                productName={product.name}
                productImage={product.image || ""}
                unitPrice={displayPrice}
                quantity={quantity}
              />
            )}

            {/* Quantity selector + Add to cart */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Cantidad:
                </span>
                <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setQuantity((q) => Math.max(product.minOrderQty || 1, q - 1))}
                    className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Menos"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="px-4 py-2 text-sm font-bold min-w-12 text-center">
                    {quantity}
                  </span>
                  <button
                    onClick={() =>
                      setQuantity((q) =>
                        product.stock !== null ? Math.min(product.stock, q + 1) : q + 1
                      )
                    }
                    className="p-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Más"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={!inStock}
                className={cn(
                  "w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-xl active:scale-[0.98]",
                  added
                    ? "bg-green-500 text-white shadow-green-500/25"
                    : "bg-primary hover:bg-primary-dark text-white shadow-primary/25 disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                <ShoppingCart className="h-5 w-5" />
                {added
                  ? "¡Agregado al carrito!"
                  : `Agregar al carrito · ${fmt(displayPrice * quantity)}`}
              </button>

              <div className="grid grid-cols-2 gap-3">
                {/* Share */}
                <button
                  onClick={handleShare}
                  className="py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Share2 className="h-4 w-4" />
                  Compartir
                </button>

                {/* Compare */}
                <button
                  onClick={handleToggleCompare}
                  disabled={!inCompare && compareFull}
                  className={cn(
                    "py-3 rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 transition-colors",
                    inCompare
                      ? "border-primary bg-primary/5 dark:bg-primary/10 text-primary hover:bg-primary/10"
                      : compareFull
                        ? "border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-gray-400 cursor-not-allowed"
                        : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800",
                  )}
                  title={
                    !inCompare && compareFull
                      ? `Máximo ${compareMax} productos en comparación`
                      : inCompare
                        ? "Quitar de comparación"
                        : "Agregar a comparación"
                  }
                >
                  {inCompare ? (
                    <>
                      <Check className="h-4 w-4" />
                      En comparación
                    </>
                  ) : (
                    <>
                      <Scale className="h-4 w-4" />
                      Comparar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Reviews (rating breakdown + lista filtrable + write modal) */}
        <div className="mt-12 lg:mt-16">
          <ProductReviews productId={product.id} productName={product.name} />
        </div>

        {/* Q&A (preguntas de la comunidad + vendor badge) */}
        <div className="mt-12 lg:mt-16">
          <ProductQA productId={product.id} storeName={product.store.name} />
        </div>

        {/* Recommendations */}
        <div className="mt-12 lg:mt-16">
          <RecommendationsWidget
            productId={product.id}
            storeSlug={product.store.slug}
            title="También te puede gustar"
          />
        </div>
      </div>

      {/* Sticky mobile add-to-cart bar */}
      <div
        className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-t border-gray-200 dark:border-gray-800 p-3 safe-area-bottom"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{product?.name}</p>
            <p className="text-lg font-extrabold text-gray-900 dark:text-white">
              {fmt(displayPrice * quantity)}
            </p>
          </div>
          <button
            onClick={handleAddToCart}
            disabled={!inStock}
            className={cn(
              "px-6 py-3.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all active:scale-[0.98]",
              added
                ? "bg-green-500 text-white"
                : "bg-primary hover:bg-primary-dark text-white disabled:opacity-40"
            )}
          >
            <ShoppingCart className="h-4 w-4" />
            {added ? "¡Listo!" : "Agregar"}
          </button>
        </div>
      </div>
      <div className="h-20 lg:hidden" />

      {/* Asistente Buleje — widget flotante + panel lateral */}
      <BulejeAssistant
        key={`assistant-${product.id}-${assistantOpen ? "open" : "closed"}`}
        product={{
          id: product.id,
          name: product.name,
          description: product.description,
          category: product.category,
          storeName: product.store.name,
        }}
        defaultOpen={assistantOpen}
      />
    </div>
  );
}
