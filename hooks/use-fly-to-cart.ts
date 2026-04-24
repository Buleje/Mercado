"use client";

/**
 * useFlyToCart — Hook que anima un elemento origen volando al icono del
 * carrito al agregar al carrito.
 *
 * Setup:
 *   1. El botón del carrito en el navbar debe tener id="cart-icon-target"
 *   2. Al click "Agregar al carrito" en un producto, llamar flyTo(sourceRef)
 *   3. Un clon del elemento fuente se anima con position:fixed hasta el
 *      target con scale 0.3 + opacity fade
 *
 * Respeta prefers-reduced-motion: skip animation, solo ejecuta onComplete.
 */

import { useCallback } from "react";

interface FlyOptions {
  /** ID del elemento destino. Default "cart-icon-target" */
  targetId?: string;
  /** Duracion ms. Default 700 */
  duration?: number;
  /** Callback tras completar */
  onComplete?: () => void;
}

export function useFlyToCart() {
  const flyTo = useCallback(
    (sourceEl: HTMLElement | null, opts: FlyOptions = {}) => {
      const { targetId = "cart-icon-target", duration = 700, onComplete } = opts;

      if (!sourceEl || typeof window === "undefined") {
        onComplete?.();
        return;
      }

      // Respeta reduced motion
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        onComplete?.();
        return;
      }

      const target = document.getElementById(targetId);
      if (!target) {
        onComplete?.();
        return;
      }

      const sourceRect = sourceEl.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      // Clonar el elemento fuente
      const clone = sourceEl.cloneNode(true) as HTMLElement;
      clone.style.position = "fixed";
      clone.style.top = `${sourceRect.top}px`;
      clone.style.left = `${sourceRect.left}px`;
      clone.style.width = `${sourceRect.width}px`;
      clone.style.height = `${sourceRect.height}px`;
      clone.style.margin = "0";
      clone.style.pointerEvents = "none";
      clone.style.zIndex = "100";
      clone.style.willChange = "transform, opacity";
      clone.style.borderRadius = "50%";
      clone.style.transition = `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${duration}ms ease`;

      document.body.appendChild(clone);

      // Target X/Y relativo al clone origin
      const deltaX = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
      const deltaY = targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2);

      // Trigger animation en next frame
      requestAnimationFrame(() => {
        clone.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.2)`;
        clone.style.opacity = "0.2";
      });

      // Cart target bounce
      const bounceTarget = () => {
        target.style.transition = "transform 200ms ease";
        target.style.transform = "scale(1.25)";
        setTimeout(() => {
          target.style.transform = "scale(1)";
        }, 200);
      };

      setTimeout(() => {
        clone.remove();
        bounceTarget();
        onComplete?.();
      }, duration);
    },
    [],
  );

  return { flyTo };
}
