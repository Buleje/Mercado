"use client";

/**
 * CuponBienvenidaBar — barra de cupón de 1ª compra para /tiendas
 * (Brandon 2026-06-02). Quick win de conversión.
 *
 * Antes el cupón BIENVENIDO10 vivía escondido en el hero rotante (1 de 4
 * slides) — fácil de no ver. Esta barra lo pone ARRIBA, visible al abrir, solo
 * para usuarios NUEVOS (sin pedido completado), con copiar + cerrar.
 *
 * - Gate: `useHasCompletedFirstOrder() === false` (null = loading → no mostrar;
 *   true = ya compró → no aplica). Cubre anónimos y logueados sin pedidos.
 * - Dismiss por sessionStorage (reaparece la próxima visita hasta que compre
 *   o cierre de nuevo) — "más agresivo" sin ser molesto dentro de la sesión.
 * - BIENVENIDO10 es un cupón REAL (10% off nuevos clientes, mín S/30).
 */

import { useState, useEffect, useCallback } from "react";
import { Gift, Copy, Check, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useHasCompletedFirstOrder } from "@/hooks/use-first-order";

const COUPON = "BIENVENIDO10";
const DISMISS_KEY = "buleje:welcome-coupon-dismissed";

export default function CuponBienvenidaBar() {
  const hasOrdered = useHasCompletedFirstOrder(); // null | false | true
  const [dismissed, setDismissed] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(COUPON)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      })
      .catch(() => setCopied(false));
  }, []);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sin sessionStorage: igual lo ocultamos en memoria */
    }
    setDismissed(true);
  }, []);

  // Solo usuarios nuevos. null (loading) → no renderiza (evita flash).
  if (hasOrdered !== false || dismissed) return null;

  return (
    <div className="mx-auto max-w-[1760px] px-4 pt-3 sm:px-6 lg:px-8">
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-linear-to-r from-[var(--accent-600,var(--accent))] to-[var(--accent)] px-3.5 py-2.5 text-white shadow-sm sm:px-4 sm:py-3">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl"
        />
        <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Gift className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </span>
        <p className="relative min-w-0 flex-1 text-sm font-bold leading-tight sm:text-base">
          <span className="font-extrabold">10% OFF</span> en tu primer pedido
          <span className="hidden font-medium text-white/85 sm:inline"> · en compras desde S/30</span>
        </p>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copiar cupón ${COUPON}`}
          className="relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-extrabold text-[var(--accent-600,var(--accent))] shadow-sm transition-all hover:-translate-y-0.5 active:scale-95 sm:px-3.5 sm:text-sm"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden />
              ¡Copiado!
            </>
          ) : (
            <>
              <span className="font-mono tracking-tight">{COUPON}</span>
              <Copy className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </>
          )}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/15 hover:text-white"
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>
  );
}
