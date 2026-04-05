"use client";

import { useState, useEffect, useCallback, useDeferredValue } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import MarketplaceChat from "@/components/marketplace/MarketplaceChat";
import MarketplaceCart from "@/components/marketplace/MarketplaceCart";

// ---------- tipos ----------

interface StoreInfo {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  banner: string | null;
  category: string;
  zone: string;
  rating: number | null;
  reviewCount: number;
  description: string | null;
  isOpen?: boolean;
  vacationMode?: boolean;
  vacationMessage?: string | null;
}

interface StoreProduct {
  id: number;
  storeProductId: string;
  name: string;
  price: number;
  unit: string | null;
  image: string | null;
  category: string | null;
  stock: number;
}

// ---------- helpers ----------

function StarRating({ rating, count }: { rating: number | null; count: number }) {
  const r = rating ?? 0;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          aria-hidden="true"
          className={`h-4 w-4 ${s <= Math.round(r) ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1 text-sm font-medium text-gray-600 dark:text-gray-400">
        {r > 0 ? r.toFixed(1) : "Sin rating"} · {count} reseñas
      </span>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800 ${className}`} />
  );
}

function ProductCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="h-40 rounded-t-2xl bg-gray-200 dark:bg-gray-800" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-9 w-full rounded-xl bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}

// ---------- product card ----------

