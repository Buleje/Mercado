"use client";

import { useState, useCallback } from "react";
import { Star, Send, Edit3, RotateCcw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AIReviewResponderProps {
  reviewText: string;
  reviewerName: string;
  rating: number;
  onRespond: (response: string) => void;
}

// ── Local response templates ───────────────────────────────────────────────────

function buildResponse(
  reviewerName: string,
  rating: number,
  reviewText: string
): string {
  const name = reviewerName.trim() || "estimado cliente";

  if (rating >= 4) {
    const positives = [
      `Gracias ${name} por tu calificacion tan positiva.`,
      `Nos alegra mucho que hayas tenido una buena experiencia.`,
      `Tu confianza nos motiva a seguir mejorando cada dia.`,
    ];
    const extras =
      rating === 5
        ? " Eres parte de la familia Buleje y siempre sera un placer atenderte."
        : " Seguiremos trabajando para darte lo mejor en cada pedido.";
    return positives.join(" ") + extras;
  }

  // rating < 4 — disculpa + compromiso de mejora
  const hasText = reviewText.trim().length > 10;
  const apology = `Hola ${name}, lamentamos mucho que tu experiencia no haya sido la mejor.`;
  const commitment =
    "Tomamos tu comentario muy en serio y lo usaremos para mejorar nuestro servicio.";
  const action = hasText
    ? "Nos pondremos en contacto contigo para resolver lo sucedido."
    : "Si deseas cuéntanos como podemos ayudarte mejor.";
  const closing =
    "Gracias por tomarte el tiempo de compartir tu opinion — es lo que nos hace crecer.";

  return `${apology} ${commitment} ${action} ${closing}`;
}

// ── Stars display ──────────────────────────────────────────────────────────────

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4",
            i < rating
              ? "fill-[var(--data-warning)] text-[var(--data-warning)]"
              : "fill-muted text-muted-foreground"
          )}
        />
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AIReviewResponder({
  reviewText,
  reviewerName,
  rating,
  onRespond,
}: AIReviewResponderProps) {
  const [draft, setDraft] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState(false);

  const handleGenerate = useCallback(() => {
    const response = buildResponse(reviewerName, rating, reviewText);
    setDraft(response);
    setEditing(true);
    setSent(false);
  }, [reviewerName, rating, reviewText]);

  const handleReset = () => {
    setDraft("");
    setEditing(false);
    setSent(false);
  };

  const handleSend = () => {
    if (!draft.trim()) return;
    onRespond(draft.trim());
    setSent(true);
    setEditing(false);
  };

  const sentimentLabel =
    rating >= 4
      ? { text: "Resena positiva", className: "text-[var(--data-success)] dark:text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30" }
      : { text: "Resena critica", className: "text-[var(--data-warning)] dark:text-[var(--data-warning)] bg-[var(--data-warning-50)] dark:bg-orange-950/20 border-[var(--data-warning)] dark:border-[var(--data-warning)]" };

  return (
    <div className="rounded-lg border border-border bg-card dark:bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground dark:text-foreground">
            {reviewerName || "Cliente anonimo"}
          </p>
          <StarDisplay rating={rating} />
        </div>
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full border",
            sentimentLabel.className
          )}
        >
          {sentimentLabel.text}
        </span>
      </div>

      {/* Review text */}
      <blockquote className="border-l-2 border-primary pl-3 text-sm text-muted-foreground dark:text-muted-foreground italic">
        {reviewText || "Sin texto en la resena."}
      </blockquote>

      {/* Draft editor */}
      {editing && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Edit3 className="h-3.5 w-3.5" />
            <span>Puedes editar la respuesta antes de enviar</span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className={cn(
              "w-full rounded-md border border-border bg-background dark:bg-background",
              "text-sm text-foreground dark:text-foreground",
              "px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50",
              "placeholder:text-muted-foreground"
            )}
          />
        </div>
      )}

      {/* Sent confirmation */}
      {sent && (
        <div className="rounded-md bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 px-3 py-2">
          <p className="text-xs text-[var(--data-success)] dark:text-[var(--data-success)] font-medium">
            Respuesta enviada correctamente.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {!editing && !sent && (
          <button
            onClick={handleGenerate}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              "bg-primary text-white hover:bg-primary-dark"
            )}
          >
            <Edit3 className="h-3.5 w-3.5" />
            Generar respuesta
          </button>
        )}

        {editing && (
          <>
            <button
              onClick={handleSend}
              disabled={!draft.trim()}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                "bg-primary text-white hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <Send className="h-3.5 w-3.5" />
              Enviar respuesta
            </button>
            <button
              onClick={handleReset}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                "border border-border text-muted-foreground hover:bg-muted dark:hover:bg-muted/50"
              )}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Cancelar
            </button>
          </>
        )}

        {sent && (
          <button
            onClick={handleReset}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              "border border-border text-muted-foreground hover:bg-muted dark:hover:bg-muted/50"
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Nueva respuesta
          </button>
        )}
      </div>
    </div>
  );
}
