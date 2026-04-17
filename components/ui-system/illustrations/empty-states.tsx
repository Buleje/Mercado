"use client";

/**
 * Ilustraciones Buleje — Empty States
 *
 * Estilo: Notion-inspired monochrome line-art con "wobble humano" en las curvas.
 * - viewBox 200x200 estandar
 * - stroke-width 1.5 (currentColor adapta dark/light)
 * - 80% empty space alrededor de la composicion principal
 * - Sin gradientes, sin sombras
 * - Cada <200 bytes de path data — ultra livianas
 */

interface IllustrationProps extends React.SVGAttributes<SVGSVGElement> {
  className?: string;
  /** Tamaño en px — default 160 */
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

/** Canasta vacía — mujer con canasta curioseando. Uso: favoritos vacío, carrito vacío. */
export function CanastaVacia({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Cabeza */}
      <circle cx="75" cy="55" r="14" />
      <path d="M73 51c-.5 1 .5 2 2 2s2.5-1 2-2" />
      <circle cx="70" cy="53" r=".5" fill="currentColor" />
      <circle cx="80" cy="53" r=".5" fill="currentColor" />
      {/* Cuerpo */}
      <path d="M65 68c-2 4-4 14-3 28" />
      <path d="M85 68c2 4 4 14 3 28" />
      {/* Brazo sosteniendo asa canasta */}
      <path d="M87 90c8 2 14 8 18 14" />
      {/* Canasta vacia */}
      <path d="M100 108c2-6 12-8 20-6" />
      <ellipse cx="130" cy="135" rx="28" ry="8" />
      <path d="M102 135v25c0 4 3 7 7 7h42c4 0 7-3 7-7v-25" />
      {/* Asa */}
      <path d="M110 135c0-8 4-14 10-14M150 135c0-8-4-14-10-14" />
      {/* Lineas vacio (hollow) */}
      <path d="M118 145v10M130 145v10M142 145v10" opacity="0.3" />
      {/* Piernas */}
      <path d="M70 100v35" />
      <path d="M80 100v35" />
    </svg>
  );
}

/** Pedido llegando — moto delivery en curva con caja. Uso: mis-pedidos vacío. */
export function PedidoLlegando({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Ruedas */}
      <circle cx="55" cy="145" r="15" />
      <circle cx="140" cy="145" r="15" />
      <circle cx="55" cy="145" r="3" />
      <circle cx="140" cy="145" r="3" />
      {/* Cuadro moto */}
      <path d="M55 145l18-25 50-5 17 30" />
      <path d="M72 120l10-25h10" />
      {/* Asiento */}
      <path d="M85 110h40" />
      {/* Piloto (silueta simple) */}
      <circle cx="110" cy="82" r="9" />
      <path d="M105 91l-5 15M115 91l8 12" />
      <path d="M103 96c-3 4-5 10-5 18" />
      {/* Caja delivery */}
      <rect x="130" y="95" width="30" height="28" rx="2" />
      <path d="M130 105h30" />
      <path d="M145 95v10" />
      {/* Lineas de velocidad */}
      <path d="M30 80h18M35 100h15M25 115h18" opacity="0.45" />
      {/* Camino curva */}
      <path d="M20 165c40-4 80 0 160-8" opacity="0.4" strokeDasharray="3 4" />
    </svg>
  );
}

/** Lupa confundida — lupa con signo "?" humano. Uso: search no results. */
export function LupaConfundida({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Circulo lupa */}
      <circle cx="95" cy="85" r="42" />
      {/* Mango */}
      <path d="M126 116l28 28" />
      <path d="M150 140l12 12" strokeWidth="3" strokeLinecap="round" />
      {/* Cara dentro lupa */}
      <circle cx="85" cy="80" r="1" fill="currentColor" />
      <circle cx="105" cy="80" r="1" fill="currentColor" />
      {/* Boca confundida (pequeña línea) */}
      <path d="M88 98q4 2 10 0" />
      {/* Signo interrogación arriba */}
      <path d="M85 45q0-8 8-8 8 0 8 8 0 4-4 6-4 2-4 6" strokeLinecap="round" />
      <circle cx="93" cy="65" r="1" fill="currentColor" />
      {/* Lineas "moviendo" */}
      <path d="M50 60l6-5M140 60l-6-5M50 110l6 5" opacity="0.4" />
    </svg>
  );
}

