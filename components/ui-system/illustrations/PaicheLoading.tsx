/**
 * PaicheLoading — pantalla/bloque de carga con el aro que gira (LoadingSpinner).
 *
 * Brandon 2026-10-08: el paiche nadando «pareciera que se trabó la página»
 * (con «reducir movimiento» quedaba quieto). Se conserva el nombre y las
 * variantes para no tocar a quienes lo usan.
 *
 * Variantes:
 *   - "page"    → pantalla completa: aro grande + texto
 *   - "section" → bloque medio para fallbacks de Suspense
 *   - "inline"  → aro chico para botones/tarjetas
 */

import { LoadingSpinner } from "../LoadingSpinner";

interface Props {
  variant?: "page" | "section" | "inline";
  /** Texto opcional de loading (default depende del variant). */
  label?: string;
  className?: string;
}

const SIZES: Record<NonNullable<Props["variant"]>, number> = {
  page: 64,
  section: 44,
  inline: 24,
};

export function PaicheLoading({ variant = "section", label, className = "" }: Props) {
  const size = SIZES[variant];
  const texto = label ?? "Cargando";

  if (variant === "inline") {
    return (
      <div className={`inline-flex items-center justify-center ${className}`} role="status" aria-label={texto}>
        <LoadingSpinner size={size} />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 ${
        variant === "page" ? "min-h-screen bg-[var(--surface-canvas)]" : "py-12 sm:py-16"
      } ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <LoadingSpinner size={size} />
      <p
        className={`font-semibold text-[var(--text-secondary)] ${
          variant === "page" ? "text-base" : "text-sm"
        }`}
      >
        {texto}
      </p>
    </div>
  );
}

export default PaicheLoading;
