"use client";

/**
 * StoreReviews — rating summary + lista de reseñas.
 *
 * Rating grande + breakdown por estrellas (barras teal-soft) + lista de reviews.
 * Cero emojis, dark-mode completo, accesible.
 */

import { Star, ThumbsUp } from "@buleje/design-system/icons";
import type { MockStoreReview, MockStoreRatingSummary } from "@/lib/mock-store-reviews";
import { cn } from "@/lib/utils";
import LeaveReviewForm from "./LeaveReviewForm";

interface StoreReviewsProps {
  summary: MockStoreRatingSummary;
  reviews: MockStoreReview[];
  storeSlug?: string;
  storeName?: string;
}

function StarRow({ filled, total = 5 }: { filled: number; total?: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i < filled
              ? "fill-gray-700 text-gray-700 dark:fill-gray-200 dark:text-gray-200"
              : "fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700"
          )}
        />
      ))}
    </span>
  );
}

function RatingBar({ stars, count, percentage, maxCount }: { stars: number; count: number; percentage: number; maxCount: number }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-4 text-right text-gray-500 dark:text-gray-400 tabular-nums text-xs font-medium">
        {stars}
      </span>
      <Star className="h-3 w-3 fill-gray-400 text-gray-400 flex-shrink-0" aria-hidden />
      <div
        className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${stars} estrellas: ${percentage}%`}
      >
        <div
          className="h-full rounded-full bg-gray-400 dark:bg-gray-500 transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs text-gray-400 dark:text-gray-500 tabular-nums">
        {count}
      </span>
    </div>
  );
}

function ReviewCard({ review }: { review: MockStoreReview }) {
  const date = new Date(review.date).toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="flex flex-col gap-3 py-5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      {/* Author + date */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400"
          aria-hidden
        >
          {review.authorInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {review.authorName}
            </span>
            {review.verified && (
              <span className="text-[length:var(--ts-2xs)] font-medium text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-0.5">
                Compra verificada
              </span>
            )}
          </div>
          <time
            dateTime={review.date}
            className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 block"
          >
            {date}
          </time>
        </div>
        <StarRow filled={review.rating} />
      </div>

      {/* Content */}
      <div className="pl-12">
        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
          {review.title}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {review.body}
        </p>
        {review.helpfulCount > 0 && (
          <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-400 dark:text-gray-500">
            <ThumbsUp className="h-3 w-3" aria-hidden />
            {review.helpfulCount} persona{review.helpfulCount !== 1 ? "s" : ""} encontraron esto útil
          </div>
        )}
      </div>
    </article>
  );
}

export default function StoreReviews({ summary, reviews, storeSlug, storeName }: StoreReviewsProps) {
  const maxCount = Math.max(...summary.breakdown.map((b) => b.count), 1);

  return (
    <section aria-labelledby="store-reviews-heading" className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-2">
          Opiniones
        </p>
        <h2
          id="store-reviews-heading"
          className="text-xl sm:text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white"
        >
          Lo que dicen nuestros clientes
        </h2>
      </div>

      {/* Rating summary + breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {/* Big number */}
        <div className="flex flex-col items-center justify-center gap-2 min-w-[100px]">
          <span
            className="text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white"
            aria-label={`Calificación promedio: ${summary.average}`}
          >
            {summary.average.toFixed(1)}
          </span>
          <StarRow filled={Math.round(summary.average)} />
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {summary.total} reseñas
          </span>
        </div>

        {/* Breakdown bars */}
        <div className="flex flex-col justify-center gap-1.5">
          {summary.breakdown.map((row) => (
            <RatingBar
              key={row.stars}
              stars={row.stars}
              count={row.count}
              percentage={row.percentage}
              maxCount={maxCount}
            />
          ))}
        </div>
      </div>

      {/* Review list */}
      {reviews.length > 0 ? (
        <div>
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-8 text-center">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-300">
            Esta tienda todavía no tiene reseñas.
          </p>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Sé el primero en compartir tu experiencia después de tu próxima compra.
          </p>
        </div>
      )}

      {/* CTA Dejar reseña */}
      {storeSlug && storeName && (
        <div className="pt-2">
          <LeaveReviewForm storeSlug={storeSlug} storeName={storeName} />
        </div>
      )}
    </section>
  );
}
