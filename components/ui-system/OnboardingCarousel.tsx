"use client";

/**
 * OnboardingCarousel — Carrusel de bienvenida para primera visita.
 *
 * 3-4 pantallas con:
 *   - Ilustración grande del DS por paso
 *   - Título editorial
 *   - Descripción
 *   - Dots progress + Next/Prev
 *   - Skip button top-right
 *
 * Se monta en primer login/signup o si flag "onboarding-seen" ausente
 * en localStorage. Al terminar o skip, setea el flag.
 *
 * API:
 *   <OnboardingCarousel steps={STEPS} onFinish={...} onSkip={...} />
 */

import { useState, useCallback, useEffect, type ReactNode } from "react";
import { ArrowRight, ArrowLeft, X, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  illustration: ReactNode;
  /** CTA secundario opcional en el step (ej: link a docs) */
  hint?: string;
}

interface Props {
  steps: OnboardingStep[];
  open?: boolean;
  onFinish?: () => void;
  onSkip?: () => void;
  /** Key en localStorage para no volver a mostrar. Default "buleje-onboarding-v1" */
  storageKey?: string;
}

export default function OnboardingCarousel({
  steps,
  open: controlledOpen,
  onFinish,
  onSkip,
  storageKey = "buleje-onboarding-v1",
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  // Auto-open si no hay flag en localStorage
  useEffect(() => {
    if (isControlled) return;
    try {
      const seen = localStorage.getItem(storageKey);
      if (!seen) setInternalOpen(true);
    } catch {
      /* silent */
    }
  }, [isControlled, storageKey]);

  // ESC cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSkip();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentIdx]);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* silent */
    }
  }, [storageKey]);

  const handleNext = useCallback(() => {
    if (currentIdx < steps.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      markSeen();
      if (!isControlled) setInternalOpen(false);
      onFinish?.();
    }
  }, [currentIdx, steps.length, markSeen, isControlled, onFinish]);

  const handlePrev = useCallback(() => {
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  }, [currentIdx]);

  const handleSkip = useCallback(() => {
    markSeen();
    if (!isControlled) setInternalOpen(false);
    onSkip?.();
  }, [markSeen, isControlled, onSkip]);

  if (!open || steps.length === 0) return null;

  const step = steps[currentIdx];
  const isLast = currentIdx === steps.length - 1;
  const isFirst = currentIdx === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--text-primary)]/70 backdrop-blur-sm motion-safe:animate-[fadeIn_0.3s]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-lg bg-[var(--surface-raised)] rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-5 pt-4">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] tabular-nums">
            Paso {currentIdx + 1} de {steps.length}
          </p>
          <button
            type="button"
            onClick={handleSkip}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <span>Saltar</span>
            <X className="h-3 w-3" strokeWidth={2} aria-hidden />
          </button>
        </header>

        {/* Contenido: ilustracion + texto */}
        <div className="px-8 py-6 text-center">
          <div className="mx-auto mb-6 flex items-center justify-center text-[var(--accent)] motion-safe:animate-[bounceIn_0.6s]">
            {step.illustration}
          </div>
          <h2
            id="onboarding-title"
            className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)] mb-3"
          >
            {step.title}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-sm mx-auto">
            {step.description}
          </p>
          {step.hint && (
            <p className="mt-3 text-xs text-[var(--text-tertiary)] italic">
              {step.hint}
            </p>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pb-5">
          {steps.map((s, i) => (
            <span
              key={s.id}
              aria-hidden
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === currentIdx
                  ? "w-8 bg-[var(--accent)]"
                  : "w-1.5 bg-[var(--rule-base)]",
              )}
            />
          ))}
        </div>

        {/* Footer nav */}
        <footer className="flex items-center justify-between gap-3 p-5 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
          <button
            type="button"
            onClick={handlePrev}
            disabled={isFirst}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors",
              isFirst
                ? "opacity-0 pointer-events-none"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Atrás
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-5 py-2.5 text-sm font-bold hover:bg-[var(--accent)] transition-colors active:scale-[0.98]"
          >
            {isLast ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                Empezar
              </>
            ) : (
              <>
                Siguiente
                <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
