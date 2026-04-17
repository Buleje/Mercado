"use client";

/**
 * Ilustraciones Buleje — Pucallpa Locals (ADR-067 Ola O)
 *
 * Personajes y elementos AUTÉNTICOS de Ucayali / Pucallpa.
 * Reemplazan las ilustraciones genéricas con identidad regional fuerte.
 *
 * Técnicas anti-IA-genérico aplicadas:
 * - Wobble micro en curvas (cada path con leve irregularidad humana)
 * - Líneas que no cierran 100% (brain completa via closure Gestalt)
 * - Rotación sutil en elementos (1-3° para feel hand-drawn)
 * - Trazos dobles ocasionales (imitación pluma apretada 2da vez)
 * - Proporciones imperfectas deliberadas (humano no trabaja con grid)
 *
 * Research base: illustration.app "over-polished AI audit" Feb 2026,
 * BUCK x Notion hand-drawn AI assistant, Fiveable Gestalt data viz 2026.
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

/**
 * Doña Elena — bodeguera mayor (50+) con mandil + pañuelo.
 * Uso: Hero admin, welcome bodegueros, success moments.
 * Transmite: "la bodeguera de siempre, de tu barrio"
 */
export function DoniaElena({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Cabeza — ligeramente ovalada, no círculo perfecto */}
      <path d="M85 38q15 -3 31 1q4 12 2 24q-3 10 -16 11q-14 -1 -17 -11q-3 -12 0 -25z" />
      {/* Pañuelo atado arriba — identidad */}
      <path d="M83 37q10 -8 33 -1l1 4q-17 -7 -32 1z" fill="currentColor" opacity="0.15" />
      <path d="M83 37q10 -8 33 -1" strokeWidth={strokeWidth * 1.1} />
      <path d="M118 34l5 -5l2 4l-4 3" />
      {/* Ojos pequeños amables */}
      <path d="M91 53q2 -1 3 0" strokeLinecap="round" />
      <path d="M107 53q2 -1 3 0" strokeLinecap="round" />
      {/* Sonrisa genuina (curva asimétrica) */}
      <path d="M94 64q5 4 13 3" />
      {/* Cuello corto */}
      <path d="M95 74v8M107 74v8" />
      {/* Mandil — delantal de bodega */}
      <path d="M73 85q-3 22 -4 60q21 6 62 0q-2 -38 -5 -60z" />
      {/* Amarrado mandil cintura */}
      <path d="M78 115q45 -2 48 0" strokeDasharray="1 2" opacity="0.6" />
      {/* Bolsillo frontal con cuaderno visible */}
      <rect x="88" y="125" width="24" height="18" rx="1.5" opacity="0.5" />
      <path d="M92 132h16M92 136h12" opacity="0.5" />
      {/* Brazos — uno cruzado otro al costado */}
      <path d="M72 95q-10 15 -5 32q5 8 14 5" />
      <path d="M128 95q8 20 -3 42" />
      {/* Mano con lápiz (bodeguera anota) */}
      <circle cx="125" cy="140" r="4" />
      <path d="M128 138l8 4" strokeWidth={strokeWidth * 1.2} />
      {/* Piernas — tipo falda larga, no pantalón */}
      <path d="M82 165q-3 15 -2 30" opacity="0.6" />
      <path d="M118 165q3 15 2 30" opacity="0.6" />
    </svg>
  );
}

/**
 * MotorizadoUcayali — repartidor en Yamaha YBR con casco naranja.
 * Uso: delivery tracking, repartidor onboarding, success pedido.
 * Transmite: "tu repartidor amigo, local, identificable"
 */