function ProductCard({
  product,
  storeId,
  storeName,
  storeSlug,
  onAdded,
  vacationMode,
}: {
  product: StoreProduct;
  storeId: string;
  storeName: string;
  storeSlug: string;
  onAdded: (productName: string) => void;
  vacationMode?: boolean;
}) {
  const [justAdded, setJustAdded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const { addItem, byStore, updateQuantity, removeItem } = useMarketplaceCart();

  // Find current qty in cart
  const cartItems = byStore[storeId]?.items ?? [];
  const cartItem = cartItems.find((i) => i.productId === product.id);
  const qty = cartItem?.quantity ?? 0;

  const handleAdd = () => {
    addItem({
      storeId,
      storeName,
      storeSlug,
      storeProductId: product.storeProductId,
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      unit: product.unit,
    });
    onAdded(product.name);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  const handleDecrement = () => {
    if (qty <= 1) {
      removeItem(storeId, product.id);
    } else {
      updateQuantity(storeId, product.id, qty - 1);
    }
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

  const isOutOfStock = product.stock === 0 || !!vacationMode;
  const isLowStock = !isOutOfStock && product.stock > 0 && product.stock <= 5;

  return (
    <article
      className={`group relative flex flex-col rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-xl hover:shadow-primary/10 hover:border-primary/20 transition-shadow duration-300 ${isOutOfStock ? "opacity-60" : ""}`}
    >
      {/* Badges */}
      {isOutOfStock && (
        <span className="absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm bg-gray-500">
          Agotado
        </span>
      )}
      {!isOutOfStock && product.stock === 1 && (
        <span className="absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase text-white shadow-sm bg-red-500 animate-pulse">
          ¡Última unidad!
        </span>
      )}
      {isLowStock && product.stock !== 1 && (
        <span className="absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase text-white shadow-sm bg-amber-500 animate-pulse">
          ¡Solo {product.stock}!
        </span>
      )}

      {/* Image — aspect-square with hover zoom */}
      <div className="relative aspect-square bg-gray-50 dark:bg-gray-800 overflow-hidden shrink-0">
        {product.image && !imgError ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            className={`object-cover group-hover:scale-110 transition-all duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-300 gap-2">
            <svg aria-hidden="true" className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Sin imagen</span>
          </div>
        )}

        {isOutOfStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="bg-gray-500/90 text-white text-[9px] font-bold px-2 py-1 rounded-full">Agotado</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-2.5 sm:p-3 flex flex-col gap-1.5 flex-1 min-h-[9.5rem] sm:min-h-[10.5rem]">
        <h3 className="font-semibold text-gray-900 dark:text-white text-xs sm:text-sm leading-tight line-clamp-2">
          {product.name}
        </h3>

        <div className="flex items-center gap-1.5 flex-wrap">
          {product.category && (
            <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400 capitalize">
              {product.category}
            </span>
          )}
          {product.stock > 0 && !isLowStock && (
            <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              En stock
            </span>
          )}
        </div>

        <div className="mt-auto pt-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-base sm:text-lg font-extrabold text-primary leading-none">
                {fmt(product.price)}
              </span>
              {product.unit && (
                <span className="block text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">/{product.unit}</span>
              )}
              {product.stock > 0 && !isLowStock && (
                <span className="block text-[9px] font-semibold text-gray-400 mt-0.5">
                  Stock: {product.stock} {product.unit ?? "und"}
                </span>
              )}
              {isLowStock && (
                <span className="block text-[9px] font-bold text-amber-600 dark:text-amber-400 mt-0.5 animate-pulse">
                  ⚠ ¡Solo quedan {product.stock}!
                </span>
              )}
            </div>

            {/* Add to cart / Quantity stepper */}
            {qty === 0 ? (
              <button
                onClick={handleAdd}
                disabled={isOutOfStock}
                className={`flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 rounded-2xl text-white shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                  justAdded ? "bg-green-600 scale-95" : "bg-primary hover:bg-primary/90"
                }`}
                aria-label={`Agregar ${product.name}`}
              >
                {justAdded ? (
                  <span className="text-sm font-bold">✓</span>
                ) : (
                  <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                )}
              </button>
            ) : (
              <div className="flex items-center bg-primary rounded-2xl overflow-hidden shadow-md shrink-0">
                <button
                  onClick={handleDecrement}
                  className="flex items-center justify-center h-10 w-8 sm:h-11 sm:w-9 text-white hover:bg-primary/80 transition-colors"
                  aria-label="Reducir"
                >
                  <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
                  </svg>
                </button>
                <span className="w-7 sm:w-8 text-center text-xs sm:text-sm font-bold text-white">
                  {qty}
                </span>
                <button
                  onClick={handleAdd}
                  className="flex items-center justify-center h-10 w-8 sm:h-11 sm:w-9 text-white hover:bg-primary/80 transition-colors"
                  aria-label="Aumentar"
                >
                  <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------- related products ----------

function RelatedProducts({
  products,
  storeId,
  storeName,
  storeSlug,
  onAdded,
  vacationMode,
}: {
  products: StoreProduct[];
  storeId: string;
  storeName: string;
  storeSlug: string;
  onAdded: (name: string) => void;
  vacationMode?: boolean;
}) {
  const { byStore } = useMarketplaceCart();
  const cartItems = byStore[storeId]?.items ?? [];
  const cartProductIds = new Set(cartItems.map((i) => i.productId));

  // Pick products the user hasn't added to cart yet, preferring in-stock and different categories
  const cartCategories = new Set(
    products.filter((p) => cartProductIds.has(p.id)).map((p) => p.category)
  );

  const related = products
    .filter((p) => !cartProductIds.has(p.id) && p.stock > 0)
    .sort((a, b) => {
      // Prefer products from same category as what's in cart
      const aMatch = cartCategories.has(a.category) ? 0 : 1;
      const bMatch = cartCategories.has(b.category) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      // Then by stock descending (as popularity proxy)
      return b.stock - a.stock;
    })
    .slice(0, 6);

  if (related.length === 0 || cartItems.length === 0) return null;

  return (
    <section className="mt-10 mb-4" aria-label="Productos relacionados">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-lg">💡</span>
        <h2 className="text-base font-bold text-gray-900 dark:text-white">
          También te puede gustar
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {related.map((p) => (
          <ProductCard
            key={`rel-${p.id}`}
            product={p}
            storeId={storeId}
            storeName={storeName}
            storeSlug={storeSlug}
            onAdded={onAdded}
            vacationMode={vacationMode}
          />
        ))}
      </div>
    </section>
  );
}

// ---------- review photo gallery ----------

function ReviewPhotoGallery({ storeSlug }: { storeSlug: string }) {
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/marketplace/stores/${storeSlug}/reviews`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => {
        const allPhotos: string[] = [];
        for (const review of d.data ?? []) {
          if (review.imageUrls) {
            try {
              const urls = typeof review.imageUrls === "string" ? JSON.parse(review.imageUrls) : review.imageUrls;
              if (Array.isArray(urls)) allPhotos.push(...urls);
            } catch { /* skip */ }
          }
        }
        setPhotos(allPhotos.slice(0, 12)); // max 12 photos
      })
      .catch(() => {});
  }, [storeSlug]);

  if (photos.length === 0) return null;

  return (
    <section className="mt-8">
      <h3 className="mb-3 text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <svg aria-hidden="true" className="h-5 w-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Fotos de clientes
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
        {photos.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`Foto de cliente ${i + 1}`}
            className="h-24 w-24 shrink-0 rounded-xl object-cover border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-80 hover:scale-105 transition-all"
            onClick={() => window.open(url, "_blank")}
          />
        ))}
      </div>
    </section>
  );
}

