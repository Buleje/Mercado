"use client";

/**
 * StoreReviews — rating summary + lista de reseñas.
 *
 * Rediseño 2026-06-06 (Brandon): estrellas ámbar de marca, tokens del DS
 * (sin grises hardcodeados), y empty state limpio cuando la tienda aún no
 * tiene reseñas (antes mostraba un "0.0" gigante + barras vacías, se veía roto).
 */

import { Star, ThumbsUp, MessageSquare } from "@buleje/design-system/icons";
import type { MockStoreReview, MockStoreRatingSummary } from "@/lib/mock-store-reviews";
import { cn } from "@/lib/utils";
import LeaveReviewForm from "./LeaveReviewForm";

interface StoreReviewsProps {
  summary: MockStoreRatingSummary;
  reviews: MockStoreReview[];
  storeSlug?: string;
  storeName?: string;
}

function StarRow({ filled, total = 5, size = "h-3.5 w-3.5" }: { filled: number; total?: number; size?: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <Star
          key={i}
          className={cn(size, i < filled
            ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
            : "fill-[var(--surface-sunken)] text-[var(--rule-base)]")}
          strokeWidth={i < filled ? 0 : 1.5}
        />
      ))}
    </span>
  );
}

function RatingBar({ stars, count, percentage }: { stars: number; count: number; percentage: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-4 text-right text-xs font-medium tabular-nums text-[var(--text-secondary)]">{stars}</span>
      <Star className="h-3 w-3 shrink-0 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" strokeWidth={0} aria-hidden />
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]" role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} aria-label={`${stars} estrellas: ${percentage}%`}>
        <div className="h-full rounded-full bg-[var(--data-warning-500)]/70 transition-all" style={{ width: `${percentage}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-[var(--text-tertiary)]">{count}</span>
    </div>
  );
}

function ReviewCard({ review }: { review: MockStoreReview }) {
  const date = new Date(review.date).toLocaleDateString("es-PE", { year: "numeric", month: "long", day: "numeric" });
  return (
    <article className="flex flex-col gap-2.5 border-b border-[var(--rule-soft)] py-4 last:border-0">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-xs font-bold text-[var(--text-secondary)]" aria-hidden>
          {review.authorInitials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-[var(--text-primary)]">{review.authorName}</span>
            {review.verified && (
              <span className="rounded-full border border-[var(--rule-base)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]">Compra verificada</span>
            )}
          </div>
          <time dateTime={review.date} className="mt-0.5 block text-xs text-[var(--text-tertiary)]">{date}</time>
        </div>
        <StarRow filled={review.rating} />
      </div>
      <div className="pl-12">
        <p className="mb-1 text-sm font-semibold text-[var(--text-primary)]">{review.title}</p>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{review.body}</p>
        {review.helpfulCount > 0 && (
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <ThumbsUp className="h-3 w-3" aria-hidden />
            {review.helpfulCount} persona{review.helpfulCount !== 1 ? "s" : ""} encontraron esto útil
          </div>
        )}
      </div>
    </article>
  );
}

export default function StoreReviews({ summary, reviews, storeSlug, storeName }: StoreReviewsProps) {
  const hasReviews = summary.total > 0;

  return (
    <section aria-labelledby="store-reviews-heading" className="space-y-5">
      {/* Header — con rating inline cuando existe */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Opiniones</p>
          <h2 id="store-reviews-heading" className="text-xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-2xl">Lo que dicen los clientes</h2>
        </div>
        {hasReviews && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-1.5">
            <Star className="h-4 w-4 fill-[var(--data-warning-500)] text-[var(--data-warning-500)]" strokeWidth={0} aria-hidden />
            <span className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums">{Number(summary.average).toFixed(1)}</span>
            <span className="text-xs font-medium text-[var(--text-tertiary)]">({summary.total})</span>
          </span>
        )}
      </div>

      {hasReviews ? (<>
        {/* Resumen + breakdown */}
        <div className="grid grid-cols-1 gap-6 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:grid-cols-[auto_1fr]">
          <div className="flex min-w-[100px] flex-col items-center justify-center gap-1.5">
            <span className="text-5xl font-extrabold tracking-tight text-[var(--text-primary)]" aria-label={`Calificación promedio: ${summary.average}`}>{Number(summary.average).toFixed(1)}</span>
            <StarRow filled={Math.round(summary.average)} size="h-4 w-4" />
            <span className="text-xs text-[var(--text-tertiary)]">{summary.total} reseñas</span>
          </div>
          <div className="flex flex-col justify-center gap-1.5">
            {summary.breakdown.map((row) => <RatingBar key={row.stars} stars={row.stars} count={row.count} percentage={row.percentage} />)}
          </div>
        </div>
        <div>{reviews.map((review) => <ReviewCard key={review.id} review={review} />)}</div>
      </>) : (
        /* Empty state limpio — sin "0.0" roto */
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-8 text-center">
          <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><MessageSquare className="h-6 w-6" /></span>
          <p className="text-base font-extrabold text-[var(--text-primary)]">Todavía no hay opiniones</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--text-secondary)]">Sé el primero en contar tu experiencia con esta tienda. Tu reseña ayuda a otros vecinos a decidir.</p>
        </div>
      )}

      {storeSlug && storeName && (
        <div className="pt-1"><LeaveReviewForm storeSlug={storeSlug} storeName={storeName} /></div>
      )}
    </section>
  );
}