export function MotorizadoUcayali({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Ruedas — ligeramente ovaladas (movimiento) */}
      <ellipse cx="54" cy="150" rx="16" ry="15" />
      <ellipse cx="146" cy="150" rx="16" ry="15" />
      {/* Rayos sutiles (no todos perfectos) */}
      <path d="M54 135v-4M54 165v4M40 150h3M66 150h3" opacity="0.5" />
      <path d="M146 135v-4M146 165v4M132 150h3M158 150h3" opacity="0.5" />
      <circle cx="54" cy="150" r="3" fill="currentColor" />
      <circle cx="146" cy="150" r="3" fill="currentColor" />
      {/* Cuadro moto — Yamaha YBR típica */}
      <path d="M54 150l20 -30l48 -2l20 30" />
      <path d="M72 120l12 -30" />
      <path d="M122 118l-2 -28" />
      {/* Tanque */}
      <path d="M82 98q15 -5 30 0q3 6 0 14l-33 1q-2 -8 3 -15z" fill="currentColor" opacity="0.08" />
      <path d="M82 98q15 -5 30 0q3 6 0 14l-33 1q-2 -8 3 -15z" />
      {/* Manubrio */}
      <path d="M72 90q-6 -8 -12 -6M122 88q6 -8 12 -6" />
      {/* Piloto cuerpo */}
      <path d="M95 85q-3 -10 4 -18q10 -6 18 0q6 12 -1 22" />
      {/* Casco naranja (firma Pucallpa) */}
      <ellipse cx="110" cy="68" rx="14" ry="13" fill="currentColor" opacity="0.2" />
      <ellipse cx="110" cy="68" rx="14" ry="13" />
      {/* Visor casco */}
      <path d="M100 65q12 -4 18 0q1 4 0 6q-9 4 -17 0z" fill="currentColor" opacity="0.35" />
      {/* Antena radio (bodegas reales usan) */}
      <path d="M120 56l3 -10" strokeWidth={strokeWidth * 0.75} />
      <circle cx="123" cy="45" r="1.5" />
      {/* Caja delivery + correa */}
      <rect x="125" y="92" width="28" height="26" rx="2" />
      <path d="M125 102h28" />
      <path d="M139 92v10" />
      {/* Ethernet texture caja (palo cordel) */}
      <path d="M122 95l34 0M122 115l34 0" opacity="0.4" strokeDasharray="2 3" />
      {/* Líneas de velocidad izquierda */}
      <path d="M22 100h20M18 115h18M25 128h16" opacity="0.45" />
      {/* Camino punteado atrás */}
      <path d="M15 168q40 -2 90 -3q45 -1 80 0" opacity="0.35" strokeDasharray="2 5" />
    </svg>
  );
}

/**
 * CuadernoFiadoReal — cuaderno con anotaciones reales "Felipe 3 soles - paga lunes".
 * Uso: módulo fiados empty, transparency portal.
 * Transmite: autenticidad del sistema de crédito tradicional bodegueró.
 */