/** Cuaderno abierto — cuaderno con "Fiado" y líneas. Uso: /mi-credito empty. */
export function CuadernoAbierto({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Cuaderno abierto (dos páginas) */}
      <path d="M30 60q20 -8 70 4v90q-50 -12 -70 -4z" />
      <path d="M170 60q-20 -8 -70 4v90q50 -12 70 -4z" />
      {/* Espiral */}
      <path d="M100 64v90" strokeDasharray="1.5 4" />
      {/* Líneas página izquierda */}
      <path d="M45 80h45M45 92h40M45 104h45M45 116h35" opacity="0.45" />
      {/* Lápiz encima */}
      <path d="M118 40l40 40" strokeWidth="3" strokeLinecap="round" />
      <path d="M155 77l8 8l-4 4l-8-8z" />
      <path d="M118 40l-4 4l-3-3l4-4l3 3z" />
      {/* Check marca — "pagado" vacío */}
      <circle cx="130" cy="110" r="8" opacity="0.4" />
      <path d="M126 110l3 3l7-7" opacity="0.4" />
    </svg>
  );
}

/** Olla vacía — olla con cuchara sin ingredientes. Uso: recetas empty. */
export function OllaVacia({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Olla */}
      <path d="M40 85h120l-10 80q-1 6 -7 6h-86q-6 0 -7 -6z" />
      {/* Tapa levantada a un lado */}
      <path d="M35 85h130" />
      <path d="M130 55q4 0 4 6v20" opacity="0.5" />
      <ellipse cx="130" cy="52" rx="18" ry="5" opacity="0.5" />
      <path d="M130 45v4" opacity="0.5" />
      {/* Asas */}
      <path d="M30 95c-6 0-10-5-10-10" />
      <path d="M170 95c6 0 10-5 10-10" />
      {/* Cuchara dentro */}
      <path d="M90 95v50" />
      <ellipse cx="90" cy="150" rx="8" ry="4" />
      {/* Vapor (vacío, solo 2 líneas suaves) */}
      <path d="M75 70q-3-8 0-16M95 65q-3-8 0-14" opacity="0.3" />
    </svg>
  );
}

/** Estante vacío — rack de bodega sin productos. Uso: out of stock. */
export function EstanteVacio({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Estructura estante */}
      <path d="M35 40v130M165 40v130" />
      <path d="M35 40h130" />
      <path d="M35 80h130M35 120h130M35 160h130" />
      {/* Patas */}
      <path d="M30 170h10M160 170h10" />
      {/* Etiquetas vacías en cada estante */}
      <rect x="50" y="65" width="18" height="10" opacity="0.4" />
      <rect x="90" y="65" width="18" height="10" opacity="0.4" />
      <rect x="130" y="65" width="18" height="10" opacity="0.4" />
      <rect x="50" y="105" width="18" height="10" opacity="0.4" />
      <rect x="90" y="105" width="18" height="10" opacity="0.4" />
      {/* Tela polvo (líneas onduladas) */}
      <path d="M60 50q5 2 10 0t10 0t10 0t10 0t10 0" opacity="0.3" />
      {/* Signo "sin stock" */}
      <circle cx="135" cy="135" r="10" opacity="0.5" />
      <path d="M130 130l10 10M140 130l-10 10" opacity="0.5" />
    </svg>
  );
}

/** Frasco con estrellas — frasco vacío "colectá puntos". Uso: /puntos zero balance. */
export function FrascoEstrellas({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Frasco contorno */}
      <path d="M70 55h60" />
      <path d="M75 55v15h-5c-4 0-6 3-6 7v76c0 4 3 7 7 7h58c4 0 7-3 7-7v-76c0-4-2-7-6-7h-5v-15" />
      {/* Liquido vacio (solo fondo sutil) */}
      <path d="M68 140q32 -6 64 0" opacity="0.3" />
      {/* Una sola estrellita dentro (solitaria) */}
      <path d="M100 155l2 5h5l-4 3l1 5l-4-3l-4 3l1-5l-4-3h5z" opacity="0.5" />
      {/* Estrellas cayendo afuera */}
      <path d="M40 40l1.5 3h3l-2.5 2l1 3l-3-2l-3 2l1-3l-2.5-2h3z" />
      <path d="M160 50l1.2 2.5h2.5l-2 1.5l.8 2.5l-2.5-1.5l-2.5 1.5l.8-2.5l-2-1.5h2.5z" />
      <path d="M35 90l1 2.5h2.5l-2 1.5l.7 2.5l-2.2-1.5l-2.2 1.5l.7-2.5l-2-1.5h2.5z" opacity="0.5" />
      {/* Flechas guía hacia el frasco */}
      <path d="M45 55q20 8 22 18" strokeDasharray="2 3" opacity="0.4" />
    </svg>
  );
}

