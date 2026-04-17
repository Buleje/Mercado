"use client";

/**
 * Ilustraciones Buleje — Success Moments & Celebrations
 *
 * Uso: post-checkout, level up, welcome, onboarding done, first purchase.
 * Mismo estilo que empty-states (stroke 1.5, currentColor, 80% empty space).
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

/** Bodeguero celebrando — brazos arriba + sonrisa. Uso: post-checkout, vendor first sale. */
export function BodegueroCelebrando({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Cabeza */}
      <circle cx="100" cy="70" r="16" />
      {/* Ojos cerrados felices */}
      <path d="M92 68q3 -3 6 0M102 68q3 -3 6 0" />
      {/* Sonrisa grande */}
      <path d="M92 76q8 6 16 0" />
      {/* Mandil (triangular inferior) */}
      <path d="M85 95q-6 14 -8 50h46q-2-36-8-50" />
      <path d="M90 95l20 0M85 105h30" />
      {/* Brazos levantados (celebrating) */}
      <path d="M83 95l-22 -30" />
      <path d="M117 95l22 -30" />
      {/* Manos (puños) */}
      <circle cx="58" cy="62" r="5" />
      <circle cx="142" cy="62" r="5" />
      {/* Rayos/destellos alrededor */}
      <path d="M45 40l-8-8M155 40l8-8M35 75l-10-4M165 75l10-4" opacity="0.55" />
      <path d="M30 50l-5-2M170 50l5-2" opacity="0.4" />
      {/* Piernas */}
      <path d="M92 145v25M108 145v25" />
    </svg>
  );
}

/** Caja feliz — paquete con carita. Uso: order placed, confirmación. */
export function CajaFeliz({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Caja 3D simple */}
      <path d="M50 75l50 -20l50 20v65l-50 20l-50-20z" />
      {/* Linea de pegado */}
      <path d="M50 75l50 20l50-20" />
      <path d="M100 95v65" />
      {/* Cinta adhesiva horizontal */}
      <path d="M50 108h100" opacity="0.6" />
      <path d="M100 55v40" opacity="0.6" />
      {/* Cara */}
      <circle cx="84" cy="125" r="1" fill="currentColor" />
      <circle cx="116" cy="125" r="1" fill="currentColor" />
      <path d="M92 135q8 6 16 0" />
      {/* Manos sosteniendose */}
      <path d="M60 130q-4 4 -6 10M140 130q4 4 6 10" opacity="0.7" />
      {/* Corazones flotando */}
      <path d="M30 50q-2 -4 -5 -2q-3 2 0 6l5 4l5-4q3-4 0-6q-3-2-5 2z" opacity="0.6" />
      <path d="M170 65q-1.5 -3 -4 -1.5q-2.5 1.5 0 4.5l4 3l4-3q2.5-3 0-4.5q-2.5-1.5-4 1.5z" opacity="0.5" />
    </svg>
  );
}

/** Salamander saludando — mascot Pucallpa amazónico. Uso: welcome modal. */
export function SalamanderSaludando({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Cuerpo curvado (salamandra) */}
      <path d="M40 110q10 -20 40 -18q30 2 50 10q20 8 35 -2" />
      {/* Cabeza */}
      <ellipse cx="40" cy="110" rx="14" ry="10" />
      <circle cx="35" cy="107" r=".8" fill="currentColor" />
      <path d="M30 113q4 2 8 0" />
      {/* Patitas delanteras */}
      <path d="M72 120l-2 10M80 122l-2 10" />
      <path d="M68 130q-2 2 -2 4M78 132q-2 2 -2 4" />
      {/* Patitas traseras */}
      <path d="M110 125l-2 10M120 125l-2 10" />
      <path d="M106 135q-2 2 -2 4M116 135q-2 2 -2 4" />
      {/* Cola (con upwards curl saludando) */}
      <path d="M140 108q20 -6 30 -25q6-10 -4 -14" />
      {/* Hojas amazónicas atrás */}
      <path d="M55 75q-10 -15 -20 -15M75 65q-6 -12 -15 -14" opacity="0.5" />
      <path d="M150 70q10 -14 20 -10" opacity="0.5" />
      {/* Burbuja saludo */}
      <circle cx="155" cy="45" r="18" opacity="0.5" />
      <path d="M150 45q5 5 10 0q-2 -4 -6 -4q-4 0 -4 4z" opacity="0.6" />
    </svg>
  );
}