export function CuadernoFiadoReal({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Cuaderno — rotado sutilmente (imperfección) */}
      <g transform="rotate(-2 100 100)">
        {/* Tapa atrás */}
        <path d="M32 38l108 -3l3 115l-108 5z" fill="currentColor" opacity="0.08" />
        {/* Tapa frente */}
        <path d="M30 40l108 -3l3 115l-108 5z" />
        {/* Espiral dobleado */}
        <path d="M30 50q-4 2 -4 7q4 2 4 7" opacity="0.7" />
        <path d="M30 65q-4 2 -4 7q4 2 4 7" opacity="0.7" />
        <path d="M30 80q-4 2 -4 7q4 2 4 7" opacity="0.7" />
        <path d="M30 95q-4 2 -4 7q4 2 4 7" opacity="0.7" />
        <path d="M30 110q-4 2 -4 7q4 2 4 7" opacity="0.7" />
        {/* Etiqueta "FIADOS 2026" typo humana */}
        <path d="M55 55h42v12h-42z" opacity="0.15" />
        <text x="57" y="64" fontFamily="monospace" fontSize="8" fill="currentColor">FIADOS 2026</text>
        {/* Líneas horizontales */}
        <path d="M45 78l90 -2M45 92l90 -2M45 106l90 -2M45 120l90 -2M45 134l90 -2" opacity="0.25" />
        {/* Anotaciones scribbled (hand-writing simulada con paths) */}
        {/* "Felipe 3" */}
        <path d="M50 85q3 -4 5 0q2 3 -1 4q-3 1 -4 -3" strokeWidth={strokeWidth * 0.8} />
        <path d="M58 87q1 -3 2 -1q0 3 -1 2" strokeWidth={strokeWidth * 0.8} />
        <path d="M63 88q2 -1 3 1q-1 2 -2 1" strokeWidth={strokeWidth * 0.8} />
        <path d="M70 84q2 3 -1 5" strokeWidth={strokeWidth * 0.8} />
        {/* "3 soles" */}
        <text x="78" y="89" fontFamily="monospace" fontSize="6" fill="currentColor" opacity="0.75">S/3.00</text>
        {/* Tachado resolved */}
        <path d="M48 85l40 2" opacity="0.5" strokeWidth={strokeWidth * 0.6} />
        {/* "Rosa 8" */}
        <path d="M50 99q4 -3 6 0q-2 4 -5 3M58 100q1 -3 3 0q-1 3 -2 2M62 98q2 3 -1 4" strokeWidth={strokeWidth * 0.8} />
        <text x="78" y="103" fontFamily="monospace" fontSize="6" fill="currentColor" opacity="0.75">S/8.50</text>
        {/* "Carlos" - pending */}
        <path d="M50 113q3 -3 6 0q-2 4 -5 3M58 115q1 -2 3 -1M62 112q3 3 -1 5" strokeWidth={strokeWidth * 0.8} />
        <text x="78" y="117" fontFamily="monospace" fontSize="6" fill="currentColor">S/12.00</text>
        <text x="100" y="117" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.55">lunes</text>
      </g>
      {/* Lápiz descansando encima (rotado distinto) */}
      <g transform="rotate(25 160 55)">
        <path d="M120 40l40 0l5 8l-5 8l-40 0z" fill="currentColor" opacity="0.08" />
        <path d="M120 40l40 0l5 8l-5 8l-40 0z" />
        <path d="M155 48l10 0" strokeWidth={strokeWidth * 1.3} />
        <path d="M120 40l-4 4l0 8l4 4" />
      </g>
    </svg>
  );
}

/**
 * PaicheEnOlla — paiche (pescado amazónico) en olla con humo.
 * Uso: recetario empty, cocina regional.
 * Transmite: gastronomía auténtica Ucayali.
 */
export function PaicheEnOlla({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Humo irregular (wobble real) */}
      <path d="M65 50q-3 -8 2 -14q-2 -8 4 -12" opacity="0.4" />
      <path d="M85 42q-2 -6 3 -10q-1 -6 4 -9" opacity="0.4" />
      <path d="M105 48q-3 -9 2 -14q-1 -7 5 -11" opacity="0.4" />
      <path d="M125 50q-2 -7 3 -12q-1 -6 4 -10" opacity="0.4" />
      {/* Olla — ligeramente ovalada (no círculo perfecto) */}
      <path d="M40 90q60 -8 120 0l-8 70q-1 6 -7 6h-90q-6 0 -7 -6z" />
      {/* Borde olla */}
      <path d="M35 90q65 -10 130 0" strokeWidth={strokeWidth * 1.2} />
      {/* Asas */}
      <path d="M30 100q-8 -2 -10 -12" />
      <path d="M170 100q8 -2 10 -12" />
      {/* Paiche dentro (cuerpo alargado, escamas) */}
      <path d="M58 115q30 -10 80 0q10 12 0 20q-40 12 -80 -4q-5 -8 0 -16z" fill="currentColor" opacity="0.15" />
      <path d="M58 115q30 -10 80 0q10 12 0 20q-40 12 -80 -4q-5 -8 0 -16z" />
      {/* Ojo paiche */}
      <circle cx="68" cy="120" r="1.5" fill="currentColor" />
      {/* Escamas */}
      <path d="M85 118q5 4 0 8M95 118q5 4 0 8M105 118q5 4 0 8M115 118q5 4 0 8M125 120q4 3 0 7" opacity="0.55" />
      {/* Cola */}
      <path d="M135 115l8 -4l-2 10l4 4l-6 8" />
      {/* Cuchara de palo asomada */}
      <path d="M100 90v-15" strokeWidth={strokeWidth * 1.3} />
      <ellipse cx="100" cy="70" rx="6" ry="4" />
      <path d="M97 68q3 2 6 0" opacity="0.5" />
      {/* Fuego abajo (fogón tradicional) */}
      <path d="M60 170q5 -8 10 0q5 -8 10 0q5 -8 10 0q5 -8 10 0q5 -8 10 0q5 -8 10 0q5 -8 10 0" opacity="0.35" strokeWidth={strokeWidth * 0.8} />
    </svg>
  );
}

