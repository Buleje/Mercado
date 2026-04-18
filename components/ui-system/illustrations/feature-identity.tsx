/**
 * Ilustraciones Buleje — Feature Identity (ENRICH-4)
 *
 * Ilustraciones custom SVG para identidad visual de features específicas
 * del marketplace y la cuenta del cliente.
 *
 * Estilo: Notion monochrome line-art con wobble humano en curvas.
 * - viewBox 200x200 estandar
 * - stroke-width 1.5 (currentColor adapta dark/light)
 * - Sin gradientes, sin sombras
 * - Server-safe: sin hooks, solo props (no "use client")
 * - Tokens DS: currentColor + var(--accent)/var(--data-success) opcionales
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

/**
 * GiftCardIlustrada — Sobre abriendo con una card dentro, confetti sutil.
 * Uso: /cuenta/gift-cards empty state, hero del hub gift cards.
 * Transmite: regalo desempacándose.
 */
export function GiftCardIlustrada({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Sobre — tapa semi-abierta */}
      <path d="M35 85l65 -32l65 32v70q0 5 -5 5h-120q-5 0 -5 -5z" fill="currentColor" opacity="0.06" />
      <path d="M35 85l65 -32l65 32v70q0 5 -5 5h-120q-5 0 -5 -5z" />
      {/* Tapa abierta (rotada ligeramente) */}
      <g transform="rotate(-4 100 70)">
        <path d="M35 85l65 -50l65 50" opacity="0.6" />
      </g>
      {/* Triángulos interiores del sobre */}
      <path d="M35 155l50 -40M165 155l-50 -40" opacity="0.4" strokeDasharray="2 3" />
      {/* Card saliendo del sobre (rotada) */}
      <g transform="rotate(-5 100 100)">
        {/* Card base */}
        <path d="M55 65q45 -4 90 0v55q-45 4 -90 0z" fill="currentColor" opacity="0.12" />
        <path d="M55 65q45 -4 90 0v55q-45 4 -90 0z" />
        {/* "GIFT" letras */}
        <text x="68" y="85" fontFamily="sans-serif" fontSize="8" fill="currentColor" fontWeight="bold" opacity="0.8">GIFT</text>
        {/* Monto simulado */}
        <text x="68" y="105" fontFamily="serif" fontSize="11" fill="currentColor" fontWeight="bold">S/ 50</text>
        {/* Line decoración card */}
        <path d="M68 112l60 0" opacity="0.35" strokeDasharray="2 2" />
        {/* Ícono moño card */}
        <g transform="translate(128 78)">
          <path d="M-4 -3q-3 3 0 6M4 -3q3 3 0 6" strokeWidth={strokeWidth * 0.9} />
          <circle cx="0" cy="0" r="2" fill="currentColor" opacity="0.6" />
        </g>
      </g>
      {/* Moño grande arriba del sobre (firma visual) */}
      <g transform="translate(100 40)">
        <path d="M-10 0q-5 -6 0 -10q6 -3 8 2" />
        <path d="M10 0q5 -6 0 -10q-6 -3 -8 2" />
        <circle cx="0" cy="0" r="3" fill="currentColor" opacity="0.3" />
        <path d="M-2 2l-3 10M2 2l3 10" opacity="0.7" />
      </g>
      {/* Confetti sutil alrededor */}
      <path d="M25 40l4 -4M175 45l-4 -4M28 130l5 0M172 130l-5 0" opacity="0.5" strokeWidth={strokeWidth * 0.9} />
      <circle cx="20" cy="75" r="1.5" fill="currentColor" opacity="0.5" />
      <circle cx="180" cy="75" r="1.5" fill="currentColor" opacity="0.5" />
      <circle cx="15" cy="110" r="1.2" fill="currentColor" opacity="0.4" />
      <circle cx="185" cy="110" r="1.2" fill="currentColor" opacity="0.4" />
      <path d="M165 28l3 3M30 28l-3 3" opacity="0.5" />
      {/* Estrellita */}
      <path d="M170 165l1 -3l1 3l3 1l-3 1l-1 3l-1 -3l-3 -1z" opacity="0.55" fill="currentColor" />
      <path d="M30 165l1 -3l1 3l3 1l-3 1l-1 3l-1 -3l-3 -1z" opacity="0.55" fill="currentColor" />
    </svg>
  );
}

/**
 * SocioCorona — Corona minimalista tipo line-art con detalle shipibo.
 * Uso: /socio-buleje hero + badge Socio en PDP.
 * Transmite: membresía con identidad local.
 */
