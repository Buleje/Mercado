"use client";

import { useState, useEffect, useTransition, useId } from "react";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ------------------------------------------------------------------ types ---

interface Review {
  id: string;
  name: string;
  location?: string;
  text: string;
  rating: number;
  date: string;
  productId?: number | null;
  status?: string;
}

interface ProductReviewsProps {
  productId: number;
}

// ------------------------------------------------------------ star icon ---

function StarIcon({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={filled ? "#f97316" : "none"}
      stroke={filled ? "#f97316" : "#9ca3af"}
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
      />
    </svg>
  );
}

function StarRating({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={n <= value} size={size} />
      ))}
    </div>
  );
}

// -------------------------------------------------- interactive star picker ---

function StarPicker({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  id: string;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-1" id={id} role="group" aria-label="Calificacion">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
          className="transition-transform hover:scale-110 active:scale-95"
        >
          <StarIcon filled={n <= (hovered || value)} size={24} />
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------------- review card ---

function ReviewCard({ review }: { review: Review }) {
  const date = new Date(review.date);
  const formatted = date.toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="rounded-xl border border-border bg-[var(--surface-raised)] p-4 dark:bg-[var(--surface-raised)] dark:border-border">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            {review.name || "Anonimo"}
          </p>
          {review.location && (
            <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{review.location}</p>
          )}
        </div>
        <StarRating value={review.rating} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-primary)] dark:text-[var(--text-primary)]">
        {review.text}
      </p>
      <p className="mt-2 text-xs text-[var(--text-secondary)] dark:text-muted">{formatted}</p>
    </article>
  );
}

// ------------------------------------------------------- summary bar ---

function RatingSummary({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null;

  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  return (
    <div className="flex items-center gap-3">
      <span className="text-4xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
        {avg.toFixed(1)}
      </span>
      <div>
        <StarRating value={Math.round(avg)} size={20} />
        <p className="mt-1 text-xs text-[var(--text-secondary)] dark:text-muted">
          {reviews.length} {reviews.length === 1 ? "resena" : "resenas"}
        </p>
      </div>
    </div>
  );
}

// ----------------------------------------------------------- form ---

function ReviewForm({
  productId,
  onSuccess,
}: {
  productId: number;
  onSuccess: (review: Review) => void;
}) {
  const uid = useId();
  const [name, setName]       = useState("");
  const [rating, setRating]   = useState(0);
  const [text, setText]       = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (rating === 0) {
      setFormError("Selecciona una calificacion");
      return;
    }
    if (!text.trim()) {
      setFormError("Escribe un comentario");
      return;
    }

    setFormError(null);

    startTransition(async () => {
      try {
        const payload = {
          id: crypto.randomUUID(),
          name: name.trim() || "Anonimo",
          text: text.trim(),
          rating,
          productId,
          date: new Date().toISOString(),
        };

        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setFormError((body as { error?: string }).error ?? "Error al enviar tu resena. Intenta de nuevo.");
          return;
        }

        const saved: Review = await res.json();
        setSubmitted(true);
        onSuccess(saved);
      } catch {
        setFormError("Sin conexion. Intenta de nuevo.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-sm text-[var(--accent)] dark:border-[var(--accent)]/40 dark:bg-[var(--accent)]/10 dark:text-green-300">
        Gracias por tu opinion. Tu resena esta en revision y se publicara pronto.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-[var(--surface-raised)] p-5 dark:bg-[var(--surface-raised)] dark:border-border">
      <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
        Deja tu opinion
      </p>

      {/* name */}
      <div className="space-y-1">
        <label htmlFor={`${uid}-name`} className="text-xs font-medium text-[var(--text-secondary)] dark:text-muted">
          Nombre (opcional)
        </label>
        <input
          id={`${uid}-name`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          maxLength={60}
          className={cn(
            "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-[var(--text-primary)]",
            "placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
            "dark:bg-background dark:border-border dark:text-[var(--text-primary)] dark:placeholder:text-muted",
          )}
        />
      </div>

      {/* rating */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-[var(--text-secondary)] dark:text-muted">Calificacion</p>
        <StarPicker id={`${uid}-rating`} value={rating} onChange={setRating} />
      </div>

      {/* comment */}
      <div className="space-y-1">
        <label htmlFor={`${uid}-text`} className="text-xs font-medium text-[var(--text-secondary)] dark:text-muted">
          Comentario
        </label>
        <textarea
          id={`${uid}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cuéntanos tu experiencia con este producto..."
          rows={3}
          maxLength={500}
          required
          className={cn(
            "w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-[var(--text-primary)]",
            "placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
            "dark:bg-background dark:border-border dark:text-[var(--text-primary)] dark:placeholder:text-muted",
          )}
        />
        <p className="text-right text-xs text-[var(--text-secondary)] dark:text-muted">{text.length}/500</p>
      </div>

      {formError && (
        <p className="text-xs text-[var(--data-error-600)] dark:text-red-400">{formError}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          "w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-colors",
          "hover:bg-[var(--accent-dark)] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed",
        )}
      >
        {isPending ? "Enviando..." : "Publicar resena"}
      </button>
    </form>
  );
}

// ----------------------------------------------------------------- main ---

export default function ProductReviews({ productId }: ProductReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(`/api/reviews?productId=${productId}`);
        if (!res.ok) throw new Error("fetch failed");
        const data: Review[] = await res.json();
        if (!cancelled) setReviews(data);
      } catch {
        if (!cancelled) setFetchError("No pudimos cargar las resenas. Intenta mas tarde.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [productId]);

  function handleNewReview(review: Review) {
    // Optimistic — append locally (status=pending, won't show in next fetch)
    setReviews((prev) => [review, ...prev]);
  }

  return (
    <section aria-labelledby="reviews-title" className="space-y-6">
      <h2 id="reviews-title" className="text-lg font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
        Resenas del producto
      </h2>

      {loading && (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-xl bg-muted dark:bg-muted" />
          ))}
        </div>
      )}

      {fetchError && (
        <p className="text-sm text-[var(--data-error-600)] dark:text-red-400">{fetchError}</p>
      )}

      {!loading && !fetchError && (
        <>
          <RatingSummary reviews={reviews} />

          {reviews.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
              Se el primero en opinar sobre este producto.
            </p>
          ) : (
            <div className="space-y-3">
              {reviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
          )}

          <ReviewForm productId={productId} onSuccess={handleNewReview} />
        </>
      )}
    </section>
  );
}