/**
 * MalocaAtardecer — maloca (casa amazónica tradicional) con atardecer.
 * Uso: hero about, regional identity, landing sections.
 * Transmite: arraigo cultural Ucayali.
 */
export function MalocaAtardecer({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Sol tras maloca (atardecer) */}
      <circle cx="100" cy="95" r="28" fill="currentColor" opacity="0.12" />
      <circle cx="100" cy="95" r="28" strokeDasharray="3 3" opacity="0.4" />
      {/* Rayos (imperfectos) */}
      <path d="M100 55v-8M100 135v8M62 95h-8M138 95h8M73 68l-5 -5M127 68l5 -5M73 122l-5 5M127 122l5 5" opacity="0.35" />
      {/* Maloca estructura base */}
      <path d="M50 145q50 -3 100 0v20h-100z" fill="currentColor" opacity="0.08" />
      <path d="M50 145q50 -3 100 0v20h-100z" />
      {/* Techo cónico paja — trazos múltiples */}
      <path d="M40 145l60 -55l60 55" />
      <path d="M48 145q12 -14 52 -50M152 145q-12 -14 -52 -50" opacity="0.55" />
      {/* Hojas de paja (trazos hand-drawn) */}
      <path d="M60 140l-4 -6M70 133l-3 -6M82 125l-3 -6M94 115l-3 -6M106 115l3 -6M118 125l3 -6M130 133l3 -6M140 140l4 -6" opacity="0.55" />
      {/* Entrada */}
      <path d="M88 165v-18q12 -4 24 0v18" fill="currentColor" opacity="0.12" />
      <path d="M88 165v-18q12 -4 24 0v18" />
      {/* Palmeras al costado */}
      <path d="M22 168l3 -35" />
      <path d="M25 133q-8 -5 -14 -2M25 135q-5 -12 4 -18M25 135q8 -3 14 -10M25 138q10 2 14 8" opacity="0.7" />
      <path d="M178 168l-3 -35" />
      <path d="M175 133q8 -5 14 -2M175 135q5 -12 -4 -18M175 135q-8 -3 -14 -10" opacity="0.7" />
      {/* Suelo — línea irregular (no perfecta) */}
      <path d="M15 180q45 -2 85 -1q45 -2 85 1" opacity="0.6" />
    </svg>
  );
}

/**
 * RioUcayali — curva característica del río con ribera.
 * Uso: hero backgrounds, scroll markers, SEO zona Pucallpa.
 * Transmite: geografía auténtica de la ciudad fluvial.
 */