export function SocioCorona({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Base aro — sutilmente ovalada (no círculo perfecto) */}
      <ellipse cx="100" cy="130" rx="55" ry="8" fill="currentColor" opacity="0.1" />
      <path d="M45 128q55 -6 110 0q0 8 0 10q-55 6 -110 0z" fill="currentColor" opacity="0.12" />
      <path d="M45 128q55 -6 110 0q0 8 0 10q-55 6 -110 0z" />
      {/* Patrón shipibo en banda base (kené) */}
      <path d="M55 133l4 -2l4 2l4 -2l4 2l4 -2l4 2l4 -2l4 2l4 -2l4 2l4 -2l4 2l4 -2l4 2l4 -2l4 2l4 -2l4 2l4 -2l4 2" opacity="0.5" strokeWidth={strokeWidth * 0.8} />
      {/* Picos corona — 5 puntas */}
      <path d="M50 128l10 -55l15 35l25 -55l25 55l15 -35l10 55" />
      {/* Joyas en picos (gemas) */}
      <circle cx="60" cy="75" r="3" fill="currentColor" opacity="0.3" />
      <circle cx="60" cy="75" r="3" />
      <circle cx="100" cy="55" r="4" fill="currentColor" opacity="0.3" />
      <circle cx="100" cy="55" r="4" />
      <circle cx="140" cy="75" r="3" fill="currentColor" opacity="0.3" />
      <circle cx="140" cy="75" r="3" />
      {/* Joya central — destacada con sparkle */}
      <path d="M95 55l5 -5l5 5l-5 5z" opacity="0.55" />
      <path d="M100 38l2 6l-2 6l-2 -6z" opacity="0.5" />
      {/* Rombos shipibo adorno picos laterales */}
      <path d="M75 110l3 -3l3 3l-3 3z" opacity="0.6" />
      <path d="M125 110l3 -3l3 3l-3 3z" opacity="0.6" />
      {/* Brillos sparkle alrededor */}
      <path d="M30 50l3 -3l3 3l-3 3z" opacity="0.55" fill="currentColor" />
      <path d="M165 55l3 -3l3 3l-3 3z" opacity="0.55" fill="currentColor" />
      <path d="M22 100l5 0M178 100l-5 0" opacity="0.4" />
      <path d="M32 30l3 3M168 30l-3 3" opacity="0.4" />
      {/* Línea base refuerzo (suelo implícito) */}
      <path d="M40 150q60 -3 120 0" opacity="0.3" strokeDasharray="3 4" />
      {/* Detalle micro trazo shipibo en picos centrales */}
      <path d="M87 90l0 5M113 90l0 5" opacity="0.45" strokeWidth={strokeWidth * 0.8} />
    </svg>
  );
}

/**
 * VideoEnVivo — Cámara line-art con chip "EN VIVO" pulsante, fondo bodega.
 * Uso: /marketplace/en-vivo hero y empty state.
 * Transmite: transmisión en tiempo real.
 */
