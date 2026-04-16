"use client";

import { useState } from "react";
import Image from "next/image";
import { Star, ThumbsUp, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";

interface ReviewSummary {
  avgRating: number;
  avgQuality?: number;
  avgPrice?: number;
  avgDelivery?: number;
  totalReviews: number;
  ratingDistribution: { [key: number]: number };
}

interface Review {
  id: string;
  name: string;
  date: string;
  rating: number;
  qualityRating?: number;
  priceRating?: number;
  deliveryRating?: number;
  text: string;
  photosJson?: string | null;
  helpfulCount: number;
  verified: boolean;
}

interface RatingByAttributeProps {
  summary: ReviewSummary;
  reviews: Review[];
}

function StarRow({ label, value }: { label: string; value?: number }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20 text-gray-500 dark:text-gray-400 text-xs shrink-0">{label}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={cn(
              "h-3 w-3",
              s <= Math.round(value)
                ? "fill-amber-400 text-amber-400"
                : "text-gray-200 dark:text-gray-700"
            )}
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function StarDisplay({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "h-6 w-6" : "h-3.5 w-3.5";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            cls,
            s <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-gray-200 dark:text-gray-700"
          )}
        />
      ))}
    </div>
  );
}

function parsePhotos(json?: string | null): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

export default function RatingByAttribute({ summary, reviews }: RatingByAttributeProps) {
  const [helpfulCounts, setHelpfulCounts] = useState<Record<string, number>>({});
  const [helpfulVoted, setHelpfulVoted] = useState<Set<string>>(new Set());
  const [showDistribution, setShowDistribution] = useState(false);

  const totalVotes = Object.values(summary.ratingDistribution).reduce((a, b) => a + b, 0);

  const handleHelpful = (reviewId: string, base: number) => {
    if (helpfulVoted.has(reviewId)) return;
    setHelpfulCounts((prev) => ({ ...prev, [reviewId]: (prev[reviewId] ?? base) + 1 }));
    setHelpfulVoted((prev) => new Set(prev).add(reviewId));
  };

  if (summary.totalReviews === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/20 mb-4">
          <Star className="h-8 w-8 text-amber-400" />
        </div>
        <p className="font-semibold text-gray-700 dark:text-gray-300 text-sm">
          Se el primero en dejar una resena
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Comparte tu experiencia con este producto
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: rating global */}
      <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
        <div className="flex flex-col items-center gap-1">
          <span className="text-5xl font-black text-gray-900 dark:text-white">
            {summary.avgRating.toFixed(1)}
          </span>
          <StarDisplay rating={summary.avgRating} size="lg" />
          <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {summary.totalReviews} resena{summary.totalReviews !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Sub-ratings por atributo */}
        <div className="flex flex-col gap-2">
          <StarRow label="Calidad" value={summary.avgQuality} />
          <StarRow label="Precio" value={summary.avgPrice} />
          <StarRow label="Entrega" value={summary.avgDelivery} />
        </div>
      </div>

      {/* Distribucion de estrellas */}
      <div>
        <button
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 sm:cursor-default"
          onClick={() => setShowDistribution((v) => !v)}
        >
          Distribucion de calificaciones
          <span className="sm:hidden">
            {showDistribution ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </button>

        <div className={cn("mt-3 space-y-1.5", "hidden sm:block", showDistribution && "!block")}>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = summary.ratingDistribution[star] ?? 0;
            const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-4 text-right shrink-0">
                  {star}
                </span>
                <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right shrink-0">
                  {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista de resenas */}
      <div className="space-y-5">
        {reviews.map((review) => {
          const photos = parsePhotos(review.photosJson);
          const currentHelpful = helpfulCounts[review.id] ?? review.helpfulCount;
          const voted = helpfulVoted.has(review.id);

          return (
            <div
              key={review.id}
              className="border-t border-gray-100 dark:border-gray-800 pt-5 first:border-0 first:pt-0"
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {review.name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900 dark:text-white">
                      {review.name}
                    </span>
                    {review.verified && (
                      <span className="text-[10px] font-semibold bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full">
                        Compra verificada
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 ml-auto">
                      {timeAgo(review.date)}
                    </span>
                  </div>

                  <div className="mt-1">
                    <StarDisplay rating={review.rating} />
                  </div>

                  {/* Mini ratings por atributo */}
                  {(review.qualityRating || review.priceRating || review.deliveryRating) && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {review.qualityRating && (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          Calidad: <strong>{review.qualityRating}</strong>/5
                        </span>
                      )}
                      {review.priceRating && (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          Precio: <strong>{review.priceRating}</strong>/5
                        </span>
                      )}
                      {review.deliveryRating && (
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          Entrega: <strong>{review.deliveryRating}</strong>/5
                        </span>
                      )}
                    </div>
                  )}

                  <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {review.text}
                  </p>

                  {/* Fotos */}
                  {photos.length > 0 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {photos.map((url, i) => (
                        <div
                          key={i}
                          className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
                        >
                          <Image
                            src={url}
                            alt={`Foto ${i + 1} de resena de ${review.name}`}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Util */}
                  <button
                    onClick={() => handleHelpful(review.id, review.helpfulCount)}
                    disabled={voted}
                    className={cn(
                      "mt-3 flex items-center gap-1.5 text-xs font-medium transition-colors",
                      voted
                        ? "text-primary cursor-default"
                        : "text-gray-400 dark:text-gray-500 hover:text-primary"
                    )}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    Util ({currentHelpful})
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
