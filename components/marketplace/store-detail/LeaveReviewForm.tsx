"use client";

/**
 * LeaveReviewForm — botón "Escribir opinión" + modal de reseña.
 *
 * Rediseño 2026-06-06 (Brandon): modal ejecutivo en vez de form inline.
 *   - Cero fricción: usa la identidad del cliente logueado (nombre + teléfono
 *     de la sesión). No se pide escribir nombre ni teléfono.
 *   - Frases predefinidas (chips) según la calificación elegida, editables.
 *   - Vincula automáticamente la compra entregada (anti review-bombing): el
 *     endpoint /reviewable-orders devuelve los pedidos elegibles del cliente.
 *
 * Estados del modal:
 *   loading → no logueado → sin compras elegibles → formulario → éxito.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Star, Send, CheckCircle2, AlertTriangle, Loader2, LogIn, ShoppingBag, Sparkles,
} from "@buleje/design-system/icons";
import { Modal } from "@/components/Modal";
import { useCustomer } from "@/contexts/customer-context";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

interface Props {
  storeSlug: string;
  storeName: string;
}

interface ReviewableOrder {
  id: string;
  createdAt: string;
  total: number;
  itemsCount: number;
}

interface ReviewableResponse {
  loggedIn: boolean;
  phone: string | null;
  name?: string | null;
  orders: ReviewableOrder[];
}

// Frases sugeridas por sentimiento (tuteo peruano). El cliente toca para
// agregarlas; quedan editables en el textarea.
const PHRASES: Record<"positive" | "neutral" | "negative", string[]> = {
  positive: [
    "Todo llegó rápido y bien empacado.",
    "Excelente atención, muy recomendado.",
    "Productos frescos y de buena calidad.",
    "Buenos precios y delivery puntual.",
    "Volveré a comprar sin dudarlo.",
  ],
  neutral: [
    "Cumple, aunque hay detalles por mejorar.",
    "El pedido llegó bien, pero tardó un poco.",
    "Buena variedad, atención correcta.",
  ],
  negative: [
    "El pedido tardó más de lo esperado.",
    "Faltó un producto de mi pedido.",
    "La atención puede mejorar.",
  ],
};

function phrasesFor(rating: number): string[] {
  if (rating >= 4) return PHRASES.positive;
  if (rating === 3) return PHRASES.neutral;
  if (rating >= 1) return PHRASES.negative;
  return PHRASES.positive;
}

function maskPhone(p: string | null): string | null {
  if (!p) return null;
  return p.length > 4 ? `··· ${p.slice(-4)}` : p;
}

function fmtOrder(o: ReviewableOrder): string {
  const date = new Date(o.createdAt).toLocaleDateString("es-PE", {
    day: "numeric", month: "short",
  });
  return `Pedido del ${date} · ${o.itemsCount} ítem${o.itemsCount !== 1 ? "s" : ""} · S/ ${o.total.toFixed(2)}`;
}

export default function LeaveReviewForm({ storeSlug, storeName }: Props) {
  const router = useRouter();
  const { openModal } = useCustomer();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReviewableResponse | null>(null);

  const [orderId, setOrderId] = useState<string>("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetForm = useCallback(() => {
    setOrderId("");
    setRating(0);
    setHoverRating(0);
    setComment("");
    setError(null);
    setSuccess(false);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    resetForm();
  }, [resetForm]);

  // Al abrir: cargar identidad + compras elegibles del cliente logueado.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setData(null);
    fetch(`/api/marketplace/stores/${storeSlug}/reviewable-orders`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((json: ReviewableResponse) => {
        if (!alive) return;
        setData(json);
        if (json.orders?.length) setOrderId(json.orders[0].id);
      })
      .catch(() => {
        if (alive) setData({ loggedIn: false, phone: null, orders: [] });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, storeSlug]);

  const togglePhrase = (p: string) => {
    setComment((prev) => {
      if (prev.includes(p)) {
        return prev.replace(p, "").replace(/\s{2,}/g, " ").trim();
      }
      return (prev.trim() ? prev.trim() + " " : "") + p;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!orderId) {
      setError("No encontramos una compra para vincular tu reseña.");
      return;
    }
    if (rating < 1) {
      setError("Elige una calificación de 1 a 5 estrellas.");
      return;
    }
    if (comment.trim().length < 10) {
      setError("Cuéntanos un poco más — al menos 10 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/marketplace/stores/${storeSlug}/reviews`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          reviewerName: data?.name?.trim() || "Cliente",
          rating,
          comment: comment.trim(),
          customerPhone: data?.phone ?? "",
          orderId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Error ${res.status}`);
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        router.refresh();
        close();
      }, 1900);
    } catch (err) {
      setError(`Error de red: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const activeRating = hoverRating || rating;

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-extrabold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
      >
        <Star className="h-4 w-4 fill-current" strokeWidth={0} aria-hidden />
        Escribir tu opinión
      </button>

      <Modal isOpen={open} onClose={close} size="md" closeOnBackdropClick={!submitting}>
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="mb-5 pr-8">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Tu opinión
          </p>
          <h2 className="mt-0.5 text-xl font-black tracking-tight text-[var(--text-primary)] sm:text-2xl">
            {storeName}
          </h2>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-[var(--text-tertiary)]">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <p className="text-sm">Cargando tus datos…</p>
          </div>
        ) : success ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-10 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <CheckCircle2 className="h-7 w-7" strokeWidth={2} aria-hidden />
            </span>
            <p className="text-lg font-black text-[var(--text-primary)]">¡Gracias por tu opinión!</p>
            <p className="max-w-xs text-sm text-[var(--text-secondary)]">
              La tienda la verá pronto y aparecerá en su perfil para ayudar a otros vecinos.
            </p>
          </div>
        ) : !data?.loggedIn ? (
          /* No logueado */
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-10 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <LogIn className="h-7 w-7" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <p className="text-base font-black text-[var(--text-primary)]">Inicia sesión para opinar</p>
              <p className="mt-1 max-w-xs text-sm text-[var(--text-secondary)]">
                Usamos tu cuenta para que no tengas que escribir tus datos cada vez.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { close(); openModal("profile"); }}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-extrabold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            >
              <LogIn className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              Iniciar sesión
            </button>
          </div>
        ) : data.orders.length === 0 ? (
          /* Logueado pero sin compra elegible */
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-10 text-center">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
              <ShoppingBag className="h-7 w-7" strokeWidth={2} aria-hidden />
            </span>
            <div>
              <p className="text-base font-black text-[var(--text-primary)]">Opina sobre tu próxima compra</p>
              <p className="mt-1 max-w-xs text-sm text-[var(--text-secondary)]">
                Las opiniones son de clientes con un pedido entregado. Haz tu primer
                pedido en <strong className="font-bold text-[var(--text-primary)]">{storeName}</strong> y
                podrás reseñarlo aquí.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-extrabold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Ver la carta
            </button>
          </div>
        ) : (
          /* Formulario */
          <form onSubmit={submit} className="space-y-5">
            {/* Identidad logueada (read-only) */}
            <div className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3.5 py-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-black text-white">
                {(data.name?.trim()?.[0] ?? "C").toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                  {data.name?.trim() || "Cliente"}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Opinas con tu cuenta{maskPhone(data.phone) ? ` · ${maskPhone(data.phone)}` : ""}
                </p>
              </div>
            </div>

            {/* Selector de compra (solo si hay más de una) */}
            {data.orders.length > 1 && (
              <div>
                <label htmlFor="rev-order" className="mb-1.5 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  Sobre qué pedido
                </label>
                <select
                  id="rev-order"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="h-11 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                >
                  {data.orders.map((o) => (
                    <option key={o.id} value={o.id}>{fmtOrder(o)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Estrellas */}
            <div>
              <p className="mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Tu calificación
              </p>
              <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Calificación de 1 a 5 estrellas">
                {[1, 2, 3, 4, 5].map((n) => {
                  const filled = activeRating >= n;
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
                      className="p-0.5 transition-transform hover:scale-110 active:scale-95"
                    >
                      <Star
                        className={cn(
                          "h-8 w-8",
                          filled
                            ? "fill-[var(--data-warning-500)] text-[var(--data-warning-500)]"
                            : "fill-[var(--surface-sunken)] text-[var(--rule-base)]",
                        )}
                        strokeWidth={filled ? 0 : 1.5}
                      />
                    </button>
                  );
                })}
                {rating > 0 && (
                  <span className="ml-2 self-center text-sm font-extrabold tabular-nums text-[var(--text-secondary)]">
                    {rating}/5
                  </span>
                )}
              </div>
            </div>

            {/* Frases sugeridas (chips) */}
            {rating > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
                  Frases sugeridas — toca para agregar
                </p>
                <div className="flex flex-wrap gap-2">
                  {phrasesFor(rating).map((p) => {
                    const active = comment.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePhrase(p)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                          active
                            ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Comentario */}
            <div>
              <label htmlFor="rev-comment" className="mb-1.5 block text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Tu experiencia
              </label>
              <textarea
                id="rev-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Toca una frase de arriba o escribe con tus palabras…"
                className="w-full resize-none rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-3 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
              />
              <p className="mt-1 text-right text-[length:var(--ts-xs)] tabular-nums text-[var(--text-tertiary)]">
                {comment.length}/1000
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 p-3 text-sm text-[var(--data-error-600)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="rounded-full px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-extrabold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Enviando…</>
                ) : (
                  <><Send className="h-4 w-4" strokeWidth={2.25} aria-hidden /> Publicar opinión</>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
