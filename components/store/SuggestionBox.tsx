"use client";

 

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { MessageSquare, Star, CheckCircle2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = "attention" | "products" | "delivery" | "prices" | "other";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "attention", label: "Atencion" },
  { value: "products", label: "Productos" },
  { value: "delivery", label: "Delivery" },
  { value: "prices", label: "Precios" },
  { value: "other", label: "Otro" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "suggestion_box_local";

function saveLocal(entry: {
  message: string;
  rating: number;
  category: Category;
}) {
  try {
    const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    prev.unshift({ ...entry, date: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prev.slice(0, 50)));
  } catch {
    //
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SuggestionBox() {
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [category, setCategory] = useState<Category>("other");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!message.trim() || rating === 0) return;
    setSubmitting(true);
    setError(null);

    const payload = { message: message.trim(), rating, category };

    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("API error");
    } catch {
      // Fallback to localStorage
      saveLocal(payload);
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }, [message, rating, category]);

  const reset = useCallback(() => {
    setMessage("");
    setRating(0);
    setCategory("other");
    setSubmitted(false);
    setError(null);
  }, []);

  if (submitted) {
    return (
      <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] p-8 text-center shadow-sm">
        <div className="flex justify-center mb-4">
          <div className="p-4 rounded-full bg-[var(--accent)]/10">
            <CheckCircle2 className="w-10 h-10 text-[var(--accent)]" />
          </div>
        </div>
        <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          Gracias por tu sugerencia
        </h3>
        <p className="text-sm text-[var(--text-tertiary)] mb-6">
          Tu opinion es muy importante para nosotros.
          La usaremos para mejorar el servicio de Buleje.
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] dark:text-[#2dd4bf] font-semibold text-sm hover:bg-[var(--accent)]/20 transition-colors"
        >
          Enviar otra sugerencia
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface-raised)] rounded-2xl border border-[var(--rule-base)] overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-[var(--rule-base)] flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[var(--accent)]/10">
          <MessageSquare className="w-5 h-5 text-[var(--accent)]" />
        </div>
        <div>
          <h2 className="font-bold text-[var(--text-primary)]">
            Caja de sugerencias
          </h2>
          <p className="text-xs text-[var(--text-tertiary)]">
            Anonimo — Tu opinion nos ayuda a mejorar
          </p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Rating */}
        <div>
          <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
            Calificacion general
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                onClick={() => setRating(star)}
                aria-label={`${star} estrella${star !== 1 ? "s" : ""}`}
                className="focus:outline-none"
              >
                <Star
                  className={cn(
                    "w-8 h-8 transition-colors",
                    (hoveredStar || rating) >= star
                      ? "fill-[#f97316] text-[#f97316]"
                      : "text-gray-300 dark:text-gray-600"
                  )}
                />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-sm text-[var(--text-tertiary)] self-center">
                {["", "Muy malo", "Malo", "Regular", "Bueno", "Excelente"][rating]}
              </span>
            )}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
            Categoria
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                  category === cat.value
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
            Tu sugerencia o comentario
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Que podemos mejorar? Que te gusto? Que necesitas?"
            rows={4}
            maxLength={500}
            className="w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-[var(--accent)] resize-none"
          />
          <p className="text-xs text-gray-400 text-right mt-1">
            {message.length}/500
          </p>
        </div>

        {error && (
          <p className="text-sm text-[var(--data-error-500)]">{error}</p>
        )}

        <button
          onClick={submit}
          disabled={!message.trim() || rating === 0 || submitting}
          className="w-full py-3.5 rounded-xl bg-[var(--accent)] text-white font-bold text-sm disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <MessageSquare className="w-4 h-4" />
              Enviar sugerencia
            </>
          )}
        </button>

        <p className="text-xs text-center text-gray-400 dark:text-gray-600">
          Tu comentario es completamente anonimo
        </p>
      </div>
    </div>
  );
}
