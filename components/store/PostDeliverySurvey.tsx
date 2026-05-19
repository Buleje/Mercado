"use client";

import { useState, useCallback } from "react";
import { Star, Send, Loader2, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PostDeliverySurveyProps {
  orderId: string;
  onSubmit: (rating: number, comment: string) => void;
}

type Step = "idle" | "submitting" | "done" | "error";

// ── Star rating ────────────────────────────────────────────────────────────────

const STAR_LABELS = ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"];

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <div className="flex gap-1.5" onMouseLeave={() => setHovered(0)}>
      {Array.from({ length: 5 }, (_, i) => {
        const star = i + 1;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            aria-label={STAR_LABELS[i]}
            className={cn(
              "transition-transform duration-[var(--dur-fast)] disabled:cursor-default",
              !disabled && "hover:scale-110 focus:outline-none"
            )}
          >
            <Star
              className={cn(
                "h-8 w-8 transition-colors duration-[var(--dur-fast)]",
                star <= active
                  ? "fill-yellow-400 text-yellow-400"
                  : "fill-muted text-[var(--text-secondary)]"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PostDeliverySurvey({
  orderId,
  onSubmit,
}: PostDeliverySurveyProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const canSubmit = rating > 0 && step === "idle";

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setStep("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          orderId,
          rating,
          comment: comment.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Error al enviar");
      }

      onSubmit(rating, comment.trim());
      setStep("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "No se pudo enviar la resena.");
      setStep("error");
    }
  }, [canSubmit, orderId, rating, comment, onSubmit]);

  // ── Done state ─────────────────────────────────────────────────────────────

  if (step === "done") {
    return (
      <div className="rounded-xl border border-[var(--accent)] bg-[var(--surface-raised)] dark:bg-[var(--surface-raised)] p-6 text-center space-y-3">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)]">
            <Check className="h-6 w-6 text-white" />
          </div>
        </div>
        <div>
          <p className="text-base font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            Gracias por tu opinion
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Tu resena nos ayuda a mejorar cada dia. Hasta la próxima en Buleje.
          </p>
        </div>
        <div className="flex justify-center">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={cn(
                  "h-5 w-5",
                  i < rating
                    ? "fill-yellow-400 text-yellow-400"
                    : "fill-muted text-[var(--text-secondary)]"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Survey form ────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-border bg-[var(--surface-raised)] dark:bg-[var(--surface-raised)] p-4 space-y-4">
      {/* Header */}
      <div>
        <p className="text-base font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          Como fue tu experiencia?
        </p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Pedido #{orderId} — Tu opinion importa mucho.
        </p>
      </div>

      {/* Stars */}
      <div className="space-y-2">
        <StarRating
          value={rating}
          onChange={setRating}
          disabled={step === "submitting"}
        />
        {rating > 0 && (
          <p className="text-xs text-[var(--accent)] font-medium">
            {STAR_LABELS[rating - 1]}
          </p>
        )}
      </div>

      {/* Comment */}
      <div className="space-y-1.5">
        <label className="text-xs text-[var(--text-secondary)]">
          Comentario (opcional)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={step === "submitting"}
          placeholder="Cuéntanos como fue el delivery, el producto, el empaque..."
          rows={3}
          className={cn(
            "w-full rounded-md border border-border bg-background dark:bg-background",
            "text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]",
            "px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50",
            "disabled:opacity-50"
          )}
        />
      </div>

      {/* Error */}
      {step === "error" && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 px-3 py-2">
          <p className="text-xs text-[var(--data-error-700)] dark:text-red-400">
            {errorMsg} Intentalo de nuevo.
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
          "bg-[var(--accent-600,var(--accent))] text-white hover:bg-[var(--accent-dark)]",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {step === "submitting" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Enviar resena
          </>
        )}
      </button>
    </div>
  );
}
