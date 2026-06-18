"use client";

/**
 * GroupBuyCard — La Junta del Barrio (compra colaborativa vecinal).
 *
 * Rediseño 2026-06-18: header de marca, urgencia (cierre), slots de vecinos
 * (prueba social), premio vendido arriba (cupón al completar) y jerarquía de
 * CTAs. Datos reales: progreso persistido, unirse, comprar para la junta,
 * compartir por WhatsApp (tuteo).
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  MessageCircle,
  Check,
  Copy,
  CalendarClock,
  Tag,
  ShoppingBag,
  Gift,
} from "@buleje/design-system/icons";
import { JUNTA_COUPON_PERCENT } from "@/lib/junta/constants";
import { setActiveJunta } from "@/lib/junta/active";

type JuntaStatus = "OPEN" | "COMPLETE" | "EXPIRED";

interface Props {
  code: string;
  zoneLabel: string;
  productLabel?: string;
  count: number;
  target: number;
  status: JuntaStatus;
  /** ISO de cierre de la junta (Fase A1) — para mostrar urgencia. */
  windowEnd?: string;
  /** Cupón emitido al completar la junta (Fase A2). */
  couponCode?: string;
  /** Pedidos ya hechos dentro de la junta (Fase A4). */
  orderCount?: number;
}

const BRAND_GRADIENT =
  "linear-gradient(135deg, var(--color-primary, #00A0A0) 0%, var(--color-primary-dark, #009690) 100%)";

function formatDeadline(windowEnd?: string): string | null {
  if (!windowEnd) return null;
  const diff = new Date(windowEnd).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "Cierra en menos de 1 h";
  if (hours < 24) return `Cierra en ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Cierra en ${days} día${days === 1 ? "" : "s"}`;
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
  const [count, setCount] = useState(initialCount);
  const [status, setStatus] = useState<JuntaStatus>(initialStatus);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [couponCopied, setCouponCopied] = useState(false);
  const router = useRouter();

  const remaining = Math.max(0, target - count);
  const progress = Math.min(100, Math.round((count / target) * 100));
  const isComplete = status === "COMPLETE" || count >= target;
  const isExpired = status === "EXPIRED";
  const deadline = isExpired || isComplete ? null : formatDeadline(windowEnd);
  // Slots visuales (prueba social) — máx 8 para juntas grandes.
  const slots = Array.from({ length: Math.min(target, 8) }, (_, i) => i < count);

  const shareUrl = useCallback(() => {
    if (typeof window === "undefined") return `/junta/${code}`;
    return `${window.location.origin}/junta/${code}`;
  }, [code]);

  const handleShopForJunta = useCallback(() => {
    setActiveJunta(code);
    router.push("/");
  }, [code, router]);

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
        `Si juntamos ${target} de la cuadra, todos llevamos ${JUNTA_COUPON_PERCENT}% off. ` +
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
      className="overflow-hidden rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]"
    >
      {/* ── Header de marca ── */}
      <div
        className="relative px-5 py-6 sm:px-6 text-white"
        style={{ background: BRAND_GRADIENT }}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full"
          style={{ background: "rgba(255,255,255,0.10)" }}
          aria-hidden
        />
        <div className="relative flex items-start gap-3">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <Users className="h-6 w-6" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white/85">
              La Junta del Barrio · {zoneLabel}
            </p>
            <h2 className="mt-0.5 text-2xl font-extrabold leading-tight tracking-tight">
              {target} vecinos, una sola entrega
            </h2>
          </div>
        </div>
        {deadline && (
          <span className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-sm font-bold backdrop-blur-sm">
            <CalendarClock className="h-4 w-4" strokeWidth={2} aria-hidden />
            {deadline}
          </span>
        )}
      </div>

      {/* ── Cuerpo ── */}
      <div className="px-5 py-5 sm:px-6 space-y-5">
        {productLabel && (
          <p className="text-base leading-relaxed text-[var(--text-secondary)]">
            Junta a {target - 1} vecinos de tu zona para{" "}
            <span className="font-bold text-[var(--text-primary)]">
              {productLabel}
            </span>
            . Al completar, coordinan una sola entrega.
          </p>
        )}

        {/* Premio vendido arriba */}
        <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-3">
          <Gift
            className="h-6 w-6 shrink-0 text-[var(--accent)]"
            strokeWidth={2}
            aria-hidden
          />
          <p className="text-base font-bold text-[var(--text-primary)]">
            Al completar la junta, todos llevan{" "}
            <span className="text-[var(--accent)]">
              {JUNTA_COUPON_PERCENT}% de descuento
            </span>
          </p>
        </div>

        {/* Slots de vecinos (prueba social) */}
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5" aria-hidden>
              {slots.map((filled, i) => (
                <span
                  key={i}
                  className={
                    filled
                      ? "inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white"
                      : "inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]"
                  }
                >
                  <Users className="h-4 w-4" strokeWidth={2} />
                </span>
              ))}
            </div>
            <span className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
              {count}/{target}
            </span>
          </div>

          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-base font-semibold text-[var(--text-secondary)]">
            {isExpired
              ? "Esta junta ya cerró."
              : isComplete
                ? "¡Junta completa! Ya pueden coordinar la entrega."
                : `Faltan ${remaining} vecino${remaining === 1 ? "" : "s"} para completar`}
          </p>
          {orderCount > 0 && (
            <p className="mt-1 text-sm font-semibold text-[var(--text-tertiary)]">
              {orderCount}{" "}
              {orderCount === 1 ? "pedido ya hecho" : "pedidos ya hechos"} en
              esta junta
            </p>
          )}
        </div>

        {/* Cupón (junta completa) */}
        {isComplete && couponCode && (
          <div className="rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)] p-4">
            <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              <Tag className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Tu cupón de la junta · {JUNTA_COUPON_PERCENT}% off
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="font-mono text-xl font-extrabold tracking-wide text-[var(--text-primary)]">
                {couponCode}
              </span>
              <button
                type="button"
                onClick={handleCopyCoupon}
                className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--accent)] px-3.5 py-2 text-sm font-bold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white active:scale-95"
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-extrabold text-white transition active:scale-[0.98]"
              style={{
                background: BRAND_GRADIENT,
                boxShadow:
                  "0 10px 24px -8px color-mix(in oklch, var(--color-primary, #00A0A0) 45%, transparent)",
              }}
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--accent)] py-3 text-base font-bold text-[var(--accent)] transition hover:bg-[var(--accent-soft)] disabled:opacity-60 active:scale-[0.98]"
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
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] py-3 text-sm font-bold text-white transition hover:bg-[#1ea34d] active:scale-[0.98]"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
              Invitar
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] py-3 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 active:scale-[0.98]"
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
                  <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Copiar link
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
      <details className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 sm:px-6 hover:bg-[var(--surface-raised)]">
          <span className="text-sm font-bold text-[var(--text-secondary)]">
            ¿Cómo funciona la junta?
          </span>
          <CalendarClock
            className="h-4 w-4 text-[var(--text-tertiary)]"
            strokeWidth={1.75}
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
