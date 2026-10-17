"use client";

/**
 * SuccessCelebration — Overlay modal de celebracion post-accion exitosa.
 *
 * Usado despues de:
 *   - Completar pedido
 *   - Primer login
 *   - Aplicar cupon ganador
 *   - Hito de referidos (5 amigos, VIP, etc)
 *
 * Visual:
 *   - Fondo blur + backdrop
 *   - Mascota Paiche o Tucán del DS
 *   - Titulo + mensaje
 *   - CTA primary + opcional secondary
 *   - Confetti sutil (Lottie si disponible, CSS fallback)
 *   - Cierre con X o click backdrop
 *
 * Respeta reduced-motion: no confetti, solo scale entry suave.
 */

import { useEffect, useState } from "react";
import { X } from "@buleje/design-system/icons";
import { PaicheMascot } from "@/components/ui-system/illustrations/PaicheMascot";
import { TucanMascot } from "@/components/ui-system/illustrations/TucanMascot";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  /** Cual mascota. Default "paiche" */
  mascot?: "paiche" | "tucan";
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Animar confetti. Default true */
  confetti?: boolean;
}

export default function SuccessCelebration({
  open,
  onClose,
  title,
  message,
  mascot = "paiche",
  primaryAction,
  secondaryAction,
  confetti = true,
}: Props) {
  const [, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const escKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("keydown", escKey);
      return () => document.removeEventListener("keydown", escKey);
    }
    setMounted(false);
  }, [open, onClose]);

  if (!open) return null;

  const Mascot = mascot === "tucan" ? TucanMascot : PaicheMascot;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--text-primary)]/60 backdrop-blur-sm motion-safe:animate-[fadeIn_0.3s]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
    >
      {/* Confetti decorativo — 6 dots animados */}
      {confetti && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "absolute w-2 h-2 rounded-full animate-[confetti_2.5s_ease-out_forwards]",
                i % 3 === 0
                  ? "bg-[var(--accent)]"
                  : i % 3 === 1
                  ? "bg-[var(--data-warning,_#eab308)]"
                  : "bg-[var(--data-error,_#e11d48)]",
              )}
              style={{
                left: `${(i * 7.3) % 100}%`,
                top: "40%",
                animationDelay: `${i * 0.08}s`,
                transform: `rotate(${i * 25}deg)`,
              }}
            />
          ))}
        </div>
      )}

      <div
        className={cn(
          "relative w-full max-w-md rounded-3xl bg-[var(--surface-raised)] shadow-2xl overflow-hidden",
          "motion-safe:animate-[celebrate_0.5s_cubic-bezier(0.34,1.56,0.64,1)]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 z-10 p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>

        {/* Mascota centrada con glow */}
        <div className="relative pt-10 pb-6 flex items-center justify-center">
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
          >
            <div className="h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
          </div>
          <div className="relative motion-safe:animate-[bounceIn_0.7s_cubic-bezier(0.34,1.56,0.64,1)]">
            <Mascot size={140} />
          </div>
        </div>

        {/* Contenido */}
        <div className="px-8 pb-8 text-center space-y-3">
          <h2
            id="celebration-title"
            className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]"
          >
            {title}
          </h2>
          {message && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-sm mx-auto">
              {message}
            </p>
          )}

          {(primaryAction || secondaryAction) && (
            <div className="pt-4 flex flex-col gap-2">
              {primaryAction && (
                <button
                  type="button"
                  onClick={primaryAction.onClick}
                  className="w-full rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] py-3 text-sm font-bold hover:bg-[var(--accent)] transition-colors active:scale-[0.98]"
                >
                  {primaryAction.label}
                </button>
              )}
              {secondaryAction && (
                <button
                  type="button"
                  onClick={secondaryAction.onClick}
                  className="w-full rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)] py-3 text-sm font-bold hover:border-[var(--accent)] transition-colors"
                >
                  {secondaryAction.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
