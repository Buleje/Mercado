"use client";

/**
 * GroupBuyCard — La Junta del Barrio (compra colaborativa vecinal).
 *
 * Fase A1: datos REALES. Muestra el progreso de una junta persistida, permite
 * unirse (POST /api/juntas/[code]/join) y compartir el link por WhatsApp (tuteo).
 * El premio de envío gratis al completar llega en Fase A2.
 */

import { useState, useCallback } from "react";
import {
  Users,
  MessageCircle,
  Check,
  Copy,
  CalendarClock,
  Tag,
} from "@buleje/design-system/icons";
import { JUNTA_COUPON_PERCENT } from "@/lib/junta/constants";

type JuntaStatus = "OPEN" | "COMPLETE" | "EXPIRED";

interface Props {
  code: string;
  zoneLabel: string;
  productLabel?: string;
  count: number;
  target: number;
  status: JuntaStatus;
  /** Cupón emitido al completar la junta (Fase A2). */
  couponCode?: string;
}

export default function GroupBuyCard({
  code,
  zoneLabel,
  productLabel,
  count: initialCount,
  target,
  status: initialStatus,
  couponCode,
}: Props) {
  const [count, setCount] = useState(initialCount);
  const [status, setStatus] = useState<JuntaStatus>(initialStatus);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [couponCopied, setCouponCopied] = useState(false);

  const progress = Math.min(100, Math.round((count / target) * 100));
  const remaining = Math.max(0, target - count);
  const isComplete = status === "COMPLETE" || count >= target;
  const isExpired = status === "EXPIRED";

  const shareUrl = useCallback(() => {
    if (typeof window === "undefined") return `/junta/${code}`;
    return `${window.location.origin}/junta/${code}`;
  }, [code]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar el link");
    }
  }, [shareUrl]);

  const handleCopyCoupon = useCallback(async () => {
    if (!couponCode) return;
    try {
      await navigator.clipboard.writeText(couponCode);
      setCouponCopied(true);
      setTimeout(() => setCouponCopied(false), 2000);
    } catch {
      setError("No se pudo copiar el cupón");
    }
  }, [couponCode]);

  const handleWhatsApp = useCallback(() => {
    const msg = encodeURIComponent(
      `Vecinos, estoy armando una junta en Buleje${productLabel ? ` para ${productLabel}` : ""}. ` +
        `Si juntamos ${target} de la cuadra, coordinamos una sola entrega para todos. ` +
        `Faltan ${remaining} — súmate acá: ${shareUrl()}`,
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener,noreferrer");
  }, [productLabel, target, remaining, shareUrl]);

  const handleJoin = useCallback(async () => {
    setJoining(true);
    setError("");
    try {
      const res = await fetch(`/api/juntas/${code}/join`, { method: "POST" });
      const data = await res.json().catch((err) => {
        console.warn("[junta] join: respuesta no-JSON", err);
        return null;
      });
      if (!res.ok) {
        setError(data?.error ?? "No te pudiste unir");
        return;
      }
      setJoined(true);
      if (data?.junta) {
        setCount(data.junta.memberCount ?? count);
        setStatus(data.junta.status ?? status);
      }
    } catch {
      setError("Error de red al unirte");
    } finally {
      setJoining(false);
    }
  }, [code, count, status]);

  return (
    <section
      aria-label="La Junta del Barrio"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
    >
      <div className="px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              La Junta del Barrio · {zoneLabel}
            </p>
            <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)] mt-0.5">
              {target} vecinos, una sola entrega
            </h3>
            <p className="text-sm text-[var(--text-tertiary)] mt-1 leading-relaxed">
              Junta a {target - 1} vecinos de tu zona{productLabel ? ` para ${productLabel}` : ""}.
              Al completar la junta, coordinan la entrega juntos.
            </p>
          </div>
        </div>
      </div>

      {/* Progreso */}
      <div className="px-5 sm:px-6">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Progreso de la junta
          </p>
          <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
            {count} / {target}
          </p>
        </div>
        <div
          aria-hidden
          className="h-2 w-full rounded-full bg-[var(--surface-sunken)] overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          {isExpired
            ? "Esta junta ya cerró."
            : isComplete
              ? "¡Junta completa! Ya pueden coordinar la entrega."
              : `Faltan ${remaining} vecino${remaining === 1 ? "" : "s"} para completar la junta`}
        </p>
      </div>

      {/* Cupón de recompensa (junta completa) */}
      {isComplete && couponCode && (
        <div className="mx-5 sm:mx-6 mt-4 rounded-xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)] p-4">
          <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
            <Tag className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Tu cupón de la junta · {JUNTA_COUPON_PERCENT}% off
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-mono text-lg font-extrabold tracking-wide text-[var(--text-primary)]">
              {couponCode}
            </span>
            <button
              type="button"
              onClick={handleCopyCoupon}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition active:scale-95"
            >
              {couponCopied ? (
                <>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  Copiar
                </>
              )}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
            Aplícalo en tu próximo pedido. Cada vecino de la junta puede usarlo.
          </p>
        </div>
      )}

      {/* CTAs */}
      <div className="px-5 sm:px-6 pt-4 pb-5 space-y-2">
        {!isExpired && !isComplete && (
          <button
            type="button"
            onClick={handleJoin}
            disabled={joining || joined}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-white py-3 text-sm font-bold hover:opacity-90 transition disabled:opacity-60 active:scale-[0.98]"
          >
            {joined ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Ya estás en la junta
              </>
            ) : joining ? (
              "Uniéndote…"
            ) : (
              "Súmate a la junta"
            )}
          </button>
        )}

        <button
          type="button"
          onClick={handleWhatsApp}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] text-white py-3 text-sm font-bold hover:bg-[#1ea34d] transition-colors active:scale-[0.98]"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
          Invita vecinos por WhatsApp
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] py-3 text-sm font-bold hover:border-[var(--accent)]/40 transition-colors active:scale-[0.98]"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />
              ¡Link copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Copia el link de la junta
            </>
          )}
        </button>
        {error && (
          <p className="text-sm text-[var(--data-error-600)] font-medium" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Cómo funciona */}
      <details className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
        <summary className="list-none flex items-center justify-between px-5 sm:px-6 py-3 cursor-pointer hover:bg-[var(--surface-raised)]">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            ¿Cómo funciona?
          </span>
          <CalendarClock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
        </summary>
        <ol className="px-5 sm:px-6 pb-4 space-y-1.5 text-xs text-[var(--text-secondary)] leading-relaxed">
          <li>1. Comparte el link con vecinos de tu cuadra o barrio.</li>
          <li>2. Cada uno se suma a la junta desde el link.</li>
          <li>3. Cuando son {target}, la junta se completa.</li>
          <li>4. Coordinan una sola entrega para toda la cuadra.</li>
        </ol>
      </details>
    </section>
  );
}
