"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Star, ShieldCheck, ThumbsUp, User, X, ChevronLeft, ChevronRight, ZoomIn } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { MockReview } from "@/lib/mocks/product-reviews.mock";

// ── Lightbox ──────────────────────────────────────────────────────────────────

interface LightboxProps {
  photos: string[];
  initialIndex: number;
  reviewerName: string;
  onClose: () => void;
}

function PhotoLightbox({ photos, initialIndex, reviewerName, onClose }: LightboxProps) {
  const [current, setCurrent] = useState(initialIndex);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setCurrent((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setCurrent((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [photos.length, onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto de reseña de ${reviewerName}`}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cerrar */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar galería"
          className="absolute -top-3 -right-3 z-10 h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/25 flex items-center justify-center transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Imagen principal */}
        <div className="relative w-full max-h-[70vh] rounded-2xl overflow-hidden bg-black">
          <Image
            src={photos[current]!}
            alt={`Foto ${current + 1} de ${photos.length} — reseña de ${reviewerName}`}
            width={800}
            height={800}
            className="w-full h-full object-contain max-h-[70vh]"
            priority
          />
        </div>

        {/* Navegación y contador */}
        {photos.length > 1 && (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setCurrent((i) => Math.max(0, i - 1))}
              disabled={current === 0}
              aria-label="Foto anterior"
              className="h-10 w-10 rounded-full bg-white/10 text-white disabled:opacity-30 hover:bg-white/25 flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-white tabular-nums">
              {current + 1} / {photos.length}
            </span>
            <button
              type="button"
              onClick={() => setCurrent((i) => Math.min(photos.length - 1, i + 1))}
              disabled={current === photos.length - 1}
              aria-label="Foto siguiente"
              className="h-10 w-10 rounded-full bg-white/10 text-white disabled:opacity-30 hover:bg-white/25 flex items-center justify-center transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Miniaturas strip */}
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto max-w-full pb-1">
            {photos.map((url, i) => (
              <button
                key={`lb-thumb-${i}`}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Ir a foto ${i + 1}`}
                className={cn(
                  "relative h-14 w-14 shrink-0 rounded-lg overflow-hidden border-2 transition-all",
                  current === i
                    ? "border-white scale-105"
                    : "border-white/30 opacity-60 hover:opacity-100 hover:border-white/60",
                )}
              >
                <Image
                  src={url}
                  alt={`Miniatura ${i + 1}`}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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
              ? "text-[var(--data-warning-500)] fill-[var(--data-warning-500)]"
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
    <article className="border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
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
          <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] flex items-center justify-center text-sm font-semibold">
            {initials || <User className="h-4 w-4" />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {review.userName}
            </span>
            {review.verifiedPurchase && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-[var(--rule-base)] text-[var(--data-success-600)] px-2 py-0.5 text-xs font-medium">
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
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{review.title}</h4>
        <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
          {review.body}
        </p>
      </div>

      {review.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {review.photos.map((url, i) => (
            <button
              key={`${review.id}-ph-${i}`}
              type="button"
              onClick={() => setLightboxIndex(i)}
              aria-label={`Ampliar foto ${i + 1} de ${review.photos.length} de la reseña de ${review.userName}`}
              className="group relative h-20 w-20 shrink-0 rounded-sm overflow-hidden bg-[var(--surface-sunken)] dark:bg-gray-800 border border-[var(--rule-soft)] hover:border-[var(--accent)]/50 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 focus-visible:outline-none"
            >
              <Image
                src={url}
                alt={`Foto ${i + 1} de la reseña de ${review.userName}`}
                fill
                sizes="80px"
                className="object-cover group-hover:scale-105 transition-transform duration-200"
              />
              {/* Overlay hint: zoom icon */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={review.photos}
          initialIndex={lightboxIndex}
          reviewerName={review.userName}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      <footer className="mt-4 flex items-center justify-between">
        <button
          onClick={handleVote}
          disabled={voted || voting}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors",
            voted
              ? "border-[var(--accent)] text-[var(--accent)] cursor-default"
              : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
          )}
        >
          <ThumbsUp className={cn("h-3.5 w-3.5", voted && "fill-current")} />
          Útil ({localCount})
        </button>
      </footer>
    </article>
  );
}
