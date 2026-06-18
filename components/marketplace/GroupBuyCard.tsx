"use client";

/**
 * GroupBuyCard — La Junta del Barrio (compra colaborativa vecinal).
 *
 * Rediseño 2026-06-18 v2 (premium minimalista + en vivo): sin gradiente; el
 * acento de marca queda en una barra superior cuadrada. Jerarquía narrativa:
 * premio → vecinos (avatares + progreso) → urgencia (timer en cajas) → acción.
 * Sub-piezas en ./junta/* y lógica en useGroupBuyCard; aquí solo composición.
 */

import {
  MessageCircle,
  Check,
  Copy,
  MapPin,
  ShoppingBag,
  Gift,
  Share2,
  ChevronDown,
} from "@buleje/design-system/icons";
import { JUNTA_COUPON_PERCENT } from "@/lib/junta/constants";
import { useGroupBuyCard } from "./hooks/useGroupBuyCard";
import { CountdownTimer } from "./junta/CountdownTimer";
import { MemberStack } from "./junta/MemberStack";

type JuntaStatus = "OPEN" | "COMPLETE" | "EXPIRED";

interface Props {
  code: string;
  zoneLabel: string;
  productLabel?: string;
  count: number;
  target: number;
  status: JuntaStatus;
  /** ISO de cierre de la junta — para la cuenta regresiva en vivo. */
  windowEnd?: string;
  /** Cupón emitido al completar la junta (Fase A2). */
  couponCode?: string;
  /** Pedidos ya hechos dentro de la junta (Fase A4). */
  orderCount?: number;
}