/** Trofeo evolving — trofeo con rayos. Uso: level up loyalty. */
export function TrofeoEvolving({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Copa */}
      <path d="M70 55h60" />
      <path d="M72 55v40q0 18 28 22q28 -4 28 -22v-40" />
      {/* Asas */}
      <path d="M72 65q-18 0 -18 15q0 14 18 14" />
      <path d="M128 65q18 0 18 15q0 14 -18 14" />
      {/* Base */}
      <path d="M92 120v18h16v-18" />
      <path d="M80 138h40" />
      <path d="M70 150h60" strokeWidth="3" />
      <path d="M85 160h30" />
      {/* Estrella en centro de copa */}
      <path d="M100 75l3 6l7 1l-5 5l1 7l-6-4l-6 4l1-7l-5-5l7-1z" />
      {/* Rayos de celebración */}
      <path d="M40 30l5 8M155 30l-5 8M25 55l10 2M175 55l-10 2M30 85l10 -2M170 85l-10 -2" opacity="0.6" />
      <path d="M50 15l3 6M150 15l-3 6M20 100l8 -3M180 100l-8 -3" opacity="0.4" />
    </svg>
  );
}

/** Pisco botella burbujas — upgrade plan. */
export function PiscoBotella({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Botella */}
      <path d="M88 35h24v30l6 12v90q0 5 -5 5h-26q-5 0-5-5v-90l6-12z" />
      {/* Tapa */}
      <path d="M92 25h16v10h-16z" />
      {/* Label */}
      <rect x="80" y="95" width="40" height="28" opacity="0.5" />
      <path d="M85 105h30M85 112h20" opacity="0.6" />
      {/* Líquido nivel */}
      <path d="M85 130q15 -4 30 0" opacity="0.4" />
      {/* Burbujas saliendo */}
      <circle cx="100" cy="60" r="2" opacity="0.5" />
      <circle cx="95" cy="48" r="1.5" opacity="0.4" />
      <circle cx="105" cy="45" r="1.2" opacity="0.4" />
      <circle cx="100" cy="20" r="1" opacity="0.3" />
      {/* Rayos éxito */}
      <path d="M30 60l6 6M170 60l-6 6M40 90l6-4M160 90l-6-4" opacity="0.6" />
      {/* Sombra suelo */}
      <ellipse cx="100" cy="175" rx="30" ry="4" opacity="0.3" />
    </svg>
  );
}

/** Campana sonando — vendor first sale. */
export function CampanaRinging({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Campana */}
      <path d="M65 120q0 -55 35 -60q35 5 35 60" />
      <path d="M60 120h80l-4 12h-72z" />
      {/* Badajo dentro */}
      <path d="M100 125v15" />
      <circle cx="100" cy="143" r="4" fill="currentColor" />
      {/* Asa superior */}
      <path d="M100 60v-15" />
      <circle cx="100" cy="42" r="4" />
      {/* Ondas de sonido (alternadas) */}
      <path d="M40 100q-5 -6 -5 -15" opacity="0.6" />
      <path d="M30 95q-8 -10 -8 -22" opacity="0.4" />
      <path d="M160 100q5 -6 5 -15" opacity="0.6" />
      <path d="M170 95q8 -10 8 -22" opacity="0.4" />
      {/* Ondas laterales bajas */}
      <path d="M45 135q-6 4 -10 12" opacity="0.5" />
      <path d="M155 135q6 4 10 12" opacity="0.5" />
      {/* Estrella pequeña izquierda */}
      <path d="M55 50l1.5 3h3l-2.5 2l1 3l-3-2l-3 2l1-3l-2.5-2h3z" opacity="0.7" />
    </svg>
  );
}

// ── Exports agrupados ─────────────────────────────────────────────
export const SUCCESS_ILLUSTRATIONS = {
  bodegueroCelebrando: BodegueroCelebrando,
  cajaFeliz: CajaFeliz,
  salamanderSaludando: SalamanderSaludando,
  trofeoEvolving: TrofeoEvolving,
  piscoBotella: PiscoBotella,
  campanaRinging: CampanaRinging,
} as const;

export type SuccessIllustrationKey = keyof typeof SUCCESS_ILLUSTRATIONS;
