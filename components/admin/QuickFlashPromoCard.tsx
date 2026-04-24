"use client";

/**
 * QuickFlashPromoCard — Card minimal para que el bodeguero lance una
 * promo flash en <10 segundos sin abrir formulario largo.
 *
 * Flujo:
 *   1. Tap % descuento (10/15/20/25/30)
 *   2. Tap duración (2h, 6h, hoy, 24h)
 *   3. Tap "Lanzar" → promo creada + mensaje WhatsApp a todos los clientes
 *
 * Sin imagen, sin condiciones complejas, sin target segmentado. Para eso
 * existe PromotionsTab. Esto es el "Viernes 20% OFF" impulso de un clic.
 *
 * onLaunch recibe { discountPercent, durationHours, endsAt } — el admin
 * puede conectarlo al endpoint real /api/promotions/quick cuando quiera.
 */

import { useState, useCallback } from "react";
import { Zap, Clock, Check, Send, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  onLaunch?: (payload: {
    discountPercent: number;
    durationHours: number;
    endsAt: string;
  }) => Promise<void> | void;
  /** Mensaje pre-compuesto editable (opcional). */
  defaultMessage?: string;
}

const DISCOUNT_OPTIONS = [10, 15, 20, 25, 30] as const;

const DURATION_OPTIONS = [
  { hours: 2, label: "2 horas", sub: "Urgente" },
  { hours: 6, label: "6 horas", sub: "Medio día" },
  { hours: 12, label: "Hasta hoy", sub: "Fin del día" },
  { hours: 24, label: "24 horas", sub: "Todo un día" },
] as const;

export default function QuickFlashPromoCard({ onLaunch, defaultMessage }: Props) {
  const [discount, setDiscount] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "launching" | "launched">("idle");
  const [error, setError] = useState<string | null>(null);

  const ready = discount !== null && duration !== null;

  const handleLaunch = useCallback(async () => {
    if (!ready || !discount || !duration) return;
    setStatus("launching");
    setError(null);
    try {
      const endsAt = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();
      await onLaunch?.({
        discountPercent: discount,
        durationHours: duration,
        endsAt,
      });
      setStatus("launched");
      setTimeout(() => {
        setStatus("idle");
        setDiscount(null);
        setDuration(null);
      }, 2500);
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Error lanzando promo");
    }
  }, [ready, discount, duration, onLaunch]);

  return (
    <section
      aria-label="Promocion flash rapida"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 sm:p-6 space-y-5"
    >
      {/* Header editorial */}
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Zap className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="flex-1">
          <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            Promoción flash
          </h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            Lanzá una promo en 10 segundos. Tus clientes la ven ya.
          </p>
        </div>
      </div>

      {status === "launched" ? (
        /* Estado success */
        <div className="rounded-xl border border-[var(--data-success,_#00b66a)]/40 bg-[var(--data-success,_#00b66a)]/10 p-5 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--data-success,_#00b66a)] text-white">
            <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
          </span>
          <p className="mt-3 text-sm font-extrabold text-[var(--text-primary)]">
            ¡Promo lanzada!
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            {discount}% OFF por {duration} h — ya enviamos aviso a tus clientes
          </p>
        </div>
      ) : (
        <>
          {/* Paso 1 — descuento */}
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              1. Descuento
            </p>
            <div className="flex gap-2 flex-wrap">
              {DISCOUNT_OPTIONS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setDiscount(pct)}
                  aria-pressed={discount === pct}
                  className={cn(
                    "flex-1 min-w-[64px] rounded-xl border px-3 py-3 text-base font-extrabold tabular-nums transition-all active:scale-[0.98]",
                    discount === pct
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40",
                  )}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Paso 2 — duracion */}
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              2. Duración
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.hours}
                  type="button"
                  onClick={() => setDuration(opt.hours)}
                  aria-pressed={duration === opt.hours}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left transition-all active:scale-[0.98]",
                    duration === opt.hours
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--rule-soft)] bg-[var(--surface-sunken)] hover:border-[var(--accent)]/40",
                  )}
                >
                  <p
                    className={cn(
                      "text-sm font-extrabold",
                      duration === opt.hours
                        ? "text-[var(--accent)]"
                        : "text-[var(--text-primary)]",
                    )}
                  >
                    {opt.label}
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                    {opt.sub}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Preview del mensaje */}
          {ready && (
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                Aviso a tus clientes
              </p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {defaultMessage ??
                  `Flash deal: ${discount}% OFF en toda la tienda por ${duration} h. Pedí ahora antes que termine.`}
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-[var(--data-error,_#e11d48)]/10 text-[var(--data-error,_#e11d48)] px-3 py-2 text-xs font-medium">
              {error}
            </p>
          )}

          {/* CTA lanzar */}
          <button
            type="button"
            onClick={handleLaunch}
            disabled={!ready || status === "launching"}
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 rounded-full py-3.5 text-base font-bold transition-all active:scale-[0.98]",
              ready && status !== "launching"
                ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:bg-[var(--accent)]"
                : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
            )}
          >
            {status === "launching" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />
                Lanzando…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" strokeWidth={2} aria-hidden />
                Lanzar promo
              </>
            )}
          </button>
        </>
      )}
    </section>
  );
}
