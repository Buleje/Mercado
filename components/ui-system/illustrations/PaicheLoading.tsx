/**
 * PaicheLoading — nombre histórico; hoy pantalla/bloque = `CargaPagina` del DS
 * (número 1→100 + barra fina, sin texto a la vista; Brandon 2026-10-17: «una
 * carga del 1 al 100 minimalista, aplícalo a todo»). Se conserva el nombre y
 * las variantes para no tocar a quienes lo usan (BulejeLoader delega acá).
 *
 * Variantes:
 *   - "page"    → pantalla completa (loading.tsx)
 *   - "section" → bloque medio para fallbacks de Suspense
 *   - "inline"  → aro chico para botones/tarjetas (carga local, no de página)
 */

import { CargaPagina } from "@buleje/design-system/carga-pagina";
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

  // `label` sigue llegando de los loading.tsx: ahora sólo lo oye el lector de pantalla.
  return (
    <CargaPagina
      modo={variant === "page" ? "pantalla" : "bloque"}
      etiqueta={texto}
      className={className || undefined}
    />
  );
}

export default PaicheLoading;
