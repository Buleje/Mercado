"use client";

/**
 * ReviewSummary — Distribucion de reseñas estilo Amazon.
 *
 * Muestra:
 *   - Rating promedio grande con RatingStars
 *   - Count total
 *   - Barra por estrellas (5/4/3/2/1) con % de reseñas
 *   - Opcional: CTA "Escribir reseña"
 *
 * Uso:
 *   <ReviewSummary
 *     average={4.6}
 *     total={128}
 *     distribution={{ 5: 88, 4: 24, 3: 10, 2: 4, 1: 2 }}
 *     onWriteReview={() => openReviewModal()}
 *   />
 */

import RatingStars from "./RatingStars";
import { NotebookPen } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  average: number;
  total: number;
  distribution: Record<5 | 4 | 3 | 2 | 1, number>;
  onWriteReview?: () => void;
  className?: string;
}

export default function ReviewSummary({
  average,
  total,
  distribution,
  onWriteReview,
  className,
}: Props) {
  return (
    <div className={cn("flex flex-col md:flex-row gap-6 items-center md:items-start", className)}>
      {/* Left: big rating */}
      <div className="text-center shrink-0">
        <div className="text-5xl font-extrabold text-[var(--text-primary)] tabular-nums leading-none tracking-tight">
          {average.toFixed(1)}
        </div>
        <div className="mt-2">
          <RatingStars value={average} size="md" />
        </div>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          {total.toLocaleString("es-PE")} {total === 1 ? "reseña" : "reseñas"}
        </p>
      </div>

      {/* Right: distribution bars */}
      <div className="flex-1 w-full min-w-0 space-y-1.5">
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const count = distribution[star] ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={star} className="flex items-center gap-3 text-xs">
              <span className="shrink-0 w-6 font-bold text-[var(--text-secondary)] tabular-nums">
                {star}★
              </span>
              <div
                aria-hidden
                className="flex-1 h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden"
              >
                <div
                  className="h-full bg-[var(--accent)] transition-[width] duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="shrink-0 w-12 text-right text-[var(--text-tertiary)] tabular-nums">
                {count.toLocaleString("es-PE")}
              </span>
            </div>
          );
        })}

        {onWriteReview && (
          <button
            type="button"
            onClick={onWriteReview}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            <NotebookPen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Escribir reseña
          </button>
        )}
      </div>
    </div>
  );
}