export function VideoEnVivo({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Pantalla fondo (bodega sugerida) */}
      <rect x="30" y="55" width="140" height="90" rx="6" fill="currentColor" opacity="0.05" />
      <rect x="30" y="55" width="140" height="90" rx="6" />
      {/* Interior bodega — anaqueles */}
      <path d="M50 135h100M50 120h100M50 105h100" opacity="0.3" strokeDasharray="2 3" />
      {/* Siluetas productos en anaquel */}
      <rect x="55" y="122" width="8" height="13" opacity="0.3" />
      <rect x="68" y="125" width="6" height="10" opacity="0.3" />
      <rect x="80" y="120" width="9" height="15" opacity="0.3" />
      <rect x="95" y="124" width="7" height="11" opacity="0.3" />
      <rect x="110" y="121" width="8" height="14" opacity="0.3" />
      <rect x="125" y="123" width="7" height="12" opacity="0.3" />
      <rect x="138" y="122" width="8" height="13" opacity="0.3" />
      {/* Silueta bodeguero al centro */}
      <circle cx="100" cy="85" r="6" />
      <path d="M94 90q0 15 6 18q6 -3 6 -18" />
      {/* Cámara/videocámara frontal */}
      <g transform="translate(100 30)">
        {/* Cuerpo cámara */}
        <rect x="-18" y="-8" width="36" height="20" rx="2" fill="currentColor" opacity="0.12" />
        <rect x="-18" y="-8" width="36" height="20" rx="2" />
        {/* Lente */}
        <circle cx="-5" cy="2" r="6" fill="currentColor" opacity="0.15" />
        <circle cx="-5" cy="2" r="6" />
        <circle cx="-5" cy="2" r="3" />
        <circle cx="-5" cy="2" r="1" fill="currentColor" />
        {/* Mini indicador */}
        <circle cx="12" cy="-3" r="1.5" fill="currentColor" />
        {/* Mango */}
        <path d="M-18 10l-5 5v6l8 0" opacity="0.7" />
      </g>
      {/* Chip EN VIVO pulsante */}
      <g transform="translate(135 65)">
        {/* Badge pill */}
        <rect x="-22" y="-8" width="44" height="16" rx="8" fill="currentColor" opacity="0.12" />
        <rect x="-22" y="-8" width="44" height="16" rx="8" />
        {/* Punto rojo pulsante */}
        <circle cx="-14" cy="0" r="3" fill="currentColor" />
        {/* Pulse rings */}
        <circle cx="-14" cy="0" r="5" opacity="0.3" strokeDasharray="1 1" />
        <circle cx="-14" cy="0" r="7" opacity="0.2" strokeDasharray="1 2" />
        {/* Texto LIVE */}
        <text x="-6" y="3" fontFamily="sans-serif" fontSize="8" fill="currentColor" fontWeight="bold">LIVE</text>
      </g>
      {/* Ondas de transmisión */}
      <path d="M15 90q-6 10 0 20" opacity="0.5" />
      <path d="M10 85q-10 15 0 30" opacity="0.35" strokeDasharray="2 3" />
      <path d="M185 90q6 10 0 20" opacity="0.5" />
      <path d="M190 85q10 15 0 30" opacity="0.35" strokeDasharray="2 3" />
      {/* Chat bubbles flotando (comentarios) */}
      <g transform="translate(40 165)">
        <path d="M0 0q0 -5 5 -5l10 0q5 0 5 5q0 5 -5 5l-8 0l-4 4l1 -4q-4 -1 -4 -5z" fill="currentColor" opacity="0.1" />
        <path d="M0 0q0 -5 5 -5l10 0q5 0 5 5q0 5 -5 5l-8 0l-4 4l1 -4q-4 -1 -4 -5z" />
      </g>
      <g transform="translate(155 170)">
        <path d="M0 0q0 -4 4 -4l8 0q4 0 4 4q0 4 -4 4l-6 0l-3 3l1 -3q-4 -1 -4 -4z" fill="currentColor" opacity="0.1" />
        <path d="M0 0q0 -4 4 -4l8 0q4 0 4 4q0 4 -4 4l-6 0l-3 3l1 -3q-4 -1 -4 -4z" />
      </g>
    </svg>
  );
}

/**
 * ComparandoTres — 3 frutas/productos alineados con línea de medida debajo.
 * Uso: /marketplace/comparar hero y empty state.
 * Transmite: comparación lado a lado.
 */
