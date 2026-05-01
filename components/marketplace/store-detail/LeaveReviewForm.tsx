"use client";

/**
 * LeaveReviewForm — formulario para que un cliente deje una reseña a la
 * tienda marketplace. POST a /api/marketplace/stores/{slug}/reviews.
 *
 * Sin auth: el cliente provee `reviewerName`. Si pasa un teléfono, el
 * endpoint deduplica para evitar review-bombing.
 *
 * UX:
 *   - 5 estrellas clickeables con hover preview
 *   - Validación inline: nombre min 2, comentario min 10
 *   - Toggle entre "minimizado" (botón) y "expandido" (form)
 *   - Estado de éxito + auto-refresh de la lista (vía router.refresh)
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Send, CheckCircle2, X, AlertTriangle, Loader2 } from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

interface Props {
  storeSlug: string;
  storeName: string;
}

export default function LeaveReviewForm({ storeSlug, storeName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setName("");
    setRating(0);
    setHoverRating(0);
    setComment("");
    setPhone("");
    setError(null);
    setSuccess(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError("Tu nombre debe tener al menos 2 caracteres.");
      return;
    }
    if (rating < 1 || rating > 5) {
      setError("Elegí una calificación de 1 a 5 estrellas.");
      return;
    }
    if (comment.trim().length < 10) {
      setError("Contanos un poco más — al menos 10 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/marketplace/stores/${storeSlug}/reviews`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          reviewerName: name.trim(),
          rating,
          comment: comment.trim(),
          ...(phone.trim() ? { customerPhone: phone.trim() } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Error ${res.status}`);
        return;
      }
      setSuccess(true);
      // Refrescar la lista de reseñas en el storefront
      setTimeout(() => {
        router.refresh();
        close();
      }, 1800);
    } catch (e) {
      setError(`Error de red: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 text-sm font-bold hover:opacity-90 transition-opacity"
      >
        <Star className="h-4 w-4" strokeWidth={2} aria-hidden />
        Dejar tu reseña
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white tracking-tight">
            Tu opinión sobre {storeName}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            La tienda revisará tu reseña antes de publicarla.
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      {success ? (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
          <div>
            <p className="font-bold text-emerald-900 dark:text-emerald-200">¡Gracias por tu reseña!</p>
            <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-0.5">
              La bodega la verá pronto y aparecerá en su perfil.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {/* Estrellas */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-2">
              Tu calificación
            </label>
            <div className="flex gap-1" role="radiogroup" aria-label="Calificación de 1 a 5 estrellas">
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = (hoverRating || rating) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(n)}
                    className={cn(
                      "p-1 transition-transform hover:scale-110 active:scale-95",
                      filled ? "text-amber-500" : "text-gray-300 dark:text-gray-700",
                    )}
                  >
                    <Star className={cn("h-7 w-7", filled && "fill-current")} strokeWidth={1.5} />
                  </button>
                );
              })}
              {rating > 0 && (
                <span className="ml-2 self-center text-sm font-bold text-gray-700 dark:text-gray-300">
                  {rating}/5
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="rev-name" className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1.5">
                Tu nombre
              </label>
              <input
                id="rev-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Carmen L."
                className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium focus:outline-none focus:border-gray-400 dark:focus:border-gray-500"
              />
            </div>
            <div>
              <label htmlFor="rev-phone" className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1.5">
                Teléfono <span className="opacity-60 font-normal normal-case tracking-normal">(opcional)</span>
              </label>
              <input
                id="rev-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={20}
                placeholder="+51 999 999 999"
                className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium focus:outline-none focus:border-gray-400 dark:focus:border-gray-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rev-comment" className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1.5">
              Tu experiencia
            </label>
            <textarea
              id="rev-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Contanos qué te pareció: el servicio, los productos, los tiempos…"
              className="w-full rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 resize-none"
            />
            <p className="text-[length:var(--ts-xs)] text-gray-400 dark:text-gray-500 mt-1 tabular-nums">
              {comment.length}/1000 caracteres
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 p-3 flex items-start gap-2 text-sm text-[var(--data-error)] dark:text-[var(--data-error)]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Enviando…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  Enviar reseña
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
