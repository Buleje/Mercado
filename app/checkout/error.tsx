"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ShoppingCart, RefreshCw, ArrowLeft } from "@buleje/design-system/icons";
import { PaicheMascot } from "@/components/ui-system/illustrations";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CheckoutError({ error, reset }: Props) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const w = window as unknown as {
          Sentry?: { captureException?: (e: unknown) => void };
        };
        w.Sentry?.captureException?.(error);
      } catch {
        /* silent — Sentry no disponible */
      }
    }
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-12 sm:py-20">
      <div className="relative max-w-md w-full text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 h-[280px] w-[280px] rounded-full bg-[var(--accent)]/[0.08] blur-3xl"
        />
        <div className="relative text-[var(--accent)] mx-auto mb-2">
          <PaicheMascot size={140} animated />
        </div>
        <h1 className="relative text-2xl sm:text-3xl font-black tracking-[-0.025em] text-[var(--text-primary)] leading-tight">
          Algo salió mal{" "}
          <span className="italic font-serif text-[var(--accent)]">en el camino.</span>
        </h1>
        <p className="relative mt-3 text-[length:var(--ts-sm)] sm:text-base text-[var(--text-secondary)] leading-relaxed">
          Tu carrito está seguro — no perdiste nada. Probá de nuevo o volvé al
          carrito para revisar.
        </p>

        <div className="relative mt-6 flex flex-col sm:flex-row items-center gap-2.5 w-full">
          <button
            type="button"
            onClick={reset}
            className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 h-12 text-[length:var(--ts-sm)] font-extrabold text-white hover:bg-[var(--accent)]/90 active:scale-[0.98] shadow-[0_6px_20px_-10px_var(--accent)] transition-all"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Reintentar
          </button>
          <Link
            href="/marketplace/carrito"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-5 h-12 text-[length:var(--ts-sm)] font-extrabold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] active:scale-[0.98] transition-all"
          >
            <ShoppingCart className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            Volver al carrito
          </Link>
        </div>

        <Link
          href="/tiendas"
          className="relative mt-4 inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Ir al directorio de tiendas
        </Link>

        {error.digest && (
          <p className="relative mt-6 text-[10px] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] font-mono">
            ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