// ---------- store reviews section ----------

interface StoreReview {
  id: string;
  name: string;
  rating: number;
  text: string;
  date: string;
  imageUrls?: string | null;
}

function StoreReviews({ storeSlug, storeName }: { storeSlug: string; storeName: string }) {
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formName, setFormName] = useState("");
  const [formRating, setFormRating] = useState(5);
  const [formComment, setFormComment] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPhotos, setFormPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const remaining = 3 - formPhotos.length;
    const toProcess = Array.from(files).slice(0, remaining);
    setUploadingPhoto(true);
    try {
      for (const file of toProcess) {
        if (file.size > 2 * 1024 * 1024) continue; // Max 2MB
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/marketplace/reviews/upload", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            setFormPhotos((prev) => (prev.length < 3 ? [...prev, data.url] : prev));
          }
        }
      }
    } catch {
      // Silent fail — photo is optional
    } finally {
      setUploadingPhoto(false);
    }
    e.target.value = "";
  };

  useEffect(() => {
    fetch(`/api/marketplace/stores/${storeSlug}/reviews`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setReviews(d.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [storeSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formComment.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitMsg(null);
    try {
      const res = await fetch(`/api/marketplace/stores/${storeSlug}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewerName: formName.trim(),
          rating: formRating,
          comment: formComment.trim(),
          ...(formPhone.trim() && { customerPhone: formPhone.trim() }),
          ...(formPhotos.length > 0 && { imageUrls: formPhotos }),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(data.error ?? "Error al enviar");
      }
      const data = await res.json();
      setReviews((prev) => [data.data, ...prev]);
      setSubmitMsg("¡Gracias por tu reseña!");
      setShowForm(false);
      setFormName(""); setFormComment(""); setFormPhone(""); setFormRating(5); setFormPhotos([]);
      setTimeout(() => setSubmitMsg(null), 3000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Error al enviar la reseña");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-10 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          Reseñas de {storeName}
        </h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="min-h-9 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 transition-colors"
          >
            Escribir reseña
          </button>
        )}
      </div>

      {submitMsg && (
        <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
          {submitMsg}
        </div>
      )}

      {/* Formulario de reseña */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 space-y-3 dark:border-gray-700 dark:bg-gray-900">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Tu nombre"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              maxLength={100}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
            <input
              type="tel"
              placeholder="Teléfono (opcional)"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              maxLength={20}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* Star rating picker */}
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-600 dark:text-gray-400 mr-2">Calificación:</span>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFormRating(s)}
                className="focus:outline-none"
                aria-label={`${s} estrella${s > 1 ? "s" : ""}`}
              >
                <svg
                  className={`h-6 w-6 transition-colors ${s <= formRating ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
            ))}
          </div>

          <textarea
            placeholder="¿Qué te pareció esta tienda?"
            value={formComment}
            onChange={(e) => setFormComment(e.target.value)}
            required
            maxLength={1000}
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm placeholder-gray-400 resize-none focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />

          {/* Photo upload */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">Fotos (opcional, máx 3):</label>
              {uploadingPhoto && (
                <span className="text-xs text-teal-600 animate-pulse">Subiendo...</span>
              )}
              {formPhotos.length < 3 && !uploadingPhoto && (
                <label className="cursor-pointer text-xs font-semibold text-teal-600 hover:text-teal-800 transition-colors">
                  + Agregar foto
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            {formPhotos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {formPhotos.map((url, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={url}
                      alt={`Foto ${i + 1}`}
                      className="h-16 w-16 object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => setFormPhotos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {submitError && (
            <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
          )}

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="min-h-9 rounded-xl px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || uploadingPhoto || !formName.trim() || !formComment.trim()}
              className="min-h-9 rounded-xl bg-teal-700 px-5 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Enviando..." : "Enviar reseña"}
            </button>
          </div>
        </form>
      )}

      {/* Lista de reseñas */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-800" />
                  <div className="h-3 w-full rounded bg-gray-200 dark:bg-gray-800" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-10 text-center dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Aún no hay reseñas. ¡Sé el primero en opinar!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{r.name}</p>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <svg
                        key={s}
                        className={`h-3.5 w-3.5 ${s <= r.rating ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(r.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{r.text}</p>
              {r.imageUrls && (() => {
                try {
                  const urls: string[] = typeof r.imageUrls === "string" ? JSON.parse(r.imageUrls) : r.imageUrls;
                  if (!Array.isArray(urls) || urls.length === 0) return null;
                  return (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {urls.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`Foto de reseña ${i + 1}`}
                          className="h-20 w-20 object-cover rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => window.open(url, "_blank")}
                        />
                      ))}
                    </div>
                  );
                } catch {
                  return null;
                }
              })()}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- componente principal ----------

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function StoreDetail({ slug }: { slug: string }) {
  const [store, setStore]       = useState<StoreInfo | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [search, setSearch]     = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [sortBy, setSortBy]     = useState<"" | "price_asc" | "price_desc" | "popular">("");
  const [loadingStore, setLoadingStore]     = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [errorStore, setErrorStore]         = useState<string | null>(null);
  const [errorProducts, setErrorProducts]   = useState<string | null>(null);
  const [toastMsg, setToastMsg]             = useState<string | null>(null);
  const [customerPhone, setCustomerPhone]   = useState<string | null>(null);
  const [cartOpen, setCartOpen]             = useState(false);

  // Cart info for this specific store
  const { byStore, totalByStore } = useMarketplaceCart();

  // Leer phone del localStorage para el chat
  useEffect(() => {
    try {
      const raw = localStorage.getItem("marketplace-customer-phone");
      if (raw) setCustomerPhone(raw);
    } catch { /* silent */ }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const deferredSearch = useDeferredValue(search);

  const fetchStore = useCallback(async () => {
    setLoadingStore(true);
    setErrorStore(null);
    try {
      const res = await fetch(`/api/marketplace/stores/${slug}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setStore(json.data ?? null);
    } catch (err) {
      setErrorStore(err instanceof Error ? err.message : "No se pudo cargar la tienda");
    } finally {
      setLoadingStore(false);
    }
  }, [slug]);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    setErrorProducts(null);
    try {
      const params = new URLSearchParams();
      if (deferredSearch) params.set("search", deferredSearch);
      if (catFilter)      params.set("category", catFilter);
      if (sortBy === "price_asc" || sortBy === "price_desc") params.set("sort", sortBy);

      const res = await fetch(`/api/marketplace/stores/${slug}/products?${params}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      let data = json.data ?? [];
      // Client-side sort for "popular" (by stock descending as proxy for popularity)
      if (sortBy === "popular") {
        data = [...data].sort((a: StoreProduct, b: StoreProduct) => b.stock - a.stock);
      }
      setProducts(data);
    } catch (err) {
      setErrorProducts(err instanceof Error ? err.message : "No se pudieron cargar los productos");
    } finally {
      setLoadingProducts(false);
    }
  }, [slug, deferredSearch, catFilter, sortBy]);

  useEffect(() => { fetchStore(); }, [fetchStore]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // categorías únicas de los productos para el filtro
  const categories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean))
  ) as string[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-0 sm:px-6 lg:px-8">
      {/* ── HEADER DE TIENDA ───────────────────────────────────── */}
      {loadingStore ? (
        <div className="mb-8">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <div className="mt-4 space-y-2 px-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      ) : errorStore ? (
        <div className="mb-8 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {errorStore}{" "}
          <button onClick={fetchStore} className="underline hover:no-underline">Reintentar</button>
        </div>
      ) : store ? (
        <div className="mb-8">
          {/* banner */}
          <div className="relative h-40 overflow-hidden rounded-2xl bg-linear-to-br from-teal-700 to-teal-900 sm:h-48">
            {store.banner && (
              <Image
                src={store.banner}
                alt={`Banner de ${store.name}`}
                fill
                className="object-cover opacity-70"
                priority
                sizes="100vw"
              />
            )}
            {/* overlay info */}
            <div className="absolute inset-0 flex items-end p-5">
              <div className="flex items-center gap-4">
                {/* logo */}
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 border-white/30 bg-white shadow-lg">
                  {store.logo ? (
                    <Image
                      src={store.logo}
                      alt={`Logo de ${store.name}`}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-xl font-black text-white"
                      style={{ background: "linear-gradient(135deg, #00B4A6, #134e4a)" }}
                    >
                      {store.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>

                <div>
                  <h1 className="text-xl font-black text-white sm:text-2xl drop-shadow-sm">
                    {store.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white capitalize">
                      {store.category}
                    </span>
                    <span className="text-xs text-white/80 capitalize">
                      {store.zone?.replace(/-/g, " ")}
                    </span>
                    {(store.isOpen ?? true) ? (
                      <span className="rounded-full bg-green-400/30 px-2.5 py-0.5 text-xs font-bold text-green-200">
                        Abierto
                      </span>
                    ) : (
                      <span className="rounded-full bg-red-400/30 px-2.5 py-0.5 text-xs font-bold text-red-200">
                        Cerrado
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* rating + descripción */}
          <div className="mt-4 px-1">
            <StarRating rating={store.rating} count={store.reviewCount} />
            {store.description && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {store.description}
              </p>
            )}

            {/* Vacation mode banner */}
            {store.vacationMode && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
                <span className="text-lg">🏖️</span>
                <div>
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-300">Tienda en vacaciones</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {store.vacationMessage || "Esta tienda no está recibiendo pedidos en este momento."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-8 rounded-2xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">Tienda no encontrada</p>
          <Link
            href="/marketplace"
            className="mt-3 inline-block text-sm text-teal-600 underline hover:no-underline"
          >
            Volver al marketplace
          </Link>
        </div>
      )}

      {/* ── BARRA DE BÚSQUEDA + FILTROS ───────────────────────── */}
      <div className="mb-6 space-y-4">
        <div className="relative">
          <svg
            aria-hidden="true"
            className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            aria-label="Buscar producto en la tienda"
            className="w-full rounded-2xl border border-gray-300 bg-white py-3 pl-12 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        {/* filtro categoría + ordenar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort select */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="Ordenar productos"
            className="min-h-9 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <option value="">Ordenar</option>
            <option value="price_asc">Precio: menor a mayor</option>
            <option value="price_desc">Precio: mayor a menor</option>
            <option value="popular">Más populares</option>
          </select>

          {/* Divider when there are categories */}
          {categories.length > 0 && (
            <span className="hidden sm:block h-5 w-px bg-gray-200 dark:bg-gray-700" />
          )}

          {/* filtro categoría (solo si hay categorías) */}
          {categories.length > 0 && (
            <>
              <button
                onClick={() => setCatFilter("")}
                aria-pressed={catFilter === ""}
                className={`min-h-9 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 ${
                  catFilter === ""
                    ? "bg-teal-700 text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  aria-pressed={catFilter === c}
                  className={`min-h-9 rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 ${
                    catFilter === c
                      ? "bg-teal-700 text-white"
                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── GRID DE PRODUCTOS ──────────────────────────────────── */}
      {errorProducts && (
        <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {errorProducts}{" "}
          <button onClick={fetchProducts} className="underline hover:no-underline">Reintentar</button>
        </div>
      )}

      {loadingProducts ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 py-16 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">No se encontraron productos</p>
          {(search || catFilter || sortBy) && (
            <button
              onClick={() => { setSearch(""); setCatFilter(""); setSortBy(""); }}
              className="mt-3 min-h-11 rounded-xl bg-teal-700 px-6 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            {products.length} {products.length === 1 ? "producto" : "productos"}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                storeId={store?.id ?? slug}
                storeName={store?.name ?? "Tienda"}
                storeSlug={store?.slug ?? slug}
                onAdded={(name) => showToast(`${name} agregado al carrito`)}
                vacationMode={store?.vacationMode}
              />
            ))}
          </div>

          {/* ── TAMBIÉN TE PUEDE GUSTAR ──────────────────────── */}
          <RelatedProducts
            products={products}
            storeId={store?.id ?? slug}
            storeName={store?.name ?? "Tienda"}
            storeSlug={store?.slug ?? slug}
            onAdded={(name) => showToast(`${name} agregado al carrito`)}
            vacationMode={store?.vacationMode}
          />
        </>
      )}

      {/* ── GALERÍA DE FOTOS DE CLIENTES ────────────────────── */}
      {store && <ReviewPhotoGallery storeSlug={store.slug} />}

      {/* ── SECCIÓN DE RESEÑAS ────────────────────────────────── */}
      {store && <StoreReviews storeSlug={store.slug} storeName={store.name} />}

      {/* Toast al agregar producto */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-gray-900/90 px-5 py-2.5 text-sm font-medium text-white shadow-xl backdrop-blur-sm dark:bg-gray-100/90 dark:text-gray-900"
        >
          {toastMsg}
        </div>
      )}

      {/* Sticky cart bar — only when this store has items */}
      {store && byStore[store.id] && (
        <AnimatePresence>
          <motion.div
            key="sticky-cart"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 z-40 border-t border-primary/20 bg-white/95 dark:bg-card/95 backdrop-blur-md px-4 py-3 sm:px-6 shadow-2xl"
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-muted">
                  {byStore[store.id].items.reduce((s, i) => s + i.quantity, 0)} producto
                  {byStore[store.id].items.reduce((s, i) => s + i.quantity, 0) !== 1 ? "s" : ""} en tu carrito
                </p>
                <p className="text-base font-extrabold text-gray-900 dark:text-foreground">
                  Total:{" "}
                  <span className="text-primary">
                    {fmt(totalByStore[store.id]?.total ?? 0)}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setCartOpen(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary/90 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
              >
                Ver carrito
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Cart drawer */}
      <MarketplaceCart isOpen={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Chat floating widget */}
      {store && customerPhone && (
        <MarketplaceChat
          storeId={store.id}
          storeName={store.name}
          storeLogo={store.logo}
          customerPhone={customerPhone}
        />
      )}
    </div>
  );
}
