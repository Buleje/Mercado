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
 * tokens del DS (var(--accent)) en lugar de var(--accent) hardcoded, animación
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
    // Brandon 2026-07-06 — NO bloqueante: antes era un modal full-screen con
    // backdrop que tapaba la home al entrar (contra la regla "sin modales en
    // pantalla de entrada"). Ahora es un card slide-in en la esquina: el cliente
    // sigue navegando y la oferta queda a mano. Mobile: sobre el BottomNav.
    <aside
      role="region"
      aria-label="Cupón de bienvenida"
      className="fixed z-[7000] inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[22rem] motion-safe:animate-[slideUp_0.4s_cubic-bezier(0.34,1.3,0.64,1)]"
    >
      <div className="relative overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-xl)]">
        {/* Glow de acento arriba */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-16 bg-linear-to-b from-[var(--accent)]/12 to-transparent pointer-events-none"
        />

        {/* Cerrar — área de toque ≥36px */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar cupón de bienvenida"
          className="absolute top-2 right-2 z-20 h-9 w-9 inline-flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors active:scale-95"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>

        <div className="relative p-4 sm:p-5">
          {/* Encabezado: icono + oferta en una fila compacta */}
          <div className="flex items-center gap-3 pr-8">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">
              <Gift className="h-6 w-6" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1 text-[length:var(--ts-2xs,0.6875rem)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                <Sparkles className="h-3 w-3" strokeWidth={2.25} />
                Cupón de bienvenida
              </p>
              <p className="mt-0.5 text-xl font-extrabold leading-none tracking-tight text-[var(--text-primary)]">
                10<span className="text-[var(--accent)]">%</span> OFF{" "}
                <span className="text-sm font-semibold text-[var(--text-secondary)]">
                  en tu 1er pedido
                </span>
              </p>
            </div>
          </div>

          {/* Código copiable — toda la zona clickable */}
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Código copiado" : "Copiar código BIENVENIDO"}
            className="group mt-3.5 flex w-full items-center justify-between gap-3 rounded-xl border-2 border-dashed border-[var(--accent)]/35 bg-[var(--surface-sunken)] px-3.5 py-2.5 text-left transition-all hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 active:scale-[0.985]"
          >
            <span className="font-mono text-base font-extrabold tracking-[var(--ls-wider)] text-[var(--text-primary)] select-all truncate">
              {COUPON_CODE}
            </span>
            <span
              className={[
                "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-extrabold uppercase tracking-wide transition-colors shrink-0",
                copied
                  ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]"
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
          </button>

          {/* CTA */}
          <Link
            href="/tiendas"
            onClick={handleClose}
            className="mt-3 inline-flex w-full h-11 items-center justify-center rounded-xl bg-[var(--text-primary)] text-[var(--surface-raised)] text-sm font-extrabold uppercase tracking-wide hover:opacity-90 transition-opacity active:scale-[0.985]"
          >
            Ir a comprar
          </Link>
          <p className="mt-2 text-center text-[length:var(--ts-2xs,0.6875rem)] text-[var(--text-tertiary)]">
            Válido en tu primer pedido en{" "}
            <span className="font-semibold text-[var(--text-secondary)]">{storeName}</span> · Sin monto mínimo
          </p>
        </div>
      </div>
    </aside>
  );
}
