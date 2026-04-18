"use client";

/**
 * Ilustraciones Buleje — Categorías de tienda (ADR-065).
 * Estilo: Notion monochrome stroke 1.5 + currentColor, viewBox 0 0 200 200.
 * Hereda color del contexto (accent teal activo, gray secondary inactivo).
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

/** VerduraFresca — zanahoria + hoja + arveja. Categoría frutas y verduras. */
export function VerduraFresca({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Zanahoria cuerpo */}
      <path d="M80 90q-4 30 -10 55q-6 20 15 20q20 0 15 -20q-6 -25 -10 -55" />
      {/* Líneas textura zanahoria */}
      <path d="M75 115h20M73 135h23M71 155h27" opacity="0.35" />
      {/* Hojas zanahoria */}
      <path d="M80 90q-12 -12 -16 -28q10 0 18 10" opacity="0.7" />
      <path d="M90 88q-2 -18 4 -34q6 16 4 34" opacity="0.7" />
      <path d="M100 90q10 -12 24 -18q-2 12 -14 24" opacity="0.7" />
      {/* Hoja de lechuga lateral */}
      <path d="M130 115q20 -4 32 8q4 14 -10 22q-18 8 -30 -6q-4 -14 8 -24z" opacity="0.6" />
      <path d="M138 120q6 6 8 14M148 118q2 8 0 18" opacity="0.35" />
      {/* Arvejas (círculos) */}
      <path d="M35 120q-2 -10 8 -12q10 -2 14 6q4 8 -4 14q-8 6 -18 -8z" opacity="0.6" />
      <circle cx="42" cy="120" r="2.5" fill="currentColor" opacity="0.5" />
      <circle cx="50" cy="123" r="2.5" fill="currentColor" opacity="0.5" />
      {/* Hojita decorativa suelo */}
      <path d="M20 175q6 -2 12 0M170 170q6 0 10 4" opacity="0.3" />
    </svg>
  );
}

/** CarniceriaFresca — pieza de carne con hueso + cuchillo. Categoría carnes. */
export function CarniceriaFresca({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Pieza de carne (forma orgánica) */}
      <path d="M55 95q-5 -25 20 -30q15 -3 30 0q25 5 30 22q5 20 -10 35q-15 15 -40 12q-25 -3 -30 -18q-3 -10 0 -21z" />
      {/* Hueso saliente izquierda */}
      <path d="M55 95q-10 0 -14 -8q-3 -6 2 -10q5 -4 10 0q3 3 0 6q3 3 6 0q5 -2 8 0" opacity="0.7" />
      <circle cx="48" cy="90" r="3" opacity="0.5" />
      {/* Hueso saliente derecha */}
      <path d="M135 108q10 4 14 12q2 6 -3 9q-6 3 -10 -2q-2 -3 1 -5q-3 -3 -6 -1" opacity="0.7" />
      <circle cx="150" cy="118" r="3" opacity="0.5" />
      {/* Marmoleado (líneas internas) */}
      <path d="M75 100q10 8 20 4M85 115q12 4 20 -2M95 130q8 0 14 -4" opacity="0.3" />
      {/* Cuchillo diagonal */}
      <path d="M30 40l40 40" opacity="0.6" />
      <path d="M30 40l-8 -8l-4 12l12 4z" opacity="0.7" />
      <path d="M70 80l5 -3l-5 -5l-3 5z" opacity="0.5" />
      {/* Gota goteo (fresco) */}
      <path d="M100 160q-3 5 0 10q3 -5 0 -10z" opacity="0.4" fill="currentColor" />
      <path d="M130 165q-2 3 0 6q2 -3 0 -6z" opacity="0.4" fill="currentColor" />
    </svg>
  );
}

/** LacteosRefresh — botella de leche + queso en cubo. Categoría lácteos. */
export function LacteosRefresh({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Botella leche (cuello + cuerpo) */}
      <path d="M70 45h25v18l8 10v85q0 8 -8 8h-25q-8 0 -8 -8v-85l8 -10z" />
      {/* Línea separación cuello */}
      <path d="M62 73h41" />
      {/* Etiqueta leche */}
      <rect x="66" y="105" width="33" height="26" opacity="0.5" />
      <path d="M72 115h21M72 122h15" opacity="0.4" />
      {/* Gota dentro */}
      <path d="M82 140q-4 6 0 12q4 -6 0 -12z" opacity="0.3" fill="currentColor" />
      {/* Queso (triángulo isométrico) */}
      <path d="M115 130l35 -12l10 15l-10 30l-35 10z" />
      <path d="M115 130l10 15l-10 30M125 145l35 -12M125 145v30" opacity="0.5" />
      {/* Huecos del queso */}
      <circle cx="135" cy="150" r="3" opacity="0.6" />
      <circle cx="148" cy="158" r="2.5" opacity="0.6" />
      <circle cx="132" cy="168" r="2" opacity="0.6" />
      {/* Partícula fresca */}
      <path d="M45 55q-3 -3 0 -6q3 3 0 6z" opacity="0.4" fill="currentColor" />
      <path d="M160 75q-2 -2 0 -4q2 2 0 4z" opacity="0.4" fill="currentColor" />
    </svg>
  );
}