/** Balanza vacía — compare empty. */
export function BalanzaVacia({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Pilar central */}
      <path d="M100 50v110" />
      {/* Base */}
      <path d="M70 160h60" strokeWidth="3" strokeLinecap="round" />
      <path d="M85 170h30" />
      {/* Barra horizontal */}
      <path d="M40 60h120" />
      {/* Cuerdas */}
      <path d="M50 60v18M150 60v18" />
      {/* Platos */}
      <path d="M30 80h40l-6 14q-1 2 -3 2h-22q-2 0 -3-2z" />
      <path d="M130 80h40l-6 14q-1 2 -3 2h-22q-2 0 -3-2z" />
      {/* Vacío (sin objetos, solo sombra sutil) */}
      <path d="M40 85h20M140 85h20" opacity="0.3" />
      {/* Pivot */}
      <circle cx="100" cy="60" r="4" />
    </svg>
  );
}

/** Mensajero buscando señal — offline state. */
export function MensajeronBuscando({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Persona silueta */}
      <circle cx="90" cy="60" r="12" />
      <path d="M80 72c-4 8-8 18-7 32" />
      <path d="M100 72c4 8 8 18 7 32" />
      {/* Cuerpo */}
      <path d="M82 105l-8 35M98 105l8 35" />
      {/* Celular en mano (levantado) */}
      <path d="M106 104l30-18" />
      <rect x="130" y="55" width="20" height="36" rx="3" transform="rotate(25 140 73)" />
      {/* Señal "buscando" (ondas semi-abiertas) */}
      <path d="M155 40q8 -4 16 2" opacity="0.6" />
      <path d="M160 28q14 -6 26 4" opacity="0.3" />
      {/* X pequeña cerca del celular (no hay señal) */}
      <path d="M150 50l4 4M154 50l-4 4" opacity="0.6" strokeWidth="1.5" />
      {/* Expresión pensativa */}
      <circle cx="86" cy="58" r=".5" fill="currentColor" />
      <circle cx="94" cy="58" r=".5" fill="currentColor" />
      <path d="M86 66q4 1 8 0" />
    </svg>
  );
}

/** Conexión cortada — error network. */
export function ConexionCortada({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Cable extremo izq */}
      <path d="M20 100q25 0 50 -10" />
      <path d="M68 85q4 -2 8 0v20q-4 2 -8 0z" />
      {/* Cable extremo der */}
      <path d="M180 100q-25 0 -50 10" />
      <path d="M132 95q-4 2 -8 0v20q4 2 8 0z" />
      {/* Brecha (líneas de "corte") */}
      <path d="M80 95l40 10M80 105l40-10" opacity="0.6" />
      {/* Chispas */}
      <path d="M95 75l5 10M105 82l-3 8M100 65v8" opacity="0.6" />
      {/* Símbolo X sutil centro */}
      <circle cx="100" cy="130" r="10" opacity="0.4" />
      <path d="M95 125l10 10M105 125l-10 10" opacity="0.5" />
      {/* Wifi apagado arriba */}
      <path d="M80 45q20 -12 40 0" opacity="0.3" />
      <path d="M88 55q12 -8 24 0" opacity="0.3" />
      <circle cx="100" cy="62" r="1.5" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

// ── Exports agrupados ─────────────────────────────────────────────
export const EMPTY_ILLUSTRATIONS = {
  canastaVacia: CanastaVacia,
  pedidoLlegando: PedidoLlegando,
  lupaConfundida: LupaConfundida,
  cuadernoAbierto: CuadernoAbierto,
  ollaVacia: OllaVacia,
  estanteVacio: EstanteVacio,
  frascoEstrellas: FrascoEstrellas,
  balanzaVacia: BalanzaVacia,
  mensajeronBuscando: MensajeronBuscando,
  conexionCortada: ConexionCortada,
} as const;

export type EmptyIllustrationKey = keyof typeof EMPTY_ILLUSTRATIONS;