export default function GroupBuyCard({
  code,
  zoneLabel,
  productLabel,
  count: initialCount,
  target,
  status: initialStatus,
  windowEnd,
  couponCode,
  orderCount = 0,
}: Props) {
  const {
    count,
    remaining,
    progress,
    isComplete,
    isExpired,
    countdownLabel,
    countdownTimer,
    bumped,
    joining,
    joined,
    error,
    copied,
    couponCopied,
    handleShopForJunta,
    handleCopyCoupon,
    handleWhatsApp,
    handleNativeShare,
    handleJoin,
  } = useGroupBuyCard({
    code,
    productLabel,
    initialCount,
    target,
    initialStatus,
    windowEnd,
    couponCode,
  });

  return (
    <section
      aria-label="La Junta del Barrio"
      className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      {/* Acento de marca cuadrado (sin gradiente) */}
      <div className="h-1 bg-[var(--accent)]" aria-hidden />

      {/* ── Header plano ── */}
      <div className="border-b border-[var(--rule-soft)] px-5 py-5 sm:px-6">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
          La Junta del Barrio
        </p>
        <h2 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-[var(--text-primary)]">
          {target} vecinos, una sola entrega
        </h2>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
          <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden />
          {zoneLabel}
        </p>
      </div>

      {/* ── Cuerpo ── */}
      <div className="space-y-5 px-5 py-5 sm:px-6">
        {productLabel && (
          <p className="text-base leading-relaxed text-[var(--text-secondary)]">
            Junta a {target - 1} vecinos de tu zona para{" "}
            <span className="font-bold text-[var(--text-primary)]">
              {productLabel}
            </span>
            . Al completar, coordinan una sola entrega.
          </p>
        )}

        {/* Premio (cuadrado, acento a la izquierda) */}
        <div className="flex items-center gap-3 border-l-4 border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3">
          <Gift
            className="h-5 w-5 shrink-0 text-[var(--accent)]"
            strokeWidth={2}
            aria-hidden
          />
          <p className="text-base font-bold text-[var(--text-primary)]">
            Al completar, todos llevan{" "}
            <span className="text-[var(--accent)]">
              {JUNTA_COUPON_PERCENT}% de descuento
            </span>
          </p>
        </div>

        {/* Vecinos: avatares + progreso */}
        <MemberStack
          count={count}
          target={target}
          remaining={remaining}
          progress={progress}
          isComplete={isComplete}
          isExpired={isExpired}
          bumped={bumped}
        />

        {orderCount > 0 && (
          <p className="text-sm font-semibold text-[var(--text-tertiary)]">
            {orderCount} {orderCount === 1 ? "pedido ya hecho" : "pedidos ya hechos"}{" "}
            en esta junta
          </p>
        )}

        {/* Urgencia: cuenta regresiva en cajas */}
        {countdownTimer && (
          <CountdownTimer
            parts={countdownTimer}
            ariaLabel={countdownLabel ?? undefined}
          />
        )}

        {/* Cupón (junta completa) — cuadrado */}
        {isComplete && couponCode && (
          <div className="border-l-4 border-[var(--accent)] bg-[var(--accent-soft)] p-4">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              Tu cupón de la junta · {JUNTA_COUPON_PERCENT}% off
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-mono text-xl font-extrabold tracking-wide text-[var(--text-primary)]">
                {couponCode}
              </span>
              <button
                type="button"
                onClick={handleCopyCoupon}
                className="inline-flex items-center gap-1.5 border-2 border-[var(--accent)] px-3.5 py-2 text-sm font-bold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white active:scale-95"
              >
                {couponCopied ? (
                  <>
                    <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    Copiar
                  </>
                )}
              </button>
            </div>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              Aplícalo en tu próximo pedido. Cada vecino de la junta puede usarlo.
            </p>
          </div>
        )}

        {/* ── CTAs con jerarquía ── */}
        <div className="space-y-2.5">
          {!isExpired && (
            <button
              type="button"
              onClick={handleShopForJunta}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-4 text-base font-extrabold text-white shadow-[0_4px_14px_rgba(0,160,160,0.35)] transition hover:opacity-90 active:scale-[0.98]"
            >
              <ShoppingBag className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              Comprar para esta junta
            </button>
          )}

          {!isExpired && !isComplete && (
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining || joined}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[var(--accent)] py-3 text-base font-bold text-[var(--accent)] transition hover:bg-[var(--accent-soft)] disabled:opacity-60 active:scale-[0.98]"
            >
              {joined ? (
                <>
                  <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                  Ya estás en la junta
                </>
              ) : joining ? (
                "Uniéndote…"
              ) : (
                "Súmate (sin comprar todavía)"
              )}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleWhatsApp}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-sm font-bold text-white transition hover:bg-[#1ea34d] active:scale-[0.98]"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
              WhatsApp
            </button>
            <button
              type="button"
              onClick={handleNativeShare}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--rule-base)] py-3 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] active:scale-[0.98]"
            >
              {copied ? (
                <>
                  <Check
                    className="h-4 w-4 text-[var(--accent)]"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  Copiado
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Compartir
                </>
              )}
            </button>
          </div>

          {error && (
            <p
              className="text-sm font-semibold text-[var(--data-error-600)]"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      </div>

      {/* ── Cómo funciona ── */}
      <details className="group border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 hover:bg-[var(--surface-raised)] sm:px-6">
          <span className="text-sm font-bold text-[var(--text-secondary)]">
            ¿Cómo funciona la junta?
          </span>
          <ChevronDown
            className="h-4 w-4 text-[var(--text-tertiary)] transition-transform group-open:rotate-180"
            strokeWidth={2}
            aria-hidden
          />
        </summary>
        <ol className="space-y-2 px-5 pb-4 text-base leading-relaxed text-[var(--text-secondary)] sm:px-6">
          <li>1. Comparte el link con vecinos de tu cuadra o barrio.</li>
          <li>2. Cada uno se suma o compra para la junta desde el link.</li>
          <li>3. Cuando son {target}, la junta se completa.</li>
          <li>
            4. Todos reciben {JUNTA_COUPON_PERCENT}% off y coordinan una sola
            entrega.
          </li>
        </ol>
      </details>
    </section>
  );
}
