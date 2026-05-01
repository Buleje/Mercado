"use client";

/**
 * CheckoutTransitionOverlay — overlay full-screen con paiche durante navegación
 * entre pasos del checkout.
 *
 * Usa `useTransition` para detectar el window de loading. Solo se muestra si
 * la transición pasa el umbral (>120ms) — evita flash en navegaciones rápidas.
 *
 * API:
 *   const { isNavigating, navigateTo } = useCheckoutTransition();
 *   <CheckoutTransitionOverlay show={isNavigating} label="..." />;
 */

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BulejeLoader } from "@/components/ui-system/BulejeLoader";

interface OverlayProps {
  show: boolean;
  label?: string;
}

export function CheckoutTransitionOverlay({ show, label = "Cargando" }: OverlayProps) {
  const [visible, setVisible] = useState(false);

  // Solo mostrar tras 120ms — evita flash en transiciones rápidas
  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), 120);
    return () => window.clearTimeout(id);
  }, [show]);

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`fixed inset-0 z-[70] bg-[var(--surface-canvas)]/95 backdrop-blur-md transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <BulejeLoader variant="paiche" size="lg" label={label} inline />
      </div>
    </div>
  );
}

/**
 * Hook que provee navegación con transición animada.
 *   - `navigateTo(href, label?)` — push con paiche overlay
 *   - `isPending` — true mientras carga la próxima ruta
 */
export function useCheckoutTransition() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingLabel, setPendingLabel] = useState<string>("Cargando");

  const navigateTo = useCallback(
    (href: string, label?: string) => {
      if (label) setPendingLabel(label);
      startTransition(() => {
        router.push(href);
      });
    },
    [router],
  );

  return { isPending, pendingLabel, navigateTo };
}
