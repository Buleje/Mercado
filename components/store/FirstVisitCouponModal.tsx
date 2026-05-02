"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Gift, Sparkles, X } from "@buleje/design-system/icons";
import Link from "next/link";
import { useSettings } from "@/contexts/settings-context";

const STORAGE_KEY = "first-visit-coupon-shown";
const COUPON_CODE = "BIENVENIDO";
const DELAY_MS = 5000;

/**
 * FirstVisitCouponModal — bienvenida con cupón al primer visit del cliente.
 *
 * Rediseñado 2026-05-02: jerarquía visual centrada en "10% OFF" como hero,
 * cupón clickable en toda su área, cierre por backdrop + tecla Escape,
 * tokens del DS (var(--accent)) en lugar de #00B4A6 hardcoded, animación
 * scale-in con easing custom y micro-shimmer en el cupón.
 */
export default function FirstVisitCouponModal() {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const { storeTheme, businessName } = useSettings();

  const storeName =
    storeTheme?.name?.trim() ||
    (storeTheme as { storeName?: string } | null)?.storeName?.trim() ||
    businessName?.trim() ||
    "Buleje";

  const handleClose = useCallback(() => {
    setShow(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      /* silent */
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(COUPON_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* silent */
    }
  }, []);

  // Defer mount until first visit + DELAY_MS
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") return;
    } catch {
      return;
    }
    const timer = setTimeout(() => setShow(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Escape key closes
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show, handleClose]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[8000] flex items-center justify-center p-4 bg-[var(--text-primary)]/55 backdrop-blur-md motion-safe:animate-[fadeIn_0.22s_ease-out]"
      onClick={handleClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-coupon-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-[var(--surface-raised)] rounded-[28px] shadow-[var(--shadow-xl)] overflow-hidden motion-safe:animate-[scaleInModal_0.32s_cubic-bezier(0.34,1.4,0.64,1)] border border-[var(--rule-soft)]"
      >
        {/* Close — alto contraste, área de toque generosa */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar bienvenida"
          className="absolute top-3 right-3 z-20 h-9 w-9 inline-flex items-center justify-center rounded-full bg-[var(--surface-canvas)]/70 hover:bg-[var(--surface-canvas)] backdrop-blur text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors border border-[var(--rule-soft)]"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>

        {/* Hero compacto — un solo bloque, no dos secciones partidas */}
        <div className="relative px-7 pt-9 pb-6 text-center">
          {/* Sutil radial glow del accent atrás del icono */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-[var(--accent)]/12 via-[var(--accent)]/4 to-transparent pointer-events-none"
          />

          <div className="relative inline-flex items-center justify-center h-14 w-14 rounded-full bg-[var(--accent)]/12 text-[var(--accent)] mb-4">
            <Gift className="h-7 w-7" strokeWidth={2} />
          </div>

          <p className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
            <Sparkles className="h-3 w-3" strokeWidth={2.25} />
            Cupón de bienvenida
          </p>

          {/* HERO discount — el dato más importante, tipografía a escala */}
          <h2
            id="welcome-coupon-title"
            className="mt-3 text-5xl font-extrabold tracking-tight text-[var(--text-primary)] leading-none"
          >
            10<span className="text-[var(--accent)]">%</span>
            <span className="ml-1 text-3xl tracking-tight">OFF</span>
          </h2>

          <p className="mt-3 text-sm text-[var(--text-secondary)] font-medium">
            En tu primer pedido en{" "}
            <span className="font-bold text-[var(--text-primary)]">{storeName}</span>
          </p>
        </div>

        {/* Card del cupón — toda la zona clickable para copiar */}
        <div className="px-7 pb-2">
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Código copiado" : "Copiar código BIENVENIDO"}
            className="group w-full relative overflow-hidden rounded-2xl border-2 border-dashed border-[var(--accent)]/35 bg-[var(--surface-sunken)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 transition-all px-5 py-4 text-left active:scale-[0.985]"
          >
            <p className="text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
              Código
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-2xl font-extrabold tracking-[var(--ls-wider)] text-[var(--text-primary)] select-all">
                {COUPON_CODE}
              </span>
              <span
                className={[
                  "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-extrabold uppercase tracking-wide transition-colors shrink-0",
                  copied
                    ? "bg-[var(--data-success)]/15 text-[var(--data-success)]"
                    : "bg-[var(--accent)]/12 text-[var(--accent)] group-hover:bg-[var(--accent)]/18",
                ].join(" ")}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                    Copiar
                  </>
                )}
              </span>
            </div>
          </button>

          <p className="mt-2.5 text-center text-[length:var(--ts-2xs,0.6875rem)] text-[var(--text-tertiary)]">
            Válido sólo en tu primer pedido · Sin monto mínimo
          </p>
        </div>

        {/* CTA */}
        <div className="px-7 pt-3 pb-7 space-y-2">
          <Link
            href="/tienda"
            onClick={handleClose}
            className="w-full inline-flex items-center justify-center h-12 rounded-2xl bg-[var(--text-primary)] text-[var(--surface-raised)] font-extrabold text-sm uppercase tracking-wide hover:opacity-90 transition-opacity active:scale-[0.985]"
          >
            Ir a comprar
          </Link>
          <button
            type="button"
            onClick={handleClose}
            className="w-full h-10 rounded-xl text-sm font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Tal vez después
          </button>
        </div>
      </div>
    </div>
  );
}
