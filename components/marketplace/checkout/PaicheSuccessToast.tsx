"use client";

/**
 * PaicheSuccessToast — Toast flotante con el paiche nadando, aparece tras
 * un pedido exitoso. Se anima desde la esquina inferior derecha con un
 * fade + slide suave. Auto-dismiss en 3.5s (o antes si el padre desmonta).
 *
 * Identidad Buleje amazónica: el paiche (Arapaima gigas) es la mascota
 * regional de Pucallpa/Ucayali — usarla en momentos de celebración
 * refuerza la voz del producto.
 */

import { useEffect, useState } from "react";
import { CheckCircle2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { PaicheMascot } from "@/components/ui-system/illustrations";

export interface PaicheSuccessToastProps {
  /** true → aparece y se auto-cierra. false → oculto. */
  show: boolean;
  /** Mensaje principal bold. */
  title?: string;
  /** Subtexto opcional en gris. */
  subtitle?: string;
  /** Callback al cerrarse (tras animación). */
  onDismiss?: () => void;
  /** ms visible. Default 3500. */
  durationMs?: number;
}

export default function PaicheSuccessToast({
  show,
  title = "¡Pedido recibido!",
  subtitle = "Cada bodega te contacta por WhatsApp en minutos.",
  onDismiss,
  durationMs = 3500,
}: PaicheSuccessToastProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) {
      if (mounted) {
        setVisible(false);
        const t = setTimeout(() => {
          setMounted(false);
          onDismiss?.();
        }, 400);
        return () => clearTimeout(t);
      }
      return;
    }

    // Show flow: mount → next frame visible → hide after duration
    setMounted(true);
    const enter = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    const hide = setTimeout(() => setVisible(false), durationMs);
    const unmount = setTimeout(() => {
      setMounted(false);
      onDismiss?.();
    }, durationMs + 400);

    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(hide);
      clearTimeout(unmount);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, durationMs]);

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-6 right-6 z-[200] pointer-events-auto",
        "max-w-sm w-[calc(100vw-3rem)] sm:w-auto",
        "transition-all duration-500 ease-out",
        visible
          ? "opacity-100 translate-y-0 translate-x-0"
          : "opacity-0 translate-y-4 translate-x-4",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl border-2 border-[var(--accent)]/40",
          "bg-gradient-to-br from-[var(--accent-soft)] via-[var(--surface-raised)] to-[var(--surface-raised)]",
          "shadow-[0_24px_64px_-16px_var(--accent)]",
          "pl-4 pr-6 py-4 flex items-start gap-4",
        )}
      >
        {/* Blob decorativo */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-8 -right-10 h-32 w-32 rounded-full bg-[var(--accent)]/[0.14] blur-2xl"
        />

        {/* Paiche mascot — nadando */}
        <div className="relative shrink-0 text-[var(--accent)] -ml-2">
          <PaicheMascot size={96} animated />
        </div>

        {/* Texto + check */}
        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              aria-hidden
              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-sm"
            >
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.75} />
            </span>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--accent)]">
              Listo
            </p>
          </div>
          <p className="text-base sm:text-lg font-black tracking-[-0.02em] text-[var(--text-primary)] leading-tight">
            {title.includes(" ") ? (
              <>
                {title.split(" ").slice(0, -1).join(" ")}{" "}
                <span className="italic font-serif text-[var(--accent)]">
                  {title.split(" ").slice(-1)[0]}
                </span>
              </>
            ) : (
              title
            )}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs text-[var(--text-tertiary)] leading-snug">
              {subtitle}
            </p>
          )}
        </div>

        {/* Barra de progreso (cuenta regresiva) */}
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-[3px] bg-[var(--accent)] origin-left"
          style={{
            width: "100%",
            animation: `paicheToastBar ${durationMs}ms linear forwards`,
          }}
        />
      </div>

      <style jsx>{`
        @keyframes paicheToastBar {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }
      `}</style>
    </div>
  );
}