/** BebidasVarias — botella + lata + vaso con líquido. Categoría bebidas. */
export function BebidasVarias({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Botella (izq) */}
      <path d="M40 60h16v14q8 4 8 14v70q0 8 -8 8h-16q-8 0 -8 -8v-70q0 -10 8 -14z" />
      <path d="M40 60v-12h16v12" />
      {/* Líquido botella */}
      <path d="M32 110h32v50q0 6 -6 6h-20q-6 0 -6 -6z" opacity="0.25" fill="currentColor" />
      {/* Lata (centro) */}
      <rect x="80" y="75" width="32" height="80" rx="3" />
      <path d="M80 85h32M80 145h32" opacity="0.5" />
      {/* Anillo lata */}
      <circle cx="96" cy="80" r="2" opacity="0.5" />
      <path d="M90 78h12" opacity="0.4" />
      {/* Etiqueta lata (círculo) */}
      <circle cx="96" cy="115" r="10" opacity="0.4" />
      {/* Vaso con líquido (der) */}
      <path d="M128 90l3 70q0 5 5 5h18q5 0 5 -5l3 -70z" />
      {/* Líquido en vaso */}
      <path d="M130 115l2 45q0 3 3 3h18q3 0 3 -3l2 -45z" opacity="0.25" fill="currentColor" />
      {/* Línea líquido (nivel) */}
      <path d="M130 115h30" opacity="0.5" />
      {/* Popote */}
      <path d="M148 90v-18" opacity="0.7" />
      {/* Burbujas flotantes */}
      <circle cx="50" cy="40" r="3" opacity="0.5" />
      <circle cx="62" cy="30" r="2" opacity="0.5" />
      <circle cx="96" cy="55" r="3" opacity="0.5" />
      <circle cx="144" cy="50" r="2.5" opacity="0.5" />
    </svg>
  );
}

/** LimpiezaDomicilio — escoba + botella spray + burbujas. Categoría limpieza. */
export function LimpiezaDomicilio({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Escoba — mango diagonal */}
      <path d="M35 170l80 -115" />
      {/* Escoba — cerdas (triángulo abierto) */}
      <path d="M110 50l30 10l-22 22z" />
      <path d="M115 55l3 25M125 55l-2 22M133 58l-8 20" opacity="0.5" />
      {/* Botella spray */}
      <path d="M60 85h28v18q6 4 6 12v48q0 6 -6 6h-28q-6 0 -6 -6v-48q0 -8 6 -12z" />
      <path d="M60 85v-10h28v10" />
      {/* Gatillo spray */}
      <path d="M88 98l14 -4q4 -1 4 3v6" opacity="0.7" />
      <path d="M106 103v10" opacity="0.6" />
      {/* Etiqueta spray */}
      <rect x="62" y="125" width="24" height="30" opacity="0.5" />
      <path d="M68 133h14M68 140h10M68 147h12" opacity="0.4" />
      {/* Gotita spray saliendo */}
      <path d="M116 108q4 -3 8 -3q4 0 8 3" opacity="0.4" strokeDasharray="2 3" />
      {/* Burbujas flotantes (limpieza) */}
      <circle cx="150" cy="115" r="6" opacity="0.5" />
      <circle cx="148" cy="113" r="1.5" fill="currentColor" opacity="0.4" />
      <circle cx="165" cy="135" r="4" opacity="0.5" />
      <circle cx="140" cy="140" r="3" opacity="0.4" />
      <circle cx="155" cy="155" r="5" opacity="0.45" />
      <circle cx="153" cy="153" r="1.2" fill="currentColor" opacity="0.4" />
      <circle cx="30" cy="50" r="3" opacity="0.4" />
    </svg>
  );
}

// ── Exports agrupados ─────────────────────────────────────────────
export const CATEGORY_ILLUSTRATIONS = {
  verduraFresca: VerduraFresca,
  carniceriaFresca: CarniceriaFresca,
  lacteosRefresh: LacteosRefresh,
  bebidasVarias: BebidasVarias,
  limpiezaDomicilio: LimpiezaDomicilio,
} as const;

export type CategoryIllustrationKey = keyof typeof CATEGORY_ILLUSTRATIONS;
