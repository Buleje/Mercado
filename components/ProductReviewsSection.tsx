"use client";

import { useState } from "react";
import { Star, User, MessageSquare, Send, CheckCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useCachedData } from "@/hooks/use-cached-data";
import { useCustomer } from "@/contexts/customer-context";

type ReviewItem = {
  id: string;
  name: string;
  rating: number;
  text: string;
  date: string;
};

interface ProductReviewsSectionProps {
  productId: number;
  productName: string;
}

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(cls, i < rating ? "text-amber-500 fill-amber-500" : "text-gray-300 dark:text-gray-600")}
        />
      ))}
    </div>
  );
}

function RatingBar({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-6 text-right font-medium text-muted">{stars}</span>
      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
      <div className="flex-1 h-2 bg-gray-100 dark:bg-surface rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-xs text-muted">{count}</span>
    </div>
  );
}

export default function ProductReviewsSection({ productId, productName }: ProductReviewsSectionProps) {
  const [sortBy, setSortBy] = useState<"recent" | "highest" | "lowest">("recent");
  const [showAll, setShowAll] = useState(false);
  const { customer } = useCustomer();

  // Review form state
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState(customer?.name ?? "");
  const [formRating, setFormRating] = useState(0);
  const [formHover, setFormHover] = useState(0);
  const [formText, setFormText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const { data: reviews = [], isLoading } = useCachedData<ReviewItem[]>(
    `product-reviews-${productId}`,
    async () => {
      const res = await fetch(`/api/reviews?productId=${productId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    { staleTime: 5 * 60 * 1000, refetchOnFocus: false },
  );

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRating) { setFormError("Selecciona una puntuación"); return; }
    if (!formText.trim()) { setFormError("Escribe tu opinión"); return; }
    if (!formName.trim()) { setFormError("Ingresa tu nombre"); return; }
    setSubmitting(true);
    setFormError("");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `rv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: formName.trim(),
          text: formText.trim(),
          rating: formRating,
          productId,
          phone: customer?.phone ?? undefined,
          date: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Error al enviar");
      setSubmitted(true);
      setFormText("");
      setFormRating(0);
      setShowForm(false);
    } catch {
      setFormError("No se pudo enviar. Intenta de nuevo.");
    }
    setSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-gray-200 dark:bg-surface rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 dark:bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const total = reviews.length;
  const avgRating = total > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((r) => r.rating === stars).length,
  }));

  const sorted = [...reviews].sort((a, b) => {
    if (sortBy === "highest") return b.rating - a.rating;
    if (sortBy === "lowest") return a.rating - b.rating;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const visible = showAll ? sorted : sorted.slice(0, 6);

  return (
    <section id="resenas" className="scroll-mt-20">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h2 className="text-xl sm:text-2xl font-extrabold text-foreground flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          Reseñas de {productName}
        </h2>
        {!submitted ? (
          <button
            onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors shadow-sm"
          >
            <Star className="h-4 w-4" />
            {showForm ? "Cancelar" : "Dejar reseña"}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold">
            <CheckCircle className="h-4 w-4" />
            ¡Gracias! Tu reseña está en revisión
          </div>
        )}
      </div>

      {/* Review form */}
      {showForm && (
        <div className="mb-6 bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-5 sm:p-6 shadow-sm">
          <h3 className="font-bold text-foreground mb-4">Tu opinión sobre {productName}</h3>
          <form onSubmit={handleSubmitReview} className="space-y-4">
            {/* Star selector */}
            <div>
              <label className="text-sm font-medium text-muted mb-2 block">Puntuación *</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    type="button"
                    onMouseEnter={() => setFormHover(s)}
                    onMouseLeave={() => setFormHover(0)}
                    onClick={() => setFormRating(s)}
                    className="p-0.5"
                    aria-label={`${s} estrella${s !== 1 ? "s" : ""}`}
                  >
                    <Star className={cn("h-7 w-7 transition-colors", (formHover || formRating) >= s ? "text-amber-500 fill-amber-500" : "text-gray-300")} />
                  </button>
                ))}
                {formRating > 0 && (
                  <span className="ml-2 text-sm text-muted">{["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"][formRating]}</span>
                )}
              </div>
            </div>
            {/* Name */}
            <div>
              <label className="text-sm font-medium text-muted mb-1 block">Tu nombre *</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="¿Cómo te llamas?"
                maxLength={60}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {/* Comment */}
            <div>
              <label className="text-sm font-medium text-muted mb-1 block">Tu opinión *</label>
              <textarea
                value={formText}
                onChange={e => setFormText(e.target.value)}
                placeholder={`¿Qué te pareció ${productName}?`}
                maxLength={500}
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
              <p className="text-xs text-muted mt-1 text-right">{formText.length}/500</p>
            </div>
            {formError && <p className="text-sm text-red-500">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {submitting ? <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" /> : <Send className="h-4 w-4" />}
              {submitting ? "Enviando…" : "Enviar reseña"}
            </button>
            <p className="text-xs text-muted">Las reseñas son revisadas antes de publicarse.</p>
          </form>
        </div>
      )}

      {total === 0 ? (
        <div className="text-center py-12 bg-surface dark:bg-surface rounded-2xl border border-gray-100 dark:border-card-border">
          <Star className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-muted font-medium">Aún no hay reseñas para este producto</p>
          <p className="text-sm text-muted mt-1">¡Sé el primero en opinar!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white dark:bg-card rounded-2xl border border-gray-100 dark:border-card-border p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex flex-col items-center justify-center shrink-0">
                <span className="text-5xl font-extrabold text-foreground">{avgRating.toFixed(1)}</span>
                <StarRating rating={Math.round(avgRating)} size="md" />
                <p className="text-sm text-muted mt-1">{total} reseña{total !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex-1 space-y-1.5">
                {distribution.map((d) => (
                  <RatingBar key={d.stars} stars={d.stars} count={d.count} total={total} />
                ))}
              </div>
            </div>
          </div>

          {/* Sort */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted">{total} reseña{total !== 1 ? "s" : ""}</p>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="text-sm border border-gray-200 dark:border-card-border bg-white dark:bg-card text-foreground rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="recent">Más recientes</option>
              <option value="highest">Mejor puntaje</option>
              <option value="lowest">Menor puntaje</option>
            </select>
          </div>

          {/* Reviews list */}
          <div className="space-y-3">
            {visible.map((review, i) => (
              <div
                key={review.id ?? i}
                className="bg-white dark:bg-card rounded-xl border border-gray-100 dark:border-card-border p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">{review.name}</p>
                      <p className="text-xs text-muted">
                        {new Date(review.date).toLocaleDateString("es-PE", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <StarRating rating={review.rating} />
                </div>
                <p className="text-sm text-muted leading-relaxed">{review.text}</p>
              </div>
            ))}
          </div>

          {total > 6 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-3 text-sm font-semibold text-primary hover:bg-primary/5 rounded-xl transition-colors border border-primary/20"
            >
              Ver todas las reseñas ({total})
            </button>
          )}
        </div>
      )}
    </section>
  );
}