export function RioUcayali({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Río curvo */}
      <path d="M10 50q40 20 60 50q20 30 60 30q30 0 60 20" strokeWidth={strokeWidth * 1.3} />
      <path d="M10 65q40 20 60 50q20 30 60 30q30 0 55 16" opacity="0.55" />
      <path d="M10 80q40 20 55 48q22 28 60 28q24 0 50 12" opacity="0.3" />
      {/* Bote tipico amazónico */}
      <g transform="rotate(-8 70 100)">
        <path d="M48 100q25 -3 50 0q-2 8 -4 10q-22 3 -42 0q-4 -3 -4 -10z" fill="currentColor" opacity="0.15" />
        <path d="M48 100q25 -3 50 0q-2 8 -4 10q-22 3 -42 0q-4 -3 -4 -10z" />
        <path d="M60 100l3 -8h20l3 8" />
        {/* Remo */}
        <path d="M88 95l12 -6l4 4l-12 8" />
      </g>
      {/* Ribera con vegetación (árboles sugeridos) */}
      <path d="M15 45q2 -6 6 -4M30 48q3 -8 8 -4M50 55q4 -10 9 -5" opacity="0.55" />
      <path d="M135 95q3 -7 8 -4M155 100q3 -8 7 -4M175 105q3 -6 7 -3" opacity="0.55" />
      {/* Casa ribereña pequeña */}
      <g transform="translate(160 70) rotate(-3)">
        <path d="M0 0l12 -8l12 8v12h-24z" fill="currentColor" opacity="0.12" />
        <path d="M0 0l12 -8l12 8v12h-24z" />
        <path d="M8 12h8v-6" />
      </g>
      {/* Pez saltando (paiche bebe) */}
      <g transform="translate(100 120) rotate(25)">
        <path d="M0 0q8 -4 16 0q-4 4 -8 5q-4 -1 -8 -5z" fill="currentColor" opacity="0.25" />
        <path d="M0 0q8 -4 16 0q-4 4 -8 5q-4 -1 -8 -5z" />
        <path d="M16 0l5 -3M16 0l5 3" />
      </g>
      {/* Sun reflection en agua */}
      <path d="M50 110l40 -2M55 120l35 -2M60 130l30 -2" opacity="0.25" strokeDasharray="3 5" />
    </svg>
  );
}

/**
 * SenioraShipiba — señora con textil shipibo-conibo distintivo.
 * Uso: representación cultural, about page, respeto identitario.
 * Transmite: inclusión cultural auténtica de Ucayali.
 */
export function SenioraShipiba({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Cabeza */}
      <ellipse cx="100" cy="55" rx="16" ry="18" />
      {/* Cabello largo lacio (tradicional) */}
      <path d="M84 55q-2 30 2 55" />
      <path d="M116 55q2 30 -2 55" />
      {/* Ojos */}
      <path d="M92 55q2 -1 4 0" />
      <path d="M104 55q2 -1 4 0" />
      {/* Cejas gruesas */}
      <path d="M91 50q3 -1 6 0M103 50q3 -1 6 0" strokeWidth={strokeWidth * 1.2} />
      {/* Sonrisa sutil */}
      <path d="M94 65q4 2 10 1" />
      {/* Blusa con patrones shipibo (geometría característica) */}
      <path d="M78 90q44 -4 44 0l-2 80q-20 4 -40 0z" fill="currentColor" opacity="0.08" />
      <path d="M78 90q44 -4 44 0l-2 80q-20 4 -40 0z" />
      {/* Patrón shipibo (kené — dibujos geométricos sagrados) */}
      <path d="M82 100l36 0M82 105l36 0" opacity="0.4" />
      <path d="M85 110l4 -4l4 4l4 -4l4 4l4 -4l4 4l4 -4l4 4" opacity="0.6" strokeWidth={strokeWidth * 0.9} />
      <path d="M82 120l36 0" opacity="0.4" />
      {/* Rombos y cuadrados pequeños */}
      <path d="M90 130l3 -3l3 3l-3 3z" opacity="0.55" />
      <path d="M100 130l3 -3l3 3l-3 3z" opacity="0.55" />
      <path d="M110 130l3 -3l3 3l-3 3z" opacity="0.55" />
      <path d="M85 140l30 0" opacity="0.4" />
      <path d="M88 148l2 -2l2 2l2 -2l2 2l2 -2l2 2l2 -2l2 2l2 -2l2 2l2 -2l2 2" opacity="0.6" strokeWidth={strokeWidth * 0.9} />
      {/* Collar semillas */}
      <circle cx="94" cy="86" r="1.2" />
      <circle cx="98" cy="87" r="1.2" />
      <circle cx="102" cy="87" r="1.2" />
      <circle cx="106" cy="86" r="1.2" />
      {/* Pendientes */}
      <circle cx="82" cy="62" r="1.5" />
      <path d="M82 64v4" strokeWidth={strokeWidth * 0.8} />
      <circle cx="118" cy="62" r="1.5" />
      <path d="M118 64v4" strokeWidth={strokeWidth * 0.8} />
    </svg>
  );
}

