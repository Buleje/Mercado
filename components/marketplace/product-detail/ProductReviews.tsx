"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Filter, ArrowDownUp, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MockReview } from "@/lib/mocks/product-reviews.mock";
import RatingBreakdown, { type BreakdownData } from "./RatingBreakdown";
import ReviewCard from "./ReviewCard";
import WriteReviewForm from "./WriteReviewForm";
import { csrfHeaders } from "@/lib/csrf-client";

type ReviewFilter = "all" | "with_photos" | "verified" | "helpful";
type ReviewSort = "recent" | "helpful" | "rating_high" | "rating_low";

interface ProductReviewsProps {
  productId: number;
  productName: string;
}

const FILTER_LABELS: Record<ReviewFilter, string> = {
  all: "Todas",
  with_photos: "Con fotos",
  helpful: "Más útiles",
  verified: "Verificadas",
};

const SORT_LABELS: Record<ReviewSort, string> = {
  recent: "Más recientes",
  helpful: "Más útiles",
  rating_high: "Rating alto",
  rating_low: "Rating bajo",
};

const PAGE_SIZE = 4;

export default function ProductReviews({ productId, productName }: ProductReviewsProps) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [reviews, setReviews] = useState<MockReview[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);

  const fetchReviews = useCallback(
    async (resetOffset: number) => {
      const qs = new URLSearchParams({
        filter,
        sort,
        limit: String(PAGE_SIZE),
        offset: String(resetOffset),
      });
      const res = await fetch(
        `/api/marketplace/reviews-enhanced/${productId}?${qs.toString()}`,
      );
      if (!res.ok) throw new Error("Failed to load reviews");
      return (await res.json()) as {
        data: MockReview[];
        total: number;
        hasMore: boolean;
        breakdown: BreakdownData;
      };
    },
    [productId, filter, sort],
  );

  // Initial + filter/sort changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchReviews(0)
      .then((json) => {
        if (cancelled) return;
        setReviews(json.data);
        setTotal(json.total);
        setHasMore(json.hasMore);
        setBreakdown(json.breakdown);
        setOffset(json.data.length);
      })
      .catch(() => {
        if (cancelled) return;
        setReviews([]);
        setTotal(0);
        setHasMore(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchReviews]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const json = await fetchReviews(offset);
      setReviews((prev) => [...prev, ...json.data]);
      setOffset((prev) => prev + json.data.length);
      setHasMore(json.hasMore);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }, [fetchReviews, offset, hasMore, loadingMore]);

  const handleHelpful = useCallback(async (reviewId: string) => {
    await fetch(`/api/marketplace/reviews-enhanced/${productId}/helpful`, {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ reviewId }),
    }).catch(() => {
      /* ignore — optimistic UI already applied */
    });
  }, [productId]);

  const handleFilterFromBreakdown = useCallback((f: "verified" | "with_photos") => {
    setFilter(f);
    if (typeof window !== "undefined") {
      const el = document.getElementById(`reviews-list-${productId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [productId]);

  return (
    <section aria-labelledby={`reviews-heading-${productId}`} className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[var(--text-tertiary)]" />
          <h2
            id={`reviews-heading-${productId}`}
            className="text-lg sm:text-xl font-semibold text-[var(--text-primary)]"
          >
            Opiniones de la comunidad
            {total > 0 && (
              <span className="ml-2 text-sm font-normal text-[var(--text-secondary)]">
                ({total})
              </span>
            )}
          </h2>
        </div>
        {!writeOpen && (
          <button
            onClick={() => setWriteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Escribir reseña</span>
            <span className="sm:hidden">Reseñar</span>
          </button>
        )}
      </header>

      {/* Formulario INLINE (sin modal, Brandon 2026-06-14) */}
      {writeOpen && (
        <WriteReviewForm
          productId={productId}
          productName={productName}
          onCancel={() => setWriteOpen(false)}
        />
      )}

      {breakdown && (
        <RatingBreakdown data={breakdown} onFilterClick={handleFilterFromBreakdown} />
      )}

      {/* Filtros + Sort */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex items-center gap-1 border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1 overflow-x-auto">
          <Filter className="h-3.5 w-3.5 text-[var(--text-tertiary)] mx-2 shrink-0" />
          {(["all", "with_photos", "helpful", "verified"] as ReviewFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-sm text-xs font-medium whitespace-nowrap transition-colors",
                filter === f
                  ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-2">
          <ArrowDownUp className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
          <label htmlFor={`rv-sort-${productId}`} className="sr-only">
            Ordenar reseñas
          </label>
          <select
            id={`rv-sort-${productId}`}
            value={sort}
            onChange={(e) => setSort(e.target.value as ReviewSort)}
            className="rounded-sm border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1.5 text-xs font-medium text-[var(--text-primary)] focus:ring-1 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)] outline-none"
          >
            {(Object.keys(SORT_LABELS) as ReviewSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lista */}
      <div id={`reviews-list-${productId}`}>
        {loading && reviews.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[var(--text-secondary)]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Cargando reseñas…</span>
          </div>
        ) : reviews.length === 0 ? (
          <div className="border border-dashed border-[var(--rule-base)] py-12 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-[var(--text-tertiary)]" />
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              No hay reseñas que coincidan con este filtro.
            </p>
            {filter !== "all" && (
              <button
                onClick={() => setFilter("all")}
                className="mt-2 text-sm font-semibold text-[var(--accent)] hover:underline"
              >
                Ver todas las reseñas
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} onHelpful={handleHelpful} />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="mt-5 flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 rounded-sm border border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              Ver más reseñas
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
