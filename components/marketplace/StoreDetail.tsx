"use client";

import { useState, useEffect, useCallback, useDeferredValue } from "react";
import Image from "next/image";
import Link from "next/link";
import { m as motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import UnifiedProductCard from "@/components/marketplace/UnifiedProductCard";
import MarketplaceChat from "@/components/marketplace/MarketplaceChat";
import MarketplaceCart from "@/components/marketplace/MarketplaceCart";
import StoreWhatsAppButton from "@/components/marketplace/StoreWhatsAppButton";

// ---------- constantes de categorías sugeridas ----------

const SUGGESTED_CATEGORIES = [
  "Abarrotes",
  "Bebidas",
  "Limpieza",
  "Lácteos",
  "Carnes",
  "Panadería",
  "Snacks",
  "Frutas y verduras",
  "Higiene personal",
  "Ferretería",
];

// ---------- tipos ----------

interface StoreInfo {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  banner: string | null;
  category: string;
  zone: string;
  lat?: number | null;
  lng?: number | null;
  rating: number | null;
  reviewCount: number;
  description: string | null;
  isOpen?: boolean;
  vacationMode?: boolean;
  vacationMessage?: string | null;
  tenantSlug?: string | null;
  whatsappNumber?: string | null;
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
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="aspect-[1/1] rounded-t-xl bg-gray-200 dark:bg-gray-800" />
      <div className="p-3 space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-9 w-full rounded-xl bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}

// ---------- product card ----------

function ProductCardWrapper({
  product,
  storeId,
  storeName,
  storeSlug,
  index,
  highlighted,
  vacationMode,
}: {
  product: StoreProduct;
  storeId: string;
  storeName: string;
  storeSlug: string;
  index?: number;
  highlighted?: boolean;
  vacationMode?: boolean;
}) {
  const effectiveStock = vacationMode ? 0 : product.stock;

  return (
    <div id={`product-card-${product.id}`} className="relative">
      <UnifiedProductCard
        index={index ?? 0}
        product={{
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          category: product.category ?? undefined,
          unit: product.unit,
          stock: effectiveStock,
          storeId,
          storeName,
          storeSlug,
          storeProductId: product.storeProductId,
        }}
        href={`/marketplace/${storeSlug}`}
      />
      {highlighted && (
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary/70 shadow-[0_0_0_4px_rgba(37,99,235,0.15)] animate-pulse" />
      )}
    </div>
  );
}

// ---------- related products ----------

function RelatedProducts({
  products,
  storeId,
  storeName,
  storeSlug,
  vacationMode,
}: {
  products: StoreProduct[];
  storeId: string;
  storeName: string;
  storeSlug: string;
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
        {related.map((p, i) => (
          <ProductCardWrapper
            key={`rel-${p.id}`}
            product={p}
            storeId={storeId}
            storeName={storeName}
            storeSlug={storeSlug}
            index={i}
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
        <svg aria-hidden="true" className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Fotos de clientes
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
        {photos.map((url, i) => (
          <Image
            key={i}
            src={url}
            alt={`Foto de cliente ${i + 1}`}
            width={96}
            height={96}
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
            className="min-h-9 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
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
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
            <input
              type="tel"
              placeholder="Teléfono (opcional)"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              maxLength={20}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
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
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm placeholder-gray-400 resize-none focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />

          {/* Photo upload */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">Fotos (opcional, máx 3):</label>
              {uploadingPhoto && (
                <span className="text-xs text-emerald-600 animate-pulse">Subiendo...</span>
              )}
              {formPhotos.length < 3 && !uploadingPhoto && (
                <label className="cursor-pointer text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition-colors">
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
                    <Image
                      src={url}
                      alt={`Foto ${i + 1}`}
                      width={64}
                      height={64}
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
              className="min-h-9 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
                        <Image
                          key={i}
                          src={url}
                          alt={`Foto de reseña ${i + 1}`}
                          width={80}
                          height={80}
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

// ---------- store info section ----------

function StoreInfoSection({ store }: { store: StoreInfo }) {
  const zone = store.zone?.replace(/-/g, " ") ?? "Pucallpa";
  // Google Maps link: use lat/lng if available, otherwise search by name+zone
  const mapsUrl =
    store.lat && store.lng
      ? `https://www.google.com/maps?q=${store.lat},${store.lng}`
      : `https://www.google.com/maps/search/${encodeURIComponent(`${store.name} ${zone} Perú`)}`;

  const paymentMethods = [
    { label: "Efectivo" },
    { label: "Yape" },
    { label: "Plin" },
    { label: "Transferencia" },
  ];

  return (
    <section
      aria-label="Información de la tienda"
      className="mt-12 mb-8 rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 overflow-hidden"
    >
      <div className="bg-primary/5 dark:bg-primary/10 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <svg aria-hidden="true" className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Información de la tienda
        </h2>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {/* Horario */}
        <div className="flex items-start gap-3 px-5 py-4">
          <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              Horario de atención
            </p>
            <div className="space-y-0.5">
              <p className="text-sm text-gray-900 dark:text-white">
                <span className="font-medium">Lun – Sáb:</span> 7:00 am – 9:00 pm
              </p>
              <p className="text-sm text-gray-900 dark:text-white">
                <span className="font-medium">Dom:</span> 8:00 am – 2:00 pm
              </p>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              {(store.isOpen ?? true) ? (
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Abierto ahora</span>
                </>
              ) : (
                <>
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">Cerrado ahora</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Dirección */}
        <div className="flex items-start gap-3 px-5 py-4">
          <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              Dirección
            </p>
            <p className="text-sm text-gray-900 dark:text-white capitalize">{zone}, Perú</p>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              aria-label={`Ver ${store.name} en Google Maps`}
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Ver en Google Maps
            </a>
          </div>
        </div>

        {/* Contacto — WhatsApp y teléfono */}
        <div className="flex items-start gap-3 px-5 py-4">
          <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Contacto
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/51?text=${encodeURIComponent(`Hola, vi tu tienda ${store.name} en Buleje`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
                aria-label={`Contactar ${store.name} por WhatsApp`}
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.117 1.532 5.847L.073 23.927l6.217-1.44A11.933 11.933 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.886 0-3.65-.49-5.187-1.349l-.371-.216-3.852.893.927-3.748-.239-.386A9.946 9.946 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                WhatsApp
              </a>
              <a
                href="tel:+51000000000"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                aria-label={`Llamar a ${store.name}`}
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Llamar
              </a>
            </div>

            {/* WhatsApp CTA */}
            <div className="mt-3">
              <StoreWhatsAppButton
                whatsappNumber={store.whatsappNumber}
                storeName={store.name}
                variant="primary"
              />
            </div>
          </div>
        </div>

        {/* Métodos de pago */}
        <div className="flex items-start gap-3 px-5 py-4">
          <svg aria-hidden="true" className="h-5 w-5 shrink-0 text-primary mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
              Métodos de pago
            </p>
            <div className="flex flex-wrap gap-2">
              {paymentMethods.map((m) => (
                <span
                  key={m.label}
                  className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-300"
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- componente principal ----------

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

// In-memory cache: avoids re-fetching products when navigating back to a store
const storeProductCache = new Map<string, { data: StoreProduct[]; ts: number }>();
const CACHE_TTL = 5 * 60_000; // 5 minutes

// In-memory store info cache
const storeInfoCache = new Map<string, { data: StoreInfo; ts: number }>();

export default function StoreDetail({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
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
  const [followed, setFollowed]             = useState(false);
  const [highlightedProductId, setHighlightedProductId] = useState<number | null>(null);

  // Cart info for this specific store
  const { byStore, totalByStore } = useMarketplaceCart();

  // Registrar visita para el contador de live-viewers (fire-and-forget)
  useEffect(() => {
    try {
      const key = "mp-session-id";
      let sessionId = sessionStorage.getItem(key);
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem(key, sessionId);
      }
      fetch(`/api/marketplace/stores/${slug}/live-viewers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {
        // Fire-and-forget: pérdida del registro no afecta UX. Silent por diseño.
      });
    } catch { /* sessionStorage bloqueado (Safari incógnito, etc) */ }
  }, [slug]);

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
    // Try cache first
    const cached = storeInfoCache.get(slug);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setStore(cached.data);
      setLoadingStore(false);
      return;
    }

    setLoadingStore(true);
    setErrorStore(null);
    try {
      const res = await fetch(`/api/marketplace/stores/${slug}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      const data = json.data ?? null;
      setStore(data);
      if (data) storeInfoCache.set(slug, { data, ts: Date.now() });
    } catch (err) {
      setErrorStore(err instanceof Error ? err.message : "No se pudo cargar la tienda");
    } finally {
      setLoadingStore(false);
    }
  }, [slug]);

  const fetchProducts = useCallback(async () => {
    // Build query params
    const params = new URLSearchParams();
    if (deferredSearch) params.set("search", deferredSearch);
    if (catFilter)      params.set("category", catFilter);
    if (sortBy === "price_asc" || sortBy === "price_desc") params.set("sort", sortBy);

    const isDefaultQuery = !deferredSearch && !catFilter && !sortBy;
    const cacheKey = `${slug}:${params.toString()}`;

    // Try cache first (avoids re-fetch when navigating back)
    const cached = storeProductCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setProducts(cached.data);
      setLoadingProducts(false);
      return;
    }

    setLoadingProducts(true);
    setErrorProducts(null);
    try {
      const res = await fetch(`/api/marketplace/stores/${slug}/products?${params}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      let data = json.data ?? [];
      // Client-side sort for "popular" (by stock descending as proxy for popularity)
      if (sortBy === "popular") {
        data = [...data].sort((a: StoreProduct, b: StoreProduct) => b.stock - a.stock);
      }
      setProducts(data);
      // Cache the result (default query + filtered queries)
      storeProductCache.set(cacheKey, { data, ts: Date.now() });
      // Also cache filtered data under default key for faster back-navigation
      if (isDefaultQuery) {
        storeProductCache.set(`${slug}:`, { data, ts: Date.now() });
      }
    } catch (err) {
      setErrorProducts(err instanceof Error ? err.message : "No se pudieron cargar los productos");
    } finally {
      setLoadingProducts(false);
    }
  }, [slug, deferredSearch, catFilter, sortBy]);

  useEffect(() => { fetchStore(); }, [fetchStore]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    const raw = searchParams.get("product");
    if (!raw) return;
    const productId = Number(raw);
    if (!Number.isFinite(productId) || productId <= 0) return;
    setSearch("");
    setCatFilter("");
    setHighlightedProductId(productId);
  }, [searchParams]);

  useEffect(() => {
    if (!highlightedProductId) return;
    if (!products.some((p) => p.id === highlightedProductId)) return;

    const targetId = `product-card-${highlightedProductId}`;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    const timeout = setTimeout(() => setHighlightedProductId(null), 3000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [highlightedProductId, products]);

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
          {/* ── BANNER PRINCIPAL ── */}
          <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-primary to-[#1a4a36] sm:rounded-3xl" style={{ minHeight: "200px" }}>
            {store.banner && (
              <Image
                src={store.banner}
                alt={`Banner de ${store.name}`}
                fill
                className="object-cover opacity-50"
                priority
                sizes="100vw"
              />
            )}
            {/* Capa de gradiente sobre la imagen */}
            <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />

            {/* Acciones top-right: compartir */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              <button
                onClick={() => {
                  if (typeof navigator !== "undefined" && navigator.share) {
                    navigator.share({ title: store.name, url: window.location.href }).catch(() => {});
                  } else if (typeof navigator !== "undefined") {
                    navigator.clipboard?.writeText(window.location.href).catch(() => {});
                  }
                }}
                aria-label="Compartir tienda"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
              >
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            </div>

            {/* Contenido central — logo + nombre */}
            <div className="relative z-10 flex flex-col items-center justify-center px-5 pt-10 pb-6 text-center sm:pt-12 sm:pb-8">
              {/* Logo grande centrado */}
              <div className="relative mb-4 h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-white/40 bg-white shadow-xl sm:h-28 sm:w-28">
                {store.logo ? (
                  <Image
                    src={store.logo}
                    alt={`Logo de ${store.name}`}
                    fill
                    className="object-cover"
                    sizes="112px"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-3xl font-black text-white"
                    style={{ background: "linear-gradient(135deg, var(--color-primary-dark), #1a4a36)" }}
                  >
                    {store.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Nombre */}
              <h1 className="text-2xl font-black text-white sm:text-3xl drop-shadow-md tracking-tight">
                {store.name}
              </h1>

              {/* Badges: categoría + zona + estado */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full bg-white/20 backdrop-blur-sm px-3 py-1 text-xs font-semibold text-white capitalize">
                  {store.category}
                </span>
                {store.zone && (
                  <span className="flex items-center gap-1 text-xs text-white/80 capitalize">
                    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {store.zone.replace(/-/g, " ")}
                  </span>
                )}
                {(store.isOpen ?? true) ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/30 backdrop-blur-sm px-2.5 py-0.5 text-xs font-bold text-emerald-200">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Abierto
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-red-500/30 backdrop-blur-sm px-2.5 py-0.5 text-xs font-bold text-red-200">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                    Cerrado
                  </span>
                )}
              </div>

              {/* Rating inline */}
              <div className="mt-3">
                <StarRating rating={store.rating} count={store.reviewCount} />
              </div>

              {/* Delivery info */}
              <div className="mt-3 flex items-center gap-3 text-xs text-white/80">
                <span className="flex items-center gap-1">
                  <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Delivery disponible
                </span>
                <span className="h-3 w-px bg-white/40" />
                <span className="flex items-center gap-1">
                  <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  30–60 min
                </span>
                <span className="h-3 w-px bg-white/40" />
                <span>Pago con Yape</span>
              </div>

              {/* Botón Seguir */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setFollowed((v) => !v)}
                  aria-pressed={followed}
                  aria-label={followed ? `Dejar de seguir ${store.name}` : `Seguir ${store.name}`}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold shadow-lg transition-all duration-200 ${
                    followed
                      ? "bg-white text-primary hover:bg-white/90"
                      : "bg-white/20 text-white backdrop-blur-sm hover:bg-white/30 border border-white/40"
                  }`}
                >
                  {followed ? (
                    <>
                      <svg aria-hidden="true" className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Siguiendo
                    </>
                  ) : (
                    <>
                      <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Seguir tienda
                    </>
                  )}
                </button>

                {/* Visitar tienda — link to tenant's personal store page */}
                {store.tenantSlug && (
                  <Link
                    href={`/t/${store.tenantSlug}/tienda`}
                    className="inline-flex min-h-11 flex-col items-center justify-center rounded-xl border border-white/40 px-4 py-2 backdrop-blur-sm transition-all duration-200 hover:bg-white/10"
                  >
                    <span className="text-sm font-bold text-white">Ver ofertas exclusivas</span>
                    <span className="text-[length:var(--ts-2xs)] text-white/60">Promociones, combos y mas</span>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* descripción + vacation mode (debajo del banner) */}
          <div className="mt-4 px-1">
            {store.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {store.description}
              </p>
            )}

            {/* Vacation mode banner */}
            {store.vacationMode && (
              <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
                <svg
                  aria-hidden="true"
                  className="h-5 w-5 text-amber-600 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 20h16" />
                  <path d="M8 10c4-7 12-4 8 4" />
                  <path d="M12 20V13" />
                  <path d="M8 14c0-3 4-3 4 0" strokeOpacity="0.5" />
                </svg>
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
            className="mt-3 inline-block text-sm text-emerald-600 underline hover:no-underline"
          >
            Volver al marketplace
          </Link>
        </div>
      )}

      {/* ── BARRA DE BÚSQUEDA + FILTROS ───────────────────────── */}
      <div className="mb-6 space-y-3">
        {/* Búsqueda */}
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
            className="w-full rounded-2xl border border-gray-300 bg-white py-3 pl-12 pr-4 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
          />
        </div>

        {/* ── QUICK CATEGORY FILTER — pills scrollables ── */}
        {(() => {
          // Combinar categorías reales de los productos con las sugeridas para enriquecer el filtro
          const realCats = categories;
          // Mostrar siempre las reales; si hay pocas, sugerir algunas estándar
          const displayCats = realCats.length > 0
            ? realCats
            : SUGGESTED_CATEGORIES.slice(0, 6);
          return (
            <div
              className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none"
              role="group"
              aria-label="Filtrar por categoría"
              style={{ scrollbarWidth: "none" }}
            >
              {/* Pill "Todos" */}
              <button
                onClick={() => setCatFilter("")}
                aria-pressed={catFilter === ""}
                className={`min-h-11 shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                  catFilter === ""
                    ? "bg-primary text-white shadow-md shadow-primary/25"
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                Todos
              </button>
              {displayCats.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c === catFilter ? "" : c)}
                  aria-pressed={catFilter === c}
                  className={`min-h-11 shrink-0 rounded-full px-4 py-2 text-sm font-semibold capitalize transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                    catFilter === c
                      ? "bg-primary text-white shadow-md shadow-primary/25"
                      : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          );
        })()}

        {/* Ordenar — separado, alineado a la derecha */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loadingProducts ? (
              <span className="inline-block h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            ) : (
              <>
                {products.length}{" "}
                {products.length === 1 ? "producto" : "productos"}
                {catFilter && ` en "${catFilter}"`}
              </>
            )}
          </p>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="Ordenar productos"
            className="min-h-9 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 transition-colors focus-visible:outline-2 focus-visible:outline-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
          >
            <option value="">Ordenar</option>
            <option value="price_asc">Precio: menor a mayor</option>
            <option value="price_desc">Precio: mayor a menor</option>
            <option value="popular">Más populares</option>
          </select>
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
              className="mt-3 min-h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p, i) => (
              <ProductCardWrapper
                key={p.id}
                product={p}
                storeId={store?.id ?? slug}
                storeName={store?.name ?? "Tienda"}
                storeSlug={store?.slug ?? slug}
                index={i}
                highlighted={highlightedProductId === p.id}
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
            vacationMode={store?.vacationMode}
          />
        </>
      )}

      {/* ── GALERÍA DE FOTOS DE CLIENTES ────────────────────── */}
      {store && <ReviewPhotoGallery storeSlug={store.slug} />}

      {/* ── SECCIÓN DE RESEÑAS ────────────────────────────────── */}
      {store && <StoreReviews storeSlug={store.slug} storeName={store.name} />}

      {/* ── INFO DE TIENDA (horario, dirección, contacto, pagos) ── */}
      {store && <StoreInfoSection store={store} />}

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
