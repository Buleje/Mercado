/**
 * LoadingSpinner — el indicador de carga de la app: un aro tenue con una estela
 * del color de acento que gira y una punta redonda.
 *
 * Reemplaza al paiche nadando (Brandon 2026-10-08: «pareciera que se trabó la
 * página»). Con «reducir movimiento» (Windows con las animaciones apagadas) la
 * regla global de globals.css congelaba al pez; este aro gira SIEMPRE: la clase
 * `.animate-cargando` está exceptuada ahí, igual que `.animate-ping`.
 *
 * Decorativo: quien lo usa pone el `role="status"` y el texto.
 */

import { cn } from "@/lib/utils";

interface Props {
  /** Diámetro en px. */
  size?: number;
  className?: string;
}

export function LoadingSpinner({ size = 48, className }: Props) {
  const grosor = Math.max(3, Math.round(size / 11));
  // Deja visible sólo el borde del círculo (un aro de `grosor` px).
  const aro = `radial-gradient(farthest-side, transparent calc(100% - ${grosor}px), currentColor calc(100% - ${grosor}px + 0.5px))`;

  return (
    <span
      aria-hidden
      className={cn("relative inline-block shrink-0 text-[var(--accent)]", className)}
      style={{ width: size, height: size }}
    >
      {/* Pista: el aro completo en tenue, para que se lea como «en curso» */}
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: "color-mix(in oklab, currentColor 14%, transparent)",
          mask: aro,
          WebkitMask: aro,
        }}
      />
      {/* Estela: de transparente a acento en sentido horario; la punta queda arriba */}
      <span className="animate-cargando absolute inset-0">
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, transparent 0deg, currentColor 360deg)",
            mask: aro,
            WebkitMask: aro,
          }}
        />
        <span
          className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-current"
          style={{ width: grosor, height: grosor }}
        />
      </span>
    </span>
  );
}

export default LoadingSpinner;