/**
 * TallasDePalo — tallas de chonta/madera amazónica (artesanía).
 * Uso: productos culturales, empty stock, marketplace artesanía.
 * Transmite: artesanía regional Ucayali.
 */
export function TallasDePalo({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Base — mesa */}
      <path d="M10 170q90 -4 180 0" opacity="0.4" strokeWidth={strokeWidth * 1.1} />
      {/* Talla 1 — boa sagrada (ronin) enroscada */}
      <g transform="translate(35 125)">
        <ellipse cx="0" cy="20" rx="22" ry="6" opacity="0.15" fill="currentColor" />
        <path d="M-18 18q5 -14 18 -12q14 3 14 10q-2 6 -12 7q-12 0 -10 -9q3 -5 8 -3q4 2 0 5" />
        <circle cx="9" cy="10" r="0.8" fill="currentColor" />
        {/* Patrones escama shipibo en boa */}
        <path d="M-14 15l2 -2M-10 14l2 -2M-6 14l2 -2M-2 14l2 -2M2 14l2 -2M6 14l2 -2" opacity="0.55" strokeWidth={strokeWidth * 0.8} />
      </g>
      {/* Talla 2 — máscara cocama (centro, más alta) */}
      <g transform="translate(100 85)">
        <path d="M-18 0q2 -20 18 -20q16 0 18 20q0 30 -6 45q-12 8 -24 0q-6 -15 -6 -45z" fill="currentColor" opacity="0.1" />
        <path d="M-18 0q2 -20 18 -20q16 0 18 20q0 30 -6 45q-12 8 -24 0q-6 -15 -6 -45z" />
        {/* Ojos triangulares */}
        <path d="M-10 5l5 -4l5 4l-5 4z" opacity="0.6" />
        <path d="M0 5l5 -4l5 4l-5 4z" opacity="0.6" />
        {/* Boca horizontal */}
        <path d="M-5 20q5 3 10 0" />
        {/* Patrones tribales en frente */}
        <path d="M-8 -10l16 0" opacity="0.55" strokeDasharray="1 2" />
        <path d="M-6 -5l12 0" opacity="0.55" />
      </g>
      {/* Talla 3 — mono (otorongo mini) sentado */}
      <g transform="translate(158 130)">
        <ellipse cx="0" cy="18" rx="14" ry="4" opacity="0.15" fill="currentColor" />
        {/* Cuerpo */}
        <ellipse cx="0" cy="8" rx="10" ry="12" />
        {/* Cabeza */}
        <circle cx="0" cy="-8" r="7" />
        {/* Cola enroscada */}
        <path d="M10 8q8 2 8 -6q0 -8 -8 -4" />
        {/* Ojos */}
        <circle cx="-2" cy="-9" r="0.8" fill="currentColor" />
        <circle cx="2" cy="-9" r="0.8" fill="currentColor" />
        {/* Orejas */}
        <path d="M-6 -13q-3 -2 -1 -5M6 -13q3 -2 1 -5" opacity="0.7" />
      </g>
      {/* Polvo / viruta de madera al pie */}
      <path d="M20 175q3 -3 5 0M45 175q3 -3 5 0M80 175q3 -3 5 0M120 175q3 -3 5 0M150 175q3 -3 5 0M175 175q3 -3 5 0" opacity="0.4" strokeWidth={strokeWidth * 0.75} />
    </svg>
  );
}

