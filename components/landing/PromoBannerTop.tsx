"use client";

/**
 * PromoBannerTop — banda promocional ultra-thin sobre el LandingHeader.
 *
 * Brandon mayo 2026: empuja la conversión con la oferta del 1er mes gratis
 * sin saturar el nav. Es dismissible — el usuario que ya lo vio una vez
 * no lo ve durante 30 días (cookie `buleje:promo-dismissed`).
 *
 * No es sticky: queda en el flow normal y se va con el scroll. El header
 * sticky-top-0 que está debajo se queda fijo al top cuando el banner sale
 * de viewport. Sin tops dinámicos = simple.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ArrowRight } from "@buleje/design-system/icons";

const COOKIE_KEY = "buleje:promo-dismissed";
const COOKIE_DAYS = 30;

function hasDismissed(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE_KEY}=`));
}

function dismiss(): void {
  if (typeof document === "undefined") return;
  const exp = new Date(Date.now() + COOKIE_DAYS * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${COOKIE_KEY}=1; expires=${exp}; path=/; SameSite=Lax`;
}

export default function PromoBannerTop() {
  // SSR-safe: arrancamos visible, en mount verificamos cookie.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && hasDismissed()) setVisible(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Promoción"
      className="relative w-full bg-gradient-to-r from-[var(--accent)]/10 via-[var(--accent-soft)] to-[var(--accent)]/10 border-b border-[var(--rule-soft)]"
    >
      {/* Brandon 2026-05-18: rediseño mobile.
          ANTES: text "Primer mes gratis · Sin tarjeta · Cancelás cuando quieras"
          + Empezar + X absolute right-2 todo en h-9 con overflow-x-auto. El X
          SE SOBREPONÍA al texto al scrollear horizontal.
          AHORA: layout flex 3-col con espacio reservado para el X (pr-9).
          En mobile texto compacto "Primer mes gratis · Sin tarjeta" (oculta
          "Cancelás cuando quieras" en xs). Empezar como chip pill en lugar
          de link inline. */}
      <div className="mx-auto max-w-[1400px] pl-3 sm:pl-4 pr-9 sm:pr-10 h-9 flex items-center justify-between gap-2 sm:gap-3">
        <span className="text-[length:var(--ts-xs)] sm:text-sm font-semibold text-[var(--text-primary)] inline-flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          <span aria-hidden className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse shrink-0" />
          <span className="truncate">
            <strong className="font-extrabold">Primer mes gratis</strong>
            <span className="text-[var(--text-secondary)]"> · Sin tarjeta</span>
            <span className="hidden sm:inline text-[var(--text-secondary)]"> · Cancelás cuando quieras</span>
          </span>
        </span>
        <Link
          href="/abrir-tienda#planes"
          className="shrink-0 inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-[var(--accent)] text-white text-[length:var(--ts-2xs)] sm:text-[length:var(--ts-xs)] font-extrabold hover:bg-[var(--accent)]/90 active:scale-95 transition-all whitespace-nowrap"
        >
          Empezar
          <ArrowRight className="h-3 w-3" strokeWidth={2.75} />
        </Link>
      </div>

      <button
        type="button"
        onClick={() => {
          dismiss();
          setVisible(false);
        }}
        aria-label="Cerrar banner promocional"
        className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] transition-colors"
      >
        <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
