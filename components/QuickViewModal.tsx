"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Minus, ShoppingCart, Package, X, Heart, Star, ExternalLink, Truck, TrendingUp } from "@buleje/design-system/icons";
import { getProductSlug } from "@/data/products";
import { useStoreProducts } from "@/hooks/use-store-products";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/contexts/toast-context";
import { useFavorites } from "@/contexts/favorites-context";
import { cn } from "@/lib/utils";
import { useCachedData } from "@/hooks/use-cached-data";
import type { Product } from "@/data/products";
import { csrfHeaders } from "@/lib/csrf-client";

type LiveProduct = Product & { stock?: number; stockMin?: number };

export default function QuickViewModal({ product, onClose }: { product: LiveProduct; onClose: () => void }) {
  const pathname = usePathname() ?? "";
  const tenantSlug = pathname.match(/^\/t\/([^/]+)/)?.[1];
  const tienda = tenantSlug ? `/t/${tenantSlug}/tienda` : "/tienda";
  const { items, addItem, updateQty } = useCart();
  const { showToast } = useToast();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const { products, categories, isLoading } = useStoreProducts();
  const cartItem = items.find((i) => i.id === product.id);
  const qty = cartItem?.quantity ?? 0;
  const isOutOfStock = product.stock != null && product.stock <= 0;
  const [tab, setTab] = useState<"info" | "reviews" | "alsoBought" | "related">("info");
  const fav = isFavorite(String(product.id));

  // Review form state
  const [formName, setFormName] = useState("");
  const [formRating, setFormRating] = useState(0);
  const [formHover, setFormHover] = useState(0);
  const [formText, setFormText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRating) { setReviewError("Selecciona una puntuación"); return; }
    if (!formText.trim()) { setReviewError("Escribe tu opinión"); return; }
    if (!formName.trim()) { setReviewError("Ingresa tu nombre"); return; }
    setSubmitting(true);
    setReviewError("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          id: `rv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: formName.trim(),
          text: formText.trim(),
          rating: formRating,
          productId: product.id,
          date: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Error");
      setReviewSubmitted(true);
      setFormText(""); setFormRating(0); setFormName("");
      setTimeout(() => { refetchReviews().catch(() => {}); }, 500);
    } catch {
      setReviewError("No se pudo enviar. Intenta de nuevo.");
    }
    setSubmitting(false);
  };

  const { data: reviews = [], refetch: refetchReviews } = useCachedData<Array<{ id: string; name: string; rating: number; text: string; date: string }>>(
    `reviews-${product.id}`,
    async () => {
      const response = await fetch(`/api/reviews?productId=${product.id}`);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data.slice(0, 5) : [];
    },
    { staleTime: 5 * 60 * 1000, refetchOnFocus: false }
  );

  const { data: priceHistory = [] } = useCachedData<Array<{ price: number; createdAt: string }>>(
    `price-history-${product.id}`,
    async () => {
      const res = await fetch(`/api/price-history?productId=${product.id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.slice(-10) : [];
    },
    { staleTime: 30 * 60 * 1000, refetchOnFocus: false }
  );

  const { data: coPurchased = [] } = useCachedData<Array<{ id: number; name: string; price: number; image: string | null; unit: string }>>(
    `co-purchased-${product.id}`,
    async () => {
      const res = await fetch(`/api/products/co-purchased?ids=${product.id}&limit=4`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data.slice(0, 4) : [];
    },
    { staleTime: 10 * 60 * 1000, refetchOnFocus: false }
  );

  const stableOnClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") stableOnClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stableOnClose]);

  useEffect(() => {
    try {
      const key = "buleje-recently-viewed";
      const saved: Product[] = JSON.parse(localStorage.getItem(key) || "[]");
      const filtered = saved.filter((p: Product) => p.id !== product.id);
      filtered.unshift(product);
      localStorage.setItem(key, JSON.stringify(filtered.slice(0, 12)));
      window.dispatchEvent(new Event("buleje:productViewed"));
    } catch {}
  }, [product]);

  const handleAdd = () => {
    if (isOutOfStock) return;
    addItem(product);
    showToast(product.name, product.image);
  };

  if (isLoading) return null;

  const relatedProducts = products.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);
  const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const category = categories.find(c => c.id === product.category);
  const staticDesc = (products as Array<Product & { description?: string }>).find(p => p.id === product.id)?.description;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose} aria-hidden="true">
      <div className="absolute inset-0 bg-black/55" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-view-title"
        className="relative bg-[var(--surface-raised)] rounded-t-2xl sm:rounded-none shadow-[var(--shadow-lg)] w-full max-w-2xl lg:max-w-4xl lg:max-h-[88vh] max-h-[92vh] overflow-hidden flex flex-col lg:flex-row border border-[var(--rule-base)] animate-[scaleIn_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
        aria-hidden="false"
      >
        {/* Left panel: image */}
        <div className="relative lg:w-[44%] lg:shrink-0 lg:h-auto">
          <div className="lg:hidden flex justify-center pt-2 pb-1 absolute top-0 left-0 right-0 z-10">
            <div className="w-10 h-1 rounded-full bg-gray-300/80 dark:bg-gray-600/80" />
          </div>

          <div className="relative aspect-video sm:aspect-4/3 lg:aspect-auto lg:h-full min-h-64 bg-gray-50 dark:bg-surface">
            {product.image ? (
              <Image src={product.image} alt={product.name} fill className="object-cover" sizes="(max-width: 672px) 100vw, 44vw" loading="lazy" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-gray-300"><Package className="h-16 w-16" /></div>
            )}
            {product.badge && (
              <span className="absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-bold uppercase text-white bg-primary shadow-[var(--shadow-sm)]">{product.badge}</span>
            )}
            <div className="hidden lg:block absolute inset-0 bg-linear-to-t from-black/20 to-transparent pointer-events-none" />
            <button
              onClick={(e) => { e.stopPropagation(); toggleFav(String(product.id)); }}
              className={cn(
                "absolute top-3 right-14 z-10 flex items-center justify-center h-10 w-10 rounded-full transition-all shadow-[var(--shadow-md)]",
                fav ? "bg-[var(--data-error-500)] text-white" : "bg-white/80 dark:bg-[var(--surface-raised)]/80 text-gray-400 hover:text-[var(--data-error-500)]"
              )}
              aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
            >
              <Heart className={cn("h-5 w-5", fav && "fill-current")} />
            </button>
            {category && (
              <div className="hidden lg:flex absolute bottom-3 left-3 items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-white/90 dark:bg-[var(--surface-raised)]/90 text-xs font-semibold text-[var(--text-primary)] shadow backdrop-blur-sm">
                  {category.emoji} {category.label}
                </span>
                {reviews.length > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-amber-400/90 text-white text-xs font-bold shadow backdrop-blur-sm flex items-center gap-1">
                    <Star className="h-3 w-3 fill-current" /> {avgRating.toFixed(1)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Close button */}
        <button onClick={onClose} className="absolute top-3 right-3 z-20 p-2 rounded-full bg-white/80 dark:bg-[var(--surface-raised)]/80 hover:bg-white dark:hover:bg-[var(--surface-raised)] transition-colors shadow-[var(--shadow-md)]" aria-label="Cerrar">
          <X className="h-5 w-5 text-gray-600 dark:text-muted" />
        </button>

        {/* Right panel: scrollable content */}
        <div className="flex-1 flex flex-col overflow-y-auto lg:overflow-hidden">
          <div className="p-5 sm:p-6 pb-3 border-b border-[var(--rule-base)] shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 id="quick-view-title" className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] leading-tight mb-1">{product.name}</h3>
                <p className="text-sm text-muted lg:hidden">
                  {category?.emoji} {category?.label ?? product.category}
                  {reviews.length > 0 && (
                    <span className="ml-3 inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 text-[var(--data-warning-500)] fill-[var(--data-warning-500)]" />
                      <span className="font-semibold text-[var(--text-primary)]">{avgRating.toFixed(1)}</span>
                      <span className="text-muted">({reviews.length})</span>
                    </span>
                  )}
                </p>
                {staticDesc && <p className="mt-2 text-sm text-muted leading-relaxed line-clamp-2">{staticDesc}</p>}
              </div>
              <div className="text-right shrink-0">
                <span className="text-2xl sm:text-3xl font-extrabold text-primary">S/{Number(product.price).toFixed(2)}</span>
                <span className="block text-sm text-muted">por {product.unit}</span>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
              <div>
                {product.stock != null && (
                  <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", product.stock <= 0 ? "bg-red-50 text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/10" : product.stock <= (product.stockMin ?? 5) ? "bg-amber-50 text-[var(--data-warning-600)] dark:bg-[var(--data-warning-500)]/10" : "bg-emerald-50 text-[var(--data-success-600)] dark:bg-[var(--data-success-500)]/10")}>
                    {product.stock <= 0 ? "Agotado" : `${product.stock} en stock`}
                  </span>
                )}
              </div>
              {qty === 0 ? (
                <button onClick={handleAdd} disabled={isOutOfStock} className="flex items-center gap-2 bg-primary text-white rounded-xl px-6 py-3 font-bold shadow-[var(--shadow-md)] hover:bg-primary-dark active:scale-95 transition-all disabled:opacity-50">
                  <ShoppingCart className="h-5 w-5" /> Agregar al carrito
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-primary rounded-xl overflow-hidden shadow-[var(--shadow-md)]">
                    <button onClick={() => updateQty(product.id, qty - 1)} aria-label={`Reducir cantidad de ${product.name}`} className="h-11 w-10 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"><Minus className="h-4 w-4" /></button>
                    <span className="w-8 text-center font-bold text-white" aria-live="polite" aria-label={`Cantidad: ${qty}`}>{qty}</span>
                    <button onClick={handleAdd} aria-label={`Aumentar cantidad de ${product.name}`} className="h-11 w-10 text-white hover:bg-primary-dark transition-colors flex items-center justify-center"><Plus className="h-4 w-4" /></button>
                  </div>
                  <span className="text-sm font-semibold text-primary">En carrito · S/{(product.price * qty).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div role="tablist" aria-label="Secciones del producto" className="flex border-b border-[var(--rule-base)] shrink-0">
            {([["info", "Detalles"], ["reviews", "Reseñas"], ["alsoBought", "Compran juntos"], ["related", "Relacionados"]] as const).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                aria-controls={`tab-panel-${key}`}
                id={`tab-${key}`}
                onClick={() => setTab(key)}
                className={cn(
                  "flex-1 py-3 text-sm font-semibold transition-all border-b-2",
                  tab === key
                    ? "text-primary border-primary bg-primary/5"
                    : "text-muted border-transparent hover:text-[var(--text-primary)] hover:bg-gray-50 dark:hover:bg-surface"
                )}
              >
                {label} {key === "reviews" && reviews.length > 0 && `(${reviews.length})`}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div role="tabpanel" id={`tab-panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex-1 overflow-y-auto p-5 sm:p-6">
            {tab === "info" && (
              <div className="space-y-4 animate-[fadeUp_0.2s_ease-out]">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface dark:bg-surface rounded-xl p-3 text-center">
                    <p className="text-xs text-muted mb-1">Categoría</p>
                    <p className="font-bold text-[var(--text-primary)] text-sm">{category?.label}</p>
                  </div>
                  <div className="bg-surface dark:bg-surface rounded-xl p-3 text-center">
                    <p className="text-xs text-muted mb-1">Unidad</p>
                    <p className="font-bold text-[var(--text-primary)] text-sm">{product.unit}</p>
                  </div>
                  {product.badge && (
                    <div className="bg-surface dark:bg-surface rounded-xl p-3 text-center">
                      <p className="text-xs text-muted mb-1">Etiqueta</p>
                      <p className="font-bold text-primary text-sm">{product.badge}</p>
                    </div>
                  )}
                  <div className="bg-surface dark:bg-surface rounded-xl p-3 text-center">
                    <p className="text-xs text-muted mb-1">Precio</p>
                    <p className="font-bold text-primary text-sm">S/{Number(product.price).toFixed(2)}/{product.unit}</p>
                  </div>
                </div>

                {staticDesc && (
                  <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 border border-[var(--rule-base)]">
                    <p className="text-xs font-semibold text-muted mb-1">Descripción</p>
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed">{staticDesc}</p>
                  </div>
                )}

                <div className="bg-primary/5 dark:bg-primary/10 rounded-xl p-4 border border-primary/10">
                  <p className="text-sm text-[var(--text-primary)] font-medium flex items-start gap-2">
                    <Truck className="h-4 w-4 mt-0.5 text-primary shrink-0" aria-hidden="true" />
                    <span><strong>Delivery gratis</strong>. Paga con <strong>Yape</strong> o <strong>efectivo</strong> contra entrega.</span>
                  </p>
                </div>

                {priceHistory.length > 1 && (() => {
                  const prices = priceHistory.map(p => p.price);
                  const min = Math.min(...prices);
                  const max = Math.max(...prices);
                  const range = max - min || 1;
                  const W = (priceHistory.length - 1) * 40;
                  const points = prices.map((p, i) => `${i * 40},${50 - ((p - min) / range) * 42}`).join(" ");
                  return (
                    <div className="bg-surface dark:bg-surface rounded-xl p-4 border border-[var(--rule-base)]">
                      <p className="text-xs font-semibold text-gray-500 dark:text-muted mb-3 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> Historial de precios</p>
                      <div className="relative h-14">
                        <svg viewBox={`0 0 ${W || 1} 55`} className="w-full h-full" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="phGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                            </linearGradient>
                          </defs>
                          <path d={`${points.split(" ").map((p, i) => i === 0 ? `M${p}` : `L${p}`).join(" ")} L${W},55 L0,55 Z`} fill="url(#phGrad)" />
                          <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                          {prices.map((p, i) => (
                            <circle key={i} cx={i * 40} cy={50 - ((p - min) / range) * 42} r="3" fill={i === prices.length - 1 ? "var(--accent)" : "#14C2C2"} stroke="white" strokeWidth="1.5" />
                          ))}
                        </svg>
                      </div>
                      <div className="flex justify-between text-[length:var(--ts-2xs)] text-gray-400 mt-1.5">
                        <span>{new Date(priceHistory[0].createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</span>
                        <span className="font-semibold text-primary">S/{prices[prices.length - 1].toFixed(2)} actual</span>
                        <span>{new Date(priceHistory[priceHistory.length - 1].createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {tab === "reviews" && (
              <div className="space-y-4 animate-[fadeUp_0.2s_ease-out]">
                {!reviewSubmitted ? (
                  <details className="group">
                    <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-dark py-2 list-none">
                      <Star className="h-4 w-4" />
                      Dejar mi reseña
                      <span className="ml-auto text-xs text-muted group-open:hidden">▼</span>
                      <span className="ml-auto text-xs text-muted hidden group-open:inline">▲</span>
                    </summary>
                    <form onSubmit={handleSubmitReview} className="mt-3 space-y-3 pb-3 border-b border-[var(--rule-base)]">
                      <div className="flex items-center gap-1">
                        {[1,2,3,4,5].map(s => (
                          <button key={s} type="button" onMouseEnter={() => setFormHover(s)} onMouseLeave={() => setFormHover(0)} onClick={() => setFormRating(s)} className="p-0.5" aria-label={`${s} estrellas`}>
                            <Star className={cn("h-6 w-6 transition-colors", (formHover || formRating) >= s ? "text-[var(--data-warning-500)] fill-[var(--data-warning-500)]" : "text-gray-300")} />
                          </button>
                        ))}
                        {formRating > 0 && <span className="ml-2 text-xs text-muted">{["","Muy malo","Malo","Regular","Bueno","Excelente"][formRating]}</span>}
                      </div>
                      <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Tu nombre" maxLength={60}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--rule-base)] bg-white dark:bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                      <textarea value={formText} onChange={e => setFormText(e.target.value)} placeholder={`¿Qué te pareció ${product.name}?`} maxLength={400} rows={2}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--rule-base)] bg-white dark:bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
                      {reviewError && <p className="text-xs text-[var(--data-error-500)]">{reviewError}</p>}
                      <button type="submit" disabled={submitting}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 transition-colors">
                        {submitting ? <span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" /> : <Star className="h-3.5 w-3.5" />}
                        Enviar reseña
                      </button>
                    </form>
                  </details>
                ) : (
                  <div className="flex items-center gap-2 text-[var(--data-success-600)] text-sm font-semibold py-2 border-b border-[var(--rule-base)]">
                    ✓ ¡Gracias! Tu reseña está en revisión
                  </div>
                )}

                {reviews.length === 0 ? (
                  <div className="text-center py-6">
                    <Star className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-muted text-sm">Aún no hay reseñas para este producto</p>
                    <p className="text-xs text-muted mt-1">¡Sé el primero en opinar!</p>
                  </div>
                ) : (
                  reviews.map((r, i) => (
                    <div key={r.id ?? i} className="bg-surface dark:bg-surface rounded-xl p-4 border border-[var(--rule-base)]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold text-sm text-[var(--text-primary)]">{r.name}</span>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, s) => (
                            <Star key={s} className={cn("h-3.5 w-3.5", s < r.rating ? "text-[var(--data-warning-500)] fill-[var(--data-warning-500)]" : "text-gray-300")} />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-muted">{r.text}</p>
                      <p className="text-[length:var(--ts-2xs)] text-muted mt-1">{new Date(r.date).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "alsoBought" && (
              <div className="grid grid-cols-2 gap-3 animate-[fadeUp_0.2s_ease-out]">
                {coPurchased.length === 0 ? (
                  <div className="col-span-2 text-center py-8">
                    <ShoppingCart className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-muted text-sm">Aún no hay datos de compras frecuentes</p>
                  </div>
                ) : (
                  coPurchased.map((cp) => (
                    <div key={cp.id} className="bg-surface dark:bg-surface rounded-xl border border-[var(--rule-base)] overflow-hidden">
                      <div className="relative aspect-square bg-gray-50 dark:bg-[var(--surface-raised)]">
                        {cp.image && <Image src={cp.image} alt={cp.name} fill className="object-cover" sizes="200px" loading="lazy" />}
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1">{cp.name}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="font-extrabold text-primary text-sm">S/{Number(cp.price).toFixed(2)}</span>
                          <button
                            onClick={() => { addItem({ ...cp, category: "", unit: cp.unit } as LiveProduct); showToast(cp.name, cp.image ?? ""); }}
                            className="h-7 w-7 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary-dark active:scale-95 transition-all"
                            aria-label={`Agregar ${cp.name}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "related" && (
              <div className="grid grid-cols-2 gap-3 animate-[fadeUp_0.2s_ease-out]">
                {relatedProducts.length === 0 ? (
                  <div className="col-span-2 text-center py-8">
                    <Package className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-muted text-sm">No hay productos relacionados</p>
                  </div>
                ) : (
                  relatedProducts.map((rp) => (
                    <div key={rp.id} className="bg-surface dark:bg-surface rounded-xl border border-[var(--rule-base)] overflow-hidden">
                      <div className="relative aspect-square bg-gray-50 dark:bg-[var(--surface-raised)]">
                        {rp.image && <Image src={rp.image} alt={rp.name} fill className="object-cover" sizes="200px" loading="lazy" />}
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1">{rp.name}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="font-extrabold text-primary text-sm">S/{Number(rp.price).toFixed(2)}</span>
                          <button
                            onClick={() => { addItem(rp); showToast(rp.name, rp.image); }}
                            className="h-7 w-7 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary-dark active:scale-95 transition-all"
                            aria-label={`Agregar ${rp.name}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <Link
              href={`${tienda}/${getProductSlug(product)}`}
              className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-primary text-primary font-bold text-sm hover:bg-primary hover:text-white transition-all active:scale-[0.98]"
              onClick={onClose}
            >
              Ver detalles completos <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
