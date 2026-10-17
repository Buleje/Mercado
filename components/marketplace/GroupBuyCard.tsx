"use client";

/**
 * GroupBuyCard — panel de acción de La Junta del Barrio (compra colaborativa).
 *
 * Rediseño 2026-06-18 v3 (rectas + minimalista + desktop): bordes rectos (sin
 * radio), plano (sin sombras ni gradiente), acento de marca como hairline. Es el
 * panel derecho del layout 2-col; la narrativa (cómo funciona, confianza) vive
 * en la página. Sub-piezas en ./junta/* y lógica en useGroupBuyCard.
 */

import {
  MessageCircle,
  Check,
  Copy,
  MapPin,
  ShoppingBag,
  Gift,
  Share2,
  RotateCcw,
  Users,
} from "@buleje/design-system/icons";
import { JUNTA_COUPON_PERCENT } from "@/lib/junta/constants";
import { useGroupBuyCard } from "./hooks/useGroupBuyCard";
import { CountdownTimer } from "./junta/CountdownTimer";
import { MemberStack } from "./junta/MemberStack";
import { GuestJoinForm } from "./junta/GuestJoinForm";
import { JuntaQR } from "./junta/JuntaQR";

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
  /** ISO del último vecino que se sumó — prueba social en vivo. */
  lastJoinedAt?: string;
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
  lastJoinedAt,
}: Props) {
  const {
    count,
    remaining,
    progress,
    isComplete,
    isExpired,
    almostThere,
    countdownLabel,
    countdownTimer,
    bumped,
    joining,
    joined,
    error,
    copied,
    couponCopied,
    needsPhone,
    guestPhone,
    setGuestPhone,
    lastJoinedLabel,
    pageUrl,
    handleShopForJunta,
    handleStartNew,
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
    initialLastJoinedAt: lastJoinedAt,
  });

  return (
    <section
      aria-label="La Junta del Barrio"
      className="border border-[var(--rule-base)] bg-[var(--surface-raised)]"
    >
      {/* Acento de marca recto (sin gradiente) */}
      <div className="h-1 bg-[var(--accent)]" aria-hidden />

      {/* ── Header ── */}
      <div className="border-b border-[var(--rule-soft)] px-6 py-5">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
          La Junta del Barrio
        </p>
        <h2 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-[var(--text-primary)]">
          {target} vecinos, una entrega
        </h2>
        <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)]">
          <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden />
          {zoneLabel}
        </p>
      </div>

      {/* ── Cuerpo ── */}
      <div className="space-y-5 px-6 py-5">
        {/* Premio (recto, acento a la izquierda) — oculto si venció */}
        {!isExpired && (
          <div className="flex items-center gap-3 border-l-4 border-[var(--accent)] bg-primary/10 px-4 py-3">
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
        )}

        {/* Vecinos: fichas + progreso */}
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

        {/* Prueba social en vivo: el último vecino que se sumó */}
        {!isExpired && lastJoinedLabel && (
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping bg-[var(--accent)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 bg-[var(--accent)]" />
            </span>
            Un vecino se sumó {lastJoinedLabel}
          </p>
        )}

        {/* Urgencia máxima: solo falta 1 vecino */}
        {almostThere && (
          <div className="flex items-center gap-2.5 bg-[var(--accent)] px-4 py-3 text-white">
            <Users className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
            <p className="text-sm font-bold leading-snug">
              ¡Solo falta 1 vecino! Comparte y cierra la junta hoy.
            </p>
          </div>
        )}

        {/* Urgencia: cuenta regresiva en cajas */}
        {countdownTimer && (
          <CountdownTimer
            parts={countdownTimer}
            ariaLabel={countdownLabel ?? undefined}
          />
        )}

        {/* Cupón (junta completa) — recto */}
        {isComplete && couponCode && (
          <div className="border-l-4 border-[var(--accent)] bg-primary/10 p-4">
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

        {/* ── Acciones (rectas, planas) ── */}
        <div className="space-y-2.5">
          {isExpired ? (
            <button
              type="button"
              onClick={handleStartNew}
              className="inline-flex w-full items-center justify-center gap-2 bg-[var(--accent)] py-4 text-base font-extrabold text-white transition hover:opacity-90 active:scale-[0.99]"
            >
              <RotateCcw className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              Empezar una junta nueva
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleShopForJunta}
                className="inline-flex w-full items-center justify-center gap-2 bg-[var(--accent)] py-4 text-base font-extrabold text-white transition hover:opacity-90 active:scale-[0.99]"
              >
                <ShoppingBag className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                Comprar para esta junta
              </button>

              {!isComplete &&
                (needsPhone && !joined ? (
                  <GuestJoinForm
                    phone={guestPhone}
                    onPhoneChange={setGuestPhone}
                    onSubmit={handleJoin}
                    joining={joining}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={handleJoin}
                    disabled={joining || joined}
                    className="inline-flex w-full items-center justify-center gap-2 border-2 border-[var(--accent)] py-3 text-base font-bold text-[var(--accent)] transition hover:bg-primary/10 disabled:opacity-60 active:scale-[0.99]"
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
                ))}
            </>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleWhatsApp}
              className="inline-flex items-center justify-center gap-2 bg-[#25D366] py-3 text-sm font-bold text-white transition hover:bg-[#1ea34d] active:scale-[0.99]"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
              WhatsApp
            </button>
            <button
              type="button"
              onClick={handleNativeShare}
              className="inline-flex items-center justify-center gap-2 border-2 border-[var(--rule-base)] py-3 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] active:scale-[0.99]"
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

          {/* QR para compartir en persona (pegar en la puerta del edificio) */}
          {!isExpired && pageUrl && (
            <JuntaQR
              code={code}
              url={pageUrl}
              posterTitle="Súmate a la junta del barrio"
              posterSubtitle={`Si juntamos ${target} vecinos, todos llevamos ${JUNTA_COUPON_PERCENT}% off`}
            />
          )}

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
    </section>
  );
}
