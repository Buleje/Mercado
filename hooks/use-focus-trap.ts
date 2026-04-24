"use client";

/**
 * useFocusTrap — Atrapa el focus dentro de un container (modal, sheet, dialog).
 *
 * - Al montar: enfoca el primer elemento focusable (o el que tenga data-autofocus).
 * - Tab / Shift+Tab cicla dentro del container (wrap-around).
 * - Escape (opcional): dispara onEscape.
 * - Al desmontar: restaura el focus al elemento que lo tenia antes.
 *
 * Uso:
 *   const ref = useFocusTrap<HTMLDivElement>({ enabled: open, onEscape: close });
 *   return <div ref={ref}>...</div>;
 */

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable=\"false\"])",
].join(",");

interface Options {
  /** Activar el trap. Default true */
  enabled?: boolean;
  /** Callback al presionar Escape. Si ausente, no se maneja. */
  onEscape?: () => void;
  /** Restaurar focus al cerrar. Default true */
  restoreFocus?: boolean;
  /** Auto-enfocar al montar. Default true */
  autoFocus?: boolean;
}

export function useFocusTrap<T extends HTMLElement = HTMLElement>({
  enabled = true,
  onEscape,
  restoreFocus = true,
  autoFocus = true,
}: Options = {}) {
  const ref = useRef<T>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const container = ref.current;
    if (!container) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const getFocusableElements = (): HTMLElement[] => {
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && isVisible(el),
      );
    };

    // Auto focus: buscar [data-autofocus], sino primer focusable
    if (autoFocus) {
      const autoFocusTarget = container.querySelector<HTMLElement>("[data-autofocus]");
      const first = autoFocusTarget ?? getFocusableElements()[0];
      // Pequeño delay para animaciones de entry
      const timer = setTimeout(() => {
        first?.focus();
      }, 0);
      // Limpieza dentro del cleanup principal — devolvemos desde handler abajo
      const cleanup = () => clearTimeout(timer);
      container.addEventListener("__cleanup", cleanup, { once: true });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onEscape) {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      container.dispatchEvent(new Event("__cleanup"));
      if (restoreFocus && previouslyFocusedRef.current) {
        const toRestore = previouslyFocusedRef.current;
        if (document.body.contains(toRestore)) {
          toRestore.focus();
        }
      }
    };
  }, [enabled, onEscape, restoreFocus, autoFocus]);

  return ref;
}

function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  // offsetParent null = display:none ancestor
  if (el.offsetParent === null && style.position !== "fixed") return false;
  return true;
}

/**
 * Bonus: hook para restorear focus manualmente
 */
export function useRestoreFocus() {
  const storedRef = useRef<HTMLElement | null>(null);

  const store = () => {
    storedRef.current = document.activeElement as HTMLElement | null;
  };

  const restore = () => {
    if (storedRef.current && document.body.contains(storedRef.current)) {
      storedRef.current.focus();
    }
  };

  return { store, restore };
}