export function ComparandoTres({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Superficie/estante */}
      <path d="M20 140q80 -3 160 0" strokeWidth={strokeWidth * 1.1} />
      <path d="M15 145q85 -3 170 0" opacity="0.3" />
      {/* Producto 1 — botella (izq) */}
      <g transform="translate(50 120) rotate(-2)">
        <path d="M-5 -40h10v15q3 4 3 10l0 35q0 3 -3 3h-10q-3 0 -3 -3l0 -35q0 -6 3 -10z" fill="currentColor" opacity="0.08" />
        <path d="M-5 -40h10v15q3 4 3 10l0 35q0 3 -3 3h-10q-3 0 -3 -3l0 -35q0 -6 3 -10z" />
        {/* Tapa */}
        <path d="M-4 -45h8v5h-8z" />
        {/* Label */}
        <path d="M-6 -10h12v14h-12z" opacity="0.18" />
        <path d="M-6 -10h12v14h-12z" />
        <path d="M-4 -4l8 0M-4 0l6 0" opacity="0.55" strokeWidth={strokeWidth * 0.75} />
      </g>
      {/* Producto 2 — caja (centro, más alta) */}
      <g transform="translate(100 115)">
        <path d="M-20 -55l40 0l0 70l-40 0z" fill="currentColor" opacity="0.1" />
        <path d="M-20 -55l40 0l0 70l-40 0z" />
        {/* Tapa 3D */}
        <path d="M-20 -55l6 -8l40 0l-6 8" />
        <path d="M20 -55l6 -8l0 70l-6 8" opacity="0.55" />
        {/* Label */}
        <path d="M-16 -30h32v16h-32z" opacity="0.18" />
        <path d="M-16 -30h32v16h-32z" />
        <path d="M-14 -24l28 0M-14 -20l20 0" opacity="0.55" strokeWidth={strokeWidth * 0.75} />
        {/* Estrella destacado "best" */}
        <g transform="translate(18 -45)">
          <path d="M0 -5l1 3l3 0l-2 2l1 3l-3 -2l-3 2l1 -3l-2 -2l3 0z" fill="currentColor" opacity="0.65" />
        </g>
      </g>
      {/* Producto 3 — lata (der) */}
      <g transform="translate(152 120) rotate(3)">
        <path d="M-10 -35q10 -3 20 0l0 50q-10 3 -20 0z" fill="currentColor" opacity="0.08" />
        <path d="M-10 -35q10 -3 20 0l0 50q-10 3 -20 0z" />
        {/* Tapa superior */}
        <ellipse cx="0" cy="-35" rx="10" ry="3" />
        {/* Label */}
        <path d="M-10 -15q10 -3 20 0l0 18q-10 3 -20 0z" opacity="0.15" />
        <path d="M-10 -15q10 -3 20 0l0 18q-10 3 -20 0z" />
        {/* Abridor */}
        <circle cx="0" cy="-34" r="1.5" fill="currentColor" opacity="0.5" />
      </g>
      {/* Línea de medida debajo con ticks */}
      <path d="M30 165l0 5M50 165l0 3M70 165l0 5M100 165l0 5M130 165l0 5M150 165l0 3M170 165l0 5" strokeWidth={strokeWidth * 0.9} />
      <path d="M30 170l140 0" strokeWidth={strokeWidth * 1.1} />
      {/* Labels precio mini */}
      <text x="40" y="185" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.6">S/5</text>
      <text x="90" y="185" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.6">S/8</text>
      <text x="140" y="185" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.6">S/6</text>
      {/* Badge "vs" entre productos */}
      <g transform="translate(75 85)">
        <circle cx="0" cy="0" r="6" fill="currentColor" opacity="0.12" />
        <circle cx="0" cy="0" r="6" />
        <text x="-3.5" y="2" fontFamily="monospace" fontSize="6" fill="currentColor" fontWeight="bold">vs</text>
      </g>
      <g transform="translate(127 85)">
        <circle cx="0" cy="0" r="6" fill="currentColor" opacity="0.12" />
        <circle cx="0" cy="0" r="6" />
        <text x="-3.5" y="2" fontFamily="monospace" fontSize="6" fill="currentColor" fontWeight="bold">vs</text>
      </g>
      {/* Check en centro (ganador sugerido) */}
      <g transform="translate(100 40)">
        <circle cx="0" cy="0" r="5" fill="currentColor" opacity="0.2" />
        <path d="M-2.5 0l2 2l3 -3.5" strokeWidth={strokeWidth * 1.1} />
      </g>
    </svg>
  );
}

/**
 * RepartidorMoto — Moto con repartidor en ruta + mini mapa de fondo.
 * Uso: /seguimiento y confirmación de pedido.
 * Transmite: tu pedido en camino.
 */