/**
 * PiscoIncaKola — botella pisco + Inca Kola (símbolos peruanos).
 * Uso: celebración, success moments, upgrade plan Perú.
 * Transmite: peruanidad universal (no solo Ucayali).
 */
export function PiscoIncaKola({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Botella pisco (izquierda) */}
      <g transform="translate(65 50) rotate(-3)">
        {/* Cuello */}
        <path d="M-5 0h10v18l4 8v70q0 4 -4 4h-14q-4 0 -4 -4v-70l4 -8z" fill="currentColor" opacity="0.08" />
        <path d="M-5 0h10v18l4 8v70q0 4 -4 4h-14q-4 0 -4 -4v-70l4 -8z" />
        {/* Tapón */}
        <path d="M-4 -8h8v8h-8z" />
        {/* Label curvo */}
        <path d="M-7 55h14v20h-14z" opacity="0.2" fill="currentColor" />
        <path d="M-7 55h14v20h-14z" />
        <text x="-5" y="64" fontFamily="serif" fontSize="5" fill="currentColor" fontStyle="italic">PISCO</text>
        <path d="M-4 68h12" opacity="0.55" strokeWidth={strokeWidth * 0.75} />
        <path d="M-4 72h10" opacity="0.55" strokeWidth={strokeWidth * 0.75} />
        {/* Líquido */}
        <path d="M-8 80q8 -2 16 0" opacity="0.35" />
      </g>
      {/* Botella Inca Kola (derecha — diseño característico) */}
      <g transform="translate(135 55) rotate(4)">
        {/* Curvatura botella gaseosa */}
        <path d="M-8 0q0 -4 8 -4q8 0 8 4q0 8 -2 14l3 6q1 10 0 70q-3 8 -9 8q-6 0 -9 -8q-1 -60 0 -70l3 -6q-2 -6 -2 -14z" fill="currentColor" opacity="0.08" />
        <path d="M-8 0q0 -4 8 -4q8 0 8 4q0 8 -2 14l3 6q1 10 0 70q-3 8 -9 8q-6 0 -9 -8q-1 -60 0 -70l3 -6q-2 -6 -2 -14z" />
        {/* Label amarillo horizontal */}
        <path d="M-8 48h16v18h-16z" opacity="0.25" fill="currentColor" />
        <path d="M-8 48h16v18h-16z" />
        <text x="-6" y="58" fontFamily="sans-serif" fontSize="5" fill="currentColor" fontWeight="bold">INCA</text>
        <text x="-6" y="63" fontFamily="sans-serif" fontSize="5" fill="currentColor" fontWeight="bold">KOLA</text>
        {/* Burbujas */}
        <circle cx="0" cy="35" r="1" opacity="0.5" />
        <circle cx="-3" cy="30" r="0.8" opacity="0.4" />
        <circle cx="3" cy="25" r="0.8" opacity="0.4" />
        <circle cx="0" cy="15" r="0.7" opacity="0.3" />
      </g>
      {/* Copa catador mini entre botellas */}
      <g transform="translate(100 125)">
        <path d="M-8 0q4 12 8 14l0 6q-8 0 -8 0M8 0q-4 12 -8 14M-8 0h16" strokeWidth={strokeWidth * 1.1} />
        <path d="M-3 -4q3 2 6 0" opacity="0.4" />
      </g>
      {/* Rayos celebración */}
      <path d="M30 30l-6 -6M170 35l6 -6M25 100l-8 0M175 100l8 0" opacity="0.6" strokeDasharray="2 2" />
      {/* Sombra suelo */}
      <ellipse cx="100" cy="175" rx="45" ry="3" opacity="0.25" />
    </svg>
  );
}

