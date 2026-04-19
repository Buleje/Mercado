"use client";

import { useState } from "react";
import Image from "next/image";
import { Star, ShieldCheck, ThumbsUp, User } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { MockReview } from "@/lib/mocks/product-reviews.mock";

interface ReviewCardProps {
  review: MockReview;
  onHelpful?: (reviewId: string) => void | Promise<void>;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getDate();
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${day} de ${month} ${year}`;
}

function Stars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i <= value
              ? "text-amber-500 fill-amber-500"
              : "text-gray-300 dark:text-gray-600",
          )}
        />
      ))}
    </div>
  );
}

export default function ReviewCard({ review, onHelpful }: ReviewCardProps) {
  const [voted, setVoted] = useState(false);
  const [localCount, setLocalCount] = useState(review.helpfulCount);
  const [voting, setVoting] = useState(false);

  const handleVote = async () => {
    if (voted || voting) return;
    setVoting(true);
    setVoted(true);
    setLocalCount((n) => n + 1);
    try {
      await onHelpful?.(review.id);
    } catch {
      // revert optimistic
      setVoted(false);
      setLocalCount((n) => n - 1);
    } finally {
      setVoting(false);
    }
  };

  const initials = review.userName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <article className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <header className="flex items-start gap-3">
        {review.userAvatar ? (
          <Image
            src={review.userAvatar}
            alt={review.userName}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
            {initials || <User className="h-4 w-4" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {review.userName}
            </span>
            {review.verifiedPurchase && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-2 py-0.5 text-xs font-semibold">
                <ShieldCheck className="h-3 w-3" />
                Compra verificada
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <Stars value={review.rating} />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatDate(review.createdAt)}
            </span>
          </div>
        </div>
      </header>

      <div className="mt-3">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white">{review.title}</h4>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
          {review.body}
        </p>
      </div>

      {review.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {review.photos.map((url, i) => (
            <div
              key={`${review.id}-ph-${i}`}
              className="relative h-20 w-20 shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
            >
              <Image
                src={url}
                alt={`Foto ${i + 1} de la reseña de ${review.userName}`}
                fill
                sizes="80px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <footer className="mt-4 flex items-center justify-between">
        <button
          onClick={handleVote}
          disabled={voted || voting}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
            voted
              ? "border-primary bg-primary/5 dark:bg-primary/10 text-primary cursor-default"
              : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-900 dark:hover:text-white",
          )}
        >
          <ThumbsUp className={cn("h-3.5 w-3.5", voted && "fill-current")} />
          Útil ({localCount})
        </button>
      </footer>
    </article>
  );
}