export function RepartidorMoto({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Fondo mapa sugerido (grid sutil) */}
      <path d="M10 40h180M10 80h180M10 120h180M10 160h180" opacity="0.12" strokeDasharray="2 4" />
      <path d="M40 10v180M80 10v180M120 10v180M160 10v180" opacity="0.12" strokeDasharray="2 4" />
      {/* Calle principal curva (ruta destacada) */}
      <path d="M15 165q30 -15 60 -20q30 -5 60 -30q20 -10 50 -15" strokeWidth={strokeWidth * 1.4} opacity="0.5" strokeDasharray="5 4" />
      {/* Origen — punto de partida (bodega) */}
      <g transform="translate(20 165)">
        <circle cx="0" cy="0" r="5" fill="currentColor" />
        <circle cx="0" cy="0" r="10" opacity="0.3" />
        {/* Casita mini */}
        <path d="M-8 -10l8 -6l8 6l0 10l-16 0z" fill="currentColor" opacity="0.15" />
      </g>
      {/* Destino — pin + casa */}
      <g transform="translate(180 100)">
        {/* Pin teardrop */}
        <path d="M0 -15q-8 0 -8 8q0 6 8 14q8 -8 8 -14q0 -8 -8 -8z" fill="currentColor" opacity="0.2" />
        <path d="M0 -15q-8 0 -8 8q0 6 8 14q8 -8 8 -14q0 -8 -8 -8z" />
        <circle cx="0" cy="-7" r="2.5" />
        {/* Pulsación destino */}
        <circle cx="0" cy="-7" r="10" opacity="0.25" strokeDasharray="2 3" />
      </g>
      {/* Moto en ruta (centro) */}
      <g transform="translate(100 115)">
        {/* Sombra moto */}
        <ellipse cx="0" cy="32" rx="35" ry="3" opacity="0.2" fill="currentColor" />
        {/* Ruedas */}
        <circle cx="-25" cy="25" r="10" />
        <circle cx="25" cy="25" r="10" />
        <circle cx="-25" cy="25" r="3" fill="currentColor" />
        <circle cx="25" cy="25" r="3" fill="currentColor" />
        {/* Cuadro moto */}
        <path d="M-25 25l15 -25l30 -2l10 25" />
        <path d="M-10 0l8 -18l8 0" />
        <path d="M25 23l-2 -20" />
        {/* Tanque */}
        <path d="M-5 -8q12 -3 20 0q2 5 0 12l-22 0q-2 -5 2 -12z" fill="currentColor" opacity="0.1" />
        <path d="M-5 -8q12 -3 20 0q2 5 0 12l-22 0q-2 -5 2 -12z" />
        {/* Repartidor */}
        <path d="M0 -18q-2 -8 3 -14q8 -4 14 0q4 8 -1 18" />
        {/* Casco */}
        <ellipse cx="12" cy="-28" rx="10" ry="10" fill="currentColor" opacity="0.15" />
        <ellipse cx="12" cy="-28" rx="10" ry="10" />
        {/* Visor casco */}
        <path d="M4 -30q9 -3 14 0q0 3 0 4q-7 3 -13 0z" fill="currentColor" opacity="0.3" />
        {/* Caja delivery atrás */}
        <rect x="28" y="-12" width="22" height="20" rx="2" fill="currentColor" opacity="0.1" />
        <rect x="28" y="-12" width="22" height="20" rx="2" />
        {/* Logo en caja */}
        <path d="M34 -5l4 -4l4 4l0 8l-8 0z" opacity="0.5" />
        {/* Correa caja */}
        <path d="M28 -3h22" opacity="0.5" />
        {/* Líneas velocidad atrás */}
        <path d="M-35 -5h-8M-40 5h-10M-38 15h-6" opacity="0.4" strokeWidth={strokeWidth * 0.8} />
      </g>
      {/* Icono tiempo/ETA mini */}
      <g transform="translate(155 45)">
        <circle cx="0" cy="0" r="8" fill="currentColor" opacity="0.08" />
        <circle cx="0" cy="0" r="8" />
        <path d="M0 -4v4l3 2" />
      </g>
      {/* Árbol de vegetación sugerido */}
      <g transform="translate(42 60)">
        <path d="M0 0l0 8" strokeWidth={strokeWidth * 1.1} />
        <circle cx="0" cy="-4" r="5" fill="currentColor" opacity="0.12" />
        <circle cx="0" cy="-4" r="5" opacity="0.7" />
      </g>
    </svg>
  );
}

/**
 * CalendarioEntrega — Calendario con día marcado + flecha recurrente.
 * Uso: Bodega al Mes (suscripciones) empty state + mini-hero.
 * Transmite: entregas programadas recurrentes.
 */