/**
 * MapaUcayaliAutentico — mapa real Pucallpa con río + distritos.
 * Uso: SEO zona, hero delivery, tracking local.
 * Transmite: geografía real reconocible.
 */
export function MapaUcayaliAutentico({ size = 160, strokeWidth = 1.5, className, ...rest }: IllustrationProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Contorno región Ucayali (aprox irregular) */}
      <path d="M30 45q40 -10 80 -5q45 5 60 15q15 20 -5 60q-10 25 -40 45q-35 15 -75 0q-30 -15 -35 -50q-5 -35 15 -65z" fill="currentColor" opacity="0.06" />
      <path d="M30 45q40 -10 80 -5q45 5 60 15q15 20 -5 60q-10 25 -40 45q-35 15 -75 0q-30 -15 -35 -50q-5 -35 15 -65z" />
      {/* Río Ucayali serpenteando */}
      <path d="M45 50q15 20 20 45q8 30 30 40q25 12 60 5q18 -5 30 -20" strokeWidth={strokeWidth * 1.3} />
      <path d="M45 50q15 20 20 45q8 30 30 40q25 12 60 5" opacity="0.55" />
      {/* Punto principal — PUCALLPA */}
      <circle cx="100" cy="100" r="5" fill="currentColor" />
      <circle cx="100" cy="100" r="10" opacity="0.4" />
      <circle cx="100" cy="100" r="16" opacity="0.2" />
      {/* Label */}
      <text x="108" y="103" fontFamily="sans-serif" fontSize="8" fill="currentColor" fontWeight="bold">PUCALLPA</text>
      {/* Distritos pequeños */}
      <circle cx="75" cy="85" r="2" opacity="0.8" />
      <text x="55" y="88" fontFamily="sans-serif" fontSize="5" fill="currentColor" opacity="0.75">Callería</text>
      <circle cx="125" cy="130" r="2" opacity="0.8" />
      <text x="128" y="133" fontFamily="sans-serif" fontSize="5" fill="currentColor" opacity="0.75">Manantay</text>
      <circle cx="140" cy="75" r="2" opacity="0.8" />
      <text x="120" y="70" fontFamily="sans-serif" fontSize="5" fill="currentColor" opacity="0.75">Yarinacocha</text>
      <circle cx="55" cy="135" r="2" opacity="0.8" />
      <text x="28" y="138" fontFamily="sans-serif" fontSize="5" fill="currentColor" opacity="0.75">Campo Verde</text>
      {/* Brújula decorativa */}
      <g transform="translate(155 35)">
        <circle cx="0" cy="0" r="8" opacity="0.3" />
        <path d="M0 -6l2 4l-2 8l-2 -8z" fill="currentColor" opacity="0.6" />
        <text x="-2" y="-9" fontFamily="monospace" fontSize="5" fill="currentColor" opacity="0.65">N</text>
      </g>
      {/* Vegetación sugerida (árboles micro) */}
      <path d="M45 65q2 -3 4 -1M160 95q2 -3 4 -1M50 150q2 -3 4 -1M155 150q2 -3 4 -1" opacity="0.55" />
    </svg>
  );
}

// ── Exports agrupados ─────────────────────────────────────────────
export const PUCALLPA_ILLUSTRATIONS = {
  doniaElena: DoniaElena,
  motorizadoUcayali: MotorizadoUcayali,
  cuadernoFiadoReal: CuadernoFiadoReal,
  paicheEnOlla: PaicheEnOlla,
  malocaAtardecer: MalocaAtardecer,
  rioUcayali: RioUcayali,
  senioraShipiba: SenioraShipiba,
  tallasDePalo: TallasDePalo,
  piscoIncaKola: PiscoIncaKola,
  mapaUcayaliAutentico: MapaUcayaliAutentico,
} as const;

export type PucallpaIllustrationKey = keyof typeof PUCALLPA_ILLUSTRATIONS;
