"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { RefreshCcw, Home, LifeBuoy } from "lucide-react";
import { CuadernoFiadoReal } from "@/components/ui-system/illustrations";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)] px-4 py-12">
      <div className="max-w-lg w-full text-center">
        {/* Ilustración custom — cuaderno con tache (algo se anotó mal) */}
        <div className="relative flex justify-center mb-6 text-[var(--text-primary)]">
          <CuadernoFiadoReal size={200} className="text-[var(--text-secondary)] opacity-85" />
          {/* Tache superpuesto (algo está mal) */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-8deg]"
            aria-hidden="true"
          >
            <svg
              width="120"
              height="60"
              viewBox="0 0 120 60"
              fill="none"
              stroke="var(--data-error, #e11d48)"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.75"
            >
              <path d="M10 30q30 -15 100 -5" />
              <path d="M15 45q25 -18 95 0" />
            </svg>
          </div>
        </div>

        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-tertiary)] mb-3">
          Error interno
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">
          Algo pasó en la bodega
        </h1>
        <p className="mt-3 text-[var(--text-secondary)] text-base leading-relaxed max-w-md mx-auto">
          Nos cruzaron los papeles. Ya estamos avisados y revisando. Podés
          reintentar o volver al inicio mientras tanto.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 bg-[var(--text-primary)] text-[var(--surface-canvas)] font-bold rounded-full px-6 py-3 text-sm hover:opacity-90 active:scale-95 transition-all"
          >
            <RefreshCcw className="h-4 w-4" strokeWidth={1.75} />
            Reintentar
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-transparent text-[var(--text-primary)] font-bold rounded-full px-6 py-3 text-sm border border-[var(--rule-base)] hover:border-[var(--rule-strong)] active:scale-95 transition-all"
          >
            <Home className="h-4 w-4" strokeWidth={1.75} />
            Ir al inicio
          </Link>
        </div>

        {/* Contacto soporte */}
        <div className="mt-8 border-t border-[var(--rule-soft)] pt-5">
          <Link
            href="/ayuda"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <LifeBuoy className="h-3.5 w-3.5" strokeWidth={1.75} />
            Contactar soporte
          </Link>
        </div>

        {error.digest && (
          <p className="text-[10px] font-mono text-[var(--text-tertiary)] mt-4 opacity-60">
            Código: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