export function CalendarioEntrega({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Calendario cuerpo */}
      <path d="M30 60q70 -3 140 0l0 110q0 5 -5 5l-130 0q-5 0 -5 -5z" fill="currentColor" opacity="0.05" />
      <path d="M30 60q70 -3 140 0l0 110q0 5 -5 5l-130 0q-5 0 -5 -5z" />
      {/* Header calendario */}
      <path d="M30 60q70 -3 140 0l0 20l-140 0z" fill="currentColor" opacity="0.15" />
      <path d="M30 60q70 -3 140 0l0 20l-140 0z" />
      {/* Texto mes */}
      <text x="75" y="76" fontFamily="sans-serif" fontSize="9" fill="currentColor" fontWeight="bold" opacity="0.9">ABRIL</text>
      {/* Anillas/ganchos arriba */}
      <path d="M50 50v15M80 50v15M120 50v15M150 50v15" strokeWidth={strokeWidth * 1.3} />
      <circle cx="50" cy="50" r="3" fill="currentColor" opacity="0.5" />
      <circle cx="80" cy="50" r="3" fill="currentColor" opacity="0.5" />
      <circle cx="120" cy="50" r="3" fill="currentColor" opacity="0.5" />
      <circle cx="150" cy="50" r="3" fill="currentColor" opacity="0.5" />
      {/* Grid días (4x5) */}
      <path d="M45 95h115M45 120h115M45 145h115" opacity="0.3" />
      <path d="M65 85v75M85 85v75M105 85v75M125 85v75M145 85v75" opacity="0.3" />
      {/* Números días (sutil) */}
      <text x="52" y="108" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.5">1</text>
      <text x="72" y="108" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.5">2</text>
      <text x="92" y="108" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.5">3</text>
      <text x="112" y="108" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.5">4</text>
      <text x="132" y="108" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.5">5</text>
      <text x="152" y="108" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.5">6</text>
      <text x="52" y="133" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.5">7</text>
      <text x="72" y="133" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.5">8</text>
      <text x="92" y="133" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.5">9</text>
      <text x="112" y="133" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.5">10</text>
      <text x="152" y="133" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.5">12</text>
      {/* Día marcado central (15) — círculo destacado */}
      <circle cx="118" cy="133" r="8" fill="currentColor" opacity="0.85" />
      <text x="114" y="136" fontFamily="monospace" fontSize="6" fill="var(--surface-canvas,#fff)" fontWeight="bold">15</text>
      {/* Día recurrente siguiente (22) — círculo sutil */}
      <circle cx="90" cy="158" r="6" opacity="0.5" strokeDasharray="2 2" />
      <text x="86" y="161" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.75">22</text>
      {/* Flecha recurrente conectando los días */}
      <path d="M126 133q15 5 15 15q0 10 -45 15" strokeDasharray="3 3" opacity="0.65" />
      <path d="M98 162l-5 0l2 -3" strokeLinecap="round" />
      {/* Icono caja/paquete esquina (delivery) */}
      <g transform="translate(170 105)">
        <path d="M-10 -5l10 -5l10 5l0 12l-10 5l-10 -5z" fill="currentColor" opacity="0.1" />
        <path d="M-10 -5l10 -5l10 5l0 12l-10 5l-10 -5z" />
        <path d="M-10 -5l10 5l10 -5M0 0v12" opacity="0.55" />
      </g>
      {/* Repeat icon badge */}
      <g transform="translate(30 115)">
        <circle cx="0" cy="0" r="8" fill="currentColor" opacity="0.1" />
        <circle cx="0" cy="0" r="8" />
        <path d="M-3 -2q0 -4 4 -4l3 0l-2 -2M3 2q0 4 -4 4l-3 0l2 2" strokeWidth={strokeWidth * 0.9} />
      </g>
      {/* Checkmarks sutiles en días ya entregados */}
      <path d="M55 103l2 2l3 -4" opacity="0.45" strokeWidth={strokeWidth * 0.9} />
      <path d="M75 103l2 2l3 -4" opacity="0.45" strokeWidth={strokeWidth * 0.9} />
      <path d="M95 103l2 2l3 -4" opacity="0.45" strokeWidth={strokeWidth * 0.9} />
    </svg>
  );
}

/**
 * AsistenteBuleje — Icono bot amigable con burbuja de diálogo.
 * Uso: /asistente y widget IA.
 * Transmite: asistente AI accesible.
 */
