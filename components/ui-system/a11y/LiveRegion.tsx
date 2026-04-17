"use client";

import { useEffect, useState } from "react";

/**
 * LiveRegion — anuncia cambios dinamicos a screen readers (toasts, notifications).
 *
 * WCAG 4.1.3 Status Messages. Los lectores NVDA/JAWS/VoiceOver leen automaticamente
 * el contenido cuando cambia.
 *
 * @example
 * <LiveRegion politeness="polite">
 *   {cart.items.length} productos en tu carrito, total S/ {total}
 * </LiveRegion>
 *
 * // Para notificaciones criticas (errores, alertas):
 * <LiveRegion politeness="assertive">
 *   Error: tu pago no pudo procesarse
 * </LiveRegion>
 */

interface Props {
  /**
   * polite = espera a que SR termine frase actual
   * assertive = interrumpe inmediatamente (errores criticos)
   */
  politeness?: "polite" | "assertive";
  /** Si es true, los cambios parciales se anuncian. Default false (solo cambios completos). */
  atomic?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function LiveRegion({
  politeness = "polite",
  atomic = true,
  children,
  className = "sr-only",
}: Props) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic={atomic}
      className={className}
    >
      {children}
    </div>
  );
}

/**
 * useAnnounce — hook imperativo para anunciar mensajes sin mantener un LiveRegion.
 *
 * Internamente crea un LiveRegion mount-once y actualiza su contenido.
 *
 * @example
 * const announce = useAnnounce();
 * announce("Producto agregado al carrito");
 */
export function useAnnounce() {
  const [, setMessage] = useState("");

  useEffect(() => {
    if (typeof document === "undefined") return;
    // Mount once un LiveRegion oculto global
    let region = document.getElementById("buleje-announce-region");
    if (!region) {
      region = document.createElement("div");
      region.id = "buleje-announce-region";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "true");
      region.className = "sr-only";
      document.body.appendChild(region);
    }
  }, []);

  return (message: string, politeness: "polite" | "assertive" = "polite") => {
    if (typeof document === "undefined") return;
    const region = document.getElementById("buleje-announce-region");
    if (!region) return;
    region.setAttribute("aria-live", politeness);
    // Clear y re-set para forzar re-anuncio
    region.textContent = "";
    setTimeout(() => {
      region.textContent = message;
      setMessage(message);
    }, 50);
  };
}
