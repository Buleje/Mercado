"use client";

import { useEffect, useRef } from "react";

/**
 * FocusTrap — atrapa el foco dentro del contenedor (modales, drawers).
 *
 * Si el usuario Tabs fuera del contenedor, lo trae de vuelta al primer
 * elemento focusable. Shift+Tab desde el primero va al ultimo.
 *
 * WCAG 2.4.3 Focus Order. Complementa Radix Dialog que ya trapea foco
 * pero util para modales custom.
 *
 * @example
 * <FocusTrap active={isOpen}>
 *   <div>Contenido modal</div>
 * </FocusTrap>
 */

interface Props {
  active: boolean;
  children: React.ReactNode;
  /** Si true, restaura focus al elemento previo al activar. Default true. */
  restoreFocus?: boolean;
  /** Selector del primer elemento a enfocar al activar. Default: primer focusable. */
  initialFocusSelector?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function FocusTrap({
  active,
  children,
  restoreFocus = true,
  initialFocusSelector,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    // Guardar focus previo
    if (restoreFocus) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }

    // Focus inicial
    const initialTarget = initialFocusSelector
      ? containerRef.current.querySelector<HTMLElement>(initialFocusSelector)
      : containerRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    initialTarget?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (!containerRef.current) return;

      const focusables = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (restoreFocus && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [active, restoreFocus, initialFocusSelector]);

  return <div ref={containerRef}>{children}</div>;
}