export function AsistenteBuleje({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Cabeza bot (rounded square no-genérico) */}
      <path d="M55 55q0 -12 12 -12l66 0q12 0 12 12l0 60q0 12 -12 12l-66 0q-12 0 -12 -12z" fill="currentColor" opacity="0.08" />
      <path d="M55 55q0 -12 12 -12l66 0q12 0 12 12l0 60q0 12 -12 12l-66 0q-12 0 -12 -12z" />
      {/* Antena */}
      <path d="M100 43v-12" strokeWidth={strokeWidth * 1.2} />
      <circle cx="100" cy="28" r="4" fill="currentColor" opacity="0.2" />
      <circle cx="100" cy="28" r="4" />
      {/* Ondas antena (ping) */}
      <path d="M92 20q8 -6 16 0M88 15q12 -9 24 0" opacity="0.45" />
      {/* Ojos bot amigables */}
      <circle cx="80" cy="80" r="7" fill="currentColor" opacity="0.12" />
      <circle cx="80" cy="80" r="7" />
      <circle cx="80" cy="80" r="2" fill="currentColor" />
      {/* Brillo ojo */}
      <circle cx="77" cy="77" r="1.5" fill="currentColor" opacity="0.35" />
      <circle cx="120" cy="80" r="7" fill="currentColor" opacity="0.12" />
      <circle cx="120" cy="80" r="7" />
      <circle cx="120" cy="80" r="2" fill="currentColor" />
      <circle cx="117" cy="77" r="1.5" fill="currentColor" opacity="0.35" />
      {/* Boca sonriente */}
      <path d="M86 100q14 8 28 0" />
      {/* Mejillas sutiles */}
      <path d="M68 95q-3 -2 -3 2" opacity="0.4" />
      <path d="M132 95q3 -2 3 2" opacity="0.4" />
      {/* Botón pecho (chip center) */}
      <circle cx="100" cy="118" r="3" fill="currentColor" opacity="0.3" />
      <circle cx="100" cy="118" r="3" />
      {/* Brazos sugeridos */}
      <path d="M55 90q-8 5 -10 14M145 90q8 5 10 14" opacity="0.65" />
      <circle cx="43" cy="105" r="3" opacity="0.55" />
      <circle cx="157" cy="105" r="3" opacity="0.55" />
      {/* Burbuja diálogo */}
      <g transform="translate(155 55)">
        {/* Bubble */}
        <path d="M0 0q0 -10 10 -10l22 0q10 0 10 10l0 15q0 10 -10 10l-17 0l-6 8l1 -8q-10 0 -10 -10z" fill="currentColor" opacity="0.1" />
        <path d="M0 0q0 -10 10 -10l22 0q10 0 10 10l0 15q0 10 -10 10l-17 0l-6 8l1 -8q-10 0 -10 -10z" />
        {/* Dots thinking */}
        <circle cx="13" cy="7" r="1.5" fill="currentColor" opacity="0.7" />
        <circle cx="21" cy="7" r="1.5" fill="currentColor" opacity="0.5" />
        <circle cx="29" cy="7" r="1.5" fill="currentColor" opacity="0.3" />
      </g>
      {/* Base (donde está parado) */}
      <path d="M70 140q30 -2 60 0l5 10q-35 4 -70 0z" fill="currentColor" opacity="0.15" />
      <path d="M70 140q30 -2 60 0l5 10q-35 4 -70 0z" />
      {/* Sombra circular debajo */}
      <ellipse cx="100" cy="160" rx="40" ry="4" opacity="0.25" fill="currentColor" />
      {/* Estrellas/sparkles AI */}
      <path d="M35 45l2 -5l2 5l5 2l-5 2l-2 5l-2 -5l-5 -2z" opacity="0.55" fill="currentColor" />
      <path d="M170 140l1.5 -3l1.5 3l3 1l-3 1l-1.5 3l-1.5 -3l-3 -1z" opacity="0.55" fill="currentColor" />
      <path d="M30 130l1 -2l1 2l2 1l-2 1l-1 2l-1 -2l-2 -1z" opacity="0.55" fill="currentColor" />
    </svg>
  );
}

/**
 * SellerCentralBodega — Dueño bodega con laptop abierta mostrando dashboard.
 * Uso: /vender y /vender/mi-tienda.
 * Transmite: control total del negocio con BSM.
 */
