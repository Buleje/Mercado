"use client";

/**
 * Ilustraciones Buleje — Contextuales (errores, tracking, especiales).
 * Estilo: Notion monochrome stroke 1.5 + currentColor.
 */

interface IllustrationProps extends React.SVGAttributes<SVGSVGElement> {
  className?: string;
  size?: number;
  strokeWidth?: number;
}

const baseProps = (size: number, strokeWidth: number) => ({
  viewBox: "0 0 200 200",
  width: size,
  height: size,
  fill: "none",
  stroke: "currentColor",
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
});

/** Bodega abriendo — persiana levantándose. Uso: apply wizard step 1. */
export function BodegaAbriendo({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Estructura bodega */}
      <path d="M35 85v90h130V85" />
      <path d="M30 85h140l-10-20h-120z" />
      {/* Letrero */}
      <rect x="60" y="68" width="80" height="10" opacity="0.5" />
      {/* Persiana levantada (segmentos) */}
      <path d="M45 110h110M45 120h110M45 130h110" opacity="0.3" />
      {/* Puerta abierta debajo */}
      <path d="M50 175v-35h100v35" />
      <path d="M85 175v-35M115 175v-35" opacity="0.4" />
      {/* Rayo de sol saliendo del interior */}
      <path d="M100 175v-30" opacity="0.5" />
      <path d="M85 175q15 -20 30 0" opacity="0.3" />
      {/* Cuerda de persiana */}
      <path d="M170 65v45" opacity="0.5" />
      <circle cx="170" cy="112" r="3" fill="currentColor" opacity="0.5" />
      {/* Luz matinal */}
      <path d="M30 50q-10 0 -12 -8M160 50q10 0 12 -8" opacity="0.4" />
      {/* Sol */}
      <circle cx="30" cy="35" r="10" opacity="0.4" />
      <path d="M30 18v6M30 46v6M10 35h6M44 35h6M17 21l4 4M43 49l-4-4M43 21l-4 4M17 49l4-4" opacity="0.3" />
    </svg>
  );
}

/** Corazón latiendo — wishlist saved. */
export function CorazonLatiendo({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Corazón central */}
      <path d="M100 165q-50 -30 -50 -70q0-25 25 -25q15 0 25 15q10-15 25-15q25 0 25 25q0 40 -50 70z" />
      {/* Línea ECG dentro */}
      <path d="M55 105h15l8 -18l10 36l8 -24l10 12l8 -6h20" />
      {/* Latidos pulsando radiales */}
      <circle cx="100" cy="105" r="55" opacity="0.25" strokeDasharray="3 6" />
      <circle cx="100" cy="105" r="75" opacity="0.15" strokeDasharray="3 6" />
      {/* Mini corazones floating */}
      <path d="M30 35q-2 -4 -5 -2q-3 2 0 6l5 4l5-4q3-4 0-6q-3-2-5 2z" opacity="0.5" />
      <path d="M172 50q-1.5 -3 -4 -1q-2.5 1 0 4l4 3l4-3q2.5-3 0-4q-2.5-1-4 1z" opacity="0.4" />
    </svg>
  );
}

/** Moto ruta — tracking page. Línea curva que se dibuja. */
export function MotoRuta({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Punto A (bodega) */}
      <circle cx="35" cy="140" r="10" />
      <path d="M30 140l5 -6l5 6" />
      <path d="M32 145h6" />
      {/* Punto B (cliente) */}
      <path d="M165 40c0 -10 -6 -16 -14 -16s-14 6 -14 16c0 10 14 22 14 22s14 -12 14 -22z" />
      <circle cx="151" cy="40" r="4" fill="currentColor" />
      {/* Ruta curva */}
      <path d="M45 140q30 -40 60 -40q40 0 50 -50" strokeDasharray="4 5" opacity="0.6" />
      {/* Moto a mitad de ruta */}
      <g transform="translate(90 90)">
        <circle cx="-10" cy="6" r="6" />
        <circle cx="10" cy="6" r="6" />
        <path d="M-10 6l4 -10h12l4 10" />
        <path d="M-6 -4l-4 -10" />
        <circle cx="6" cy="-18" r="4" />
      </g>
      {/* Marcador tiempo */}
      <rect x="120" y="75" width="50" height="16" rx="8" opacity="0.6" />
      <path d="M128 83q-2 -2 0 -4q2 -2 4 0q2 2 0 4z" opacity="0.7" />
      <path d="M138 83h20" opacity="0.7" />
    </svg>
  );
}

/** Brújula perdida — 404. */
export function BrujulaPerdida({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Círculo exterior */}
      <circle cx="100" cy="100" r="60" />
      {/* Marcas cardinales */}
      <path d="M100 45v8M100 147v8M45 100h8M147 100h8" />
      <text x="100" y="68" textAnchor="middle" fontSize="10" fill="currentColor" fontFamily="monospace">N</text>
      <text x="100" y="140" textAnchor="middle" fontSize="10" fill="currentColor" fontFamily="monospace">S</text>
      {/* Aguja girando aleatoria */}
      <path d="M100 100l-18 -8l18 -35l18 35z" transform="rotate(45 100 100)" />
      <circle cx="100" cy="100" r="4" fill="currentColor" />
      {/* Signo ? pequeño arriba */}
      <path d="M100 28q0 -8 8 -8 8 0 8 8 0 4 -4 6 -4 2 -4 6" opacity="0.5" strokeLinecap="round" />
      <circle cx="108" cy="48" r="1" fill="currentColor" opacity="0.5" />
      {/* Lineas perdidas */}
      <path d="M30 60l8 -2M170 60l-8 -2M30 140l8 2M170 140l-8 2" opacity="0.4" />
    </svg>
  );
}

// ── Exports agrupados ─────────────────────────────────────────────
export const CONTEXTUAL_ILLUSTRATIONS = {
  bodegaAbriendo: BodegaAbriendo,
  corazonLatiendo: CorazonLatiendo,
  motoRuta: MotoRuta,
  brujulaPerdida: BrujulaPerdida,
} as const;

export type ContextualIllustrationKey = keyof typeof CONTEXTUAL_ILLUSTRATIONS;