export function SellerCentralBodega({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Mesa / escritorio */}
      <path d="M15 155q85 -3 170 0l0 8q-85 3 -170 0z" fill="currentColor" opacity="0.15" />
      <path d="M15 155q85 -3 170 0l0 8q-85 3 -170 0z" />
      {/* Laptop — base */}
      <path d="M50 145q50 -3 100 0q5 0 5 5l0 5q-55 3 -110 0l0 -5q0 -5 5 -5z" fill="currentColor" opacity="0.15" />
      <path d="M50 145q50 -3 100 0q5 0 5 5l0 5q-55 3 -110 0l0 -5q0 -5 5 -5z" />
      {/* Laptop — pantalla abierta */}
      <path d="M55 145l90 0l0 -55q0 -5 -5 -5l-80 0q-5 0 -5 5z" fill="currentColor" opacity="0.04" />
      <path d="M55 145l90 0l0 -55q0 -5 -5 -5l-80 0q-5 0 -5 5z" />
      {/* Dashboard en pantalla — KPIs (3 cards mini) */}
      <path d="M62 95l22 0l0 16l-22 0z" fill="currentColor" opacity="0.12" />
      <path d="M62 95l22 0l0 16l-22 0z" />
      <path d="M65 100l12 0M65 104l8 0M65 108l14 0" opacity="0.5" strokeWidth={strokeWidth * 0.7} />
      <path d="M89 95l22 0l0 16l-22 0z" fill="currentColor" opacity="0.12" />
      <path d="M89 95l22 0l0 16l-22 0z" />
      <path d="M92 100l12 0M92 104l14 0M92 108l10 0" opacity="0.5" strokeWidth={strokeWidth * 0.7} />
      <path d="M116 95l22 0l0 16l-22 0z" fill="currentColor" opacity="0.12" />
      <path d="M116 95l22 0l0 16l-22 0z" />
      <path d="M119 100l10 0M119 104l14 0M119 108l8 0" opacity="0.5" strokeWidth={strokeWidth * 0.7} />
      {/* Gráfico barras abajo */}
      <path d="M65 140l8 -12l8 8l8 -18l8 10l8 -5l8 -8l8 12l8 -3l8 -10" opacity="0.65" />
      {/* Barras */}
      <path d="M65 140l0 -6M73 140l0 -14M81 140l0 -8M89 140l0 -20M97 140l0 -10M105 140l0 -15M113 140l0 -9M121 140l0 -12M129 140l0 -18M137 140l0 -6" opacity="0.35" strokeWidth={strokeWidth * 0.85} />
      {/* Dueño/dueña bodeguero (detrás laptop) */}
      <g transform="translate(65 40)">
        {/* Cabeza */}
        <circle cx="0" cy="0" r="13" />
        {/* Pañuelo arriba */}
        <path d="M-12 -3q10 -9 24 -1" opacity="0.7" />
        {/* Ojos */}
        <circle cx="-4" cy="-1" r="0.8" fill="currentColor" />
        <circle cx="4" cy="-1" r="0.8" fill="currentColor" />
        {/* Sonrisa */}
        <path d="M-4 6q4 3 8 0" />
        {/* Cuerpo asomando */}
        <path d="M-10 13q0 10 10 10q10 0 10 -10" />
      </g>
      {/* Gráfico flotante "trending up" (ganancias) */}
      <g transform="translate(145 45)">
        <path d="M-15 10l6 -5l5 3l5 -8l8 -5" strokeWidth={strokeWidth * 1.1} />
        {/* Flecha up */}
        <path d="M9 -5l0 -5l-5 5" strokeWidth={strokeWidth * 1.1} />
        {/* Dots */}
        <circle cx="-15" cy="10" r="1.3" fill="currentColor" />
        <circle cx="-9" cy="5" r="1.3" fill="currentColor" />
        <circle cx="-4" cy="8" r="1.3" fill="currentColor" />
        <circle cx="1" cy="0" r="1.3" fill="currentColor" />
      </g>
      {/* Símbolo de sol/ganancia esquina */}
      <g transform="translate(30 35)">
        <circle cx="0" cy="0" r="5" fill="currentColor" opacity="0.2" />
        <circle cx="0" cy="0" r="5" />
        <text x="-3" y="2.5" fontFamily="monospace" fontSize="7" fill="currentColor" fontWeight="bold">$</text>
      </g>
      {/* Notifications mini — badge esquina superior laptop */}
      <g transform="translate(155 85)">
        <circle cx="0" cy="0" r="4" fill="currentColor" opacity="0.3" />
        <circle cx="0" cy="0" r="4" />
        <text x="-1.5" y="1.5" fontFamily="monospace" fontSize="5" fill="currentColor" fontWeight="bold">3</text>
      </g>
      {/* Taza café en escritorio (detalle humano) */}
      <g transform="translate(170 148)">
        <path d="M-5 -8q5 -1 10 0l0 8q0 3 -2 3l-6 0q-2 0 -2 -3z" fill="currentColor" opacity="0.15" />
        <path d="M-5 -8q5 -1 10 0l0 8q0 3 -2 3l-6 0q-2 0 -2 -3z" />
        <path d="M5 -4q4 0 4 3q0 3 -4 3" opacity="0.7" />
        {/* Vapor */}
        <path d="M-3 -12q2 -3 0 -5M0 -13q2 -3 0 -5M3 -12q2 -3 0 -5" opacity="0.35" strokeWidth={strokeWidth * 0.8} />
      </g>
      {/* Suelo punteado */}
      <path d="M10 175q85 -3 180 0" opacity="0.3" strokeDasharray="3 5" />
    </svg>
  );
}

// ── Exports agrupados ─────────────────────────────────────────────
export const FEATURE_IDENTITY_ILLUSTRATIONS = {
  giftCardIlustrada: GiftCardIlustrada,
  socioCorona: SocioCorona,
  videoEnVivo: VideoEnVivo,
  comparandoTres: ComparandoTres,
  repartidorMoto: RepartidorMoto,
  calendarioEntrega: CalendarioEntrega,
  asistenteBuleje: AsistenteBuleje,
  sellerCentralBodega: SellerCentralBodega,
} as const;

export type FeatureIdentityIllustrationKey = keyof typeof FEATURE_IDENTITY_ILLUSTRATIONS;
