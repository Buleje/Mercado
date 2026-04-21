"use client";

/**
 * PaicheMascot — Paiche detallado de identidad amazónica (Arapaima gigas).
 *
 * Pez más icónico de la Amazonía peruana, símbolo cultural de Ucayali/Pucallpa.
 * Esta versión es más elaborada que la anterior:
 *   - Cuerpo con gradiente de tres tonos (dorso · ventral · lateral)
 *   - Escamas organizadas en 3 filas con wobble orgánico
 *   - Manchas rojas características del paiche real cerca de la cola
 *   - Ojo compuesto (pupila + iris + reflejo)
 *   - Aleta dorsal + pectoral + ventral + caudal detalladas
 *   - Línea lateral con pattern punteado
 *   - Burbujas animadas (flotan hacia arriba)
 *
 * Técnicas anti-IA-genérico:
 *   - Wobble micro en curvas del cuerpo
 *   - Asimetría deliberada (ojo, aletas, manchas)
 *   - Cola con gesto orgánico, no geométrico
 *
 * @example
 *   <PaicheMascot size={240} className="text-[var(--accent)]" animated />
 */

interface Props extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Si true, agrega animación suave de nado + burbujas flotando. */
  animated?: boolean;
}

export function PaicheMascot({
  size = 96,
  strokeWidth = 1.75,
  className,
  animated = false,
  ...rest
}: Props) {
  return (
    <svg
      viewBox="0 0 240 140"
      width={size}
      height={size * (140 / 240)}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      style={
        animated
          ? {
              animation: "paiche-swim 3.2s ease-in-out infinite",
            }
          : undefined
      }
      {...rest}
    >
      {/* ── Cuerpo — 3 capas de tono para profundidad ───────────────────── */}
      {/* Capa ventral (más clara) */}
      <path
        d="M34 78q18 -28 86 -28q50 0 84 22q-4 14 -22 20q-32 8 -64 8q-36 0 -62 -6q-18 -4 -22 -16z"
        fill="currentColor"
        opacity="0.08"
      />
      {/* Capa media (cuerpo principal) */}
      <path
        d="M34 70q18 -32 86 -32q50 0 84 24q-4 14 -22 20q-32 8 -64 8q-36 0 -62 -6q-18 -4 -22 -14z"
        fill="currentColor"
        opacity="0.16"
      />
      {/* Contorno */}
      <path d="M34 70q18 -32 86 -32q50 0 84 24q-4 14 -22 20q-32 8 -64 8q-36 0 -62 -6q-18 -4 -22 -14z" />

      {/* ── Cabeza: ojo, pupila, reflejo, branquia ──────────────────────── */}
      {/* Iris suave */}
      <circle cx="56" cy="62" r="6" opacity="0.18" fill="currentColor" />
      {/* Iris anillo */}
      <circle cx="56" cy="62" r="5" opacity="0.5" />
      {/* Pupila */}
      <circle cx="56" cy="62" r="2.2" fill="currentColor" />
      {/* Reflejo del ojo — asimétrico, arriba-izquierda */}
      <circle cx="54.5" cy="60.5" r="0.9" fill="#ffffff" opacity="0.95" />

      {/* Branquia (arco + trazo corto) */}
      <path d="M70 56q3 8 0 18" opacity="0.55" />
      <path d="M74 60q2 5 0 10" opacity="0.4" />

      {/* Boca sutil */}
      <path d="M36 70q4 4 8 3" opacity="0.6" />

      {/* ── Escamas en 3 filas (dorsal · medial · ventral) ──────────────── */}
      {/* Fila dorsal — cerca del lomo */}
      <path
        d="M92 52q4 4 0 8M106 50q4 4 0 8M120 49q4 4 0 8M134 50q4 4 0 8M148 52q4 4 0 8M162 54q4 4 0 8M176 56q3 3 0 6"
        opacity="0.55"
      />
      {/* Fila medial */}
      <path
        d="M88 66q5 5 0 10M104 66q5 5 0 10M120 66q5 5 0 10M136 66q5 5 0 10M152 66q5 5 0 10M168 66q4 4 0 8M182 66q4 4 0 8"
        opacity="0.45"
      />
      {/* Fila ventral */}
      <path
        d="M92 82q4 4 0 8M108 82q4 4 0 8M124 82q4 4 0 8M140 82q4 4 0 8M156 82q4 4 0 8M172 82q4 4 0 8"
        opacity="0.35"
      />

      {/* ── Línea lateral punteada ──────────────────────────────────────── */}
      <path
        d="M46 76q40 -6 76 -5q40 0 78 3"
        opacity="0.28"
        strokeDasharray="3 5"
      />

      {/* ── Aletas ──────────────────────────────────────────────────────── */}
      {/* Dorsal — estructura triangular con rayos */}
      <path d="M120 42l-6 -14l16 -2l14 10" opacity="0.7" />
      <path d="M120 42l4 -10" opacity="0.4" />
      <path d="M128 40l2 -10" opacity="0.4" />
      <path d="M136 40l4 -8" opacity="0.4" />
      <path d="M120 42q8 -8 24 -6" opacity="0.5" />

      {/* Pectoral — pequeña, adelante */}
      <path d="M78 82q-4 12 6 18q8 4 14 -2" opacity="0.55" />
      <path d="M80 86q2 8 8 10" opacity="0.3" />

      {/* Ventral — atrás de la pectoral */}
      <path d="M114 92l-4 10l14 2l10 -6" opacity="0.7" />
      <path d="M114 94l2 6" opacity="0.35" />
      <path d="M124 96l2 4" opacity="0.35" />

      {/* ── Cola (caudal) — el sello del paiche con manchas rojas ────── */}
      {/* Gesto orgánico, no simétrico */}
      <path
        d="M202 68l20 -14l-5 18l10 8l-12 14l-18 -10z"
        fill="currentColor"
        opacity="0.18"
      />
      <path d="M202 68l20 -14l-5 18l10 8l-12 14l-18 -10z" />
      {/* Rayos de la cola */}
      <path d="M205 67l14 -10" opacity="0.5" />
      <path d="M208 74l16 -6" opacity="0.5" />
      <path d="M208 80l14 0" opacity="0.5" />
      <path d="M205 86l12 6" opacity="0.5" />

      {/* Manchas rojas características del paiche adulto (accent contrastado) */}
      <circle cx="180" cy="78" r="3" fill="currentColor" opacity="0.45" />
      <circle cx="192" cy="72" r="2.4" fill="currentColor" opacity="0.35" />
      <circle cx="188" cy="84" r="2" fill="currentColor" opacity="0.3" />
      <circle cx="200" cy="80" r="1.5" fill="currentColor" opacity="0.5" />

      {/* ── Burbujas flotando (animadas) ────────────────────────────────── */}
      <g className={animated ? "paiche-bubbles" : undefined}>
        <circle cx="24" cy="38" r="2" opacity="0.45" />
        <circle cx="18" cy="26" r="1.4" opacity="0.38" />
        <circle cx="32" cy="20" r="1.1" opacity="0.32" />
        <circle cx="14" cy="14" r="0.9" opacity="0.28" />
        <circle cx="40" cy="10" r="0.7" opacity="0.24" />
      </g>

      {/* ── Agua — ondas sutiles abajo ──────────────────────────────────── */}
      <path
        d="M20 122q20 -4 40 0t40 0t40 0t40 0t40 0"
        opacity="0.15"
        strokeWidth={strokeWidth * 0.8}
      />
      <path
        d="M30 130q20 -3 40 0t40 0t40 0t40 0"
        opacity="0.1"
        strokeWidth={strokeWidth * 0.7}
      />

      <style>
        {`@keyframes paiche-swim {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(-5px) rotate(-1.2deg); }
          50% { transform: translateX(0) rotate(0deg); }
          75% { transform: translateX(5px) rotate(1.2deg); }
        }
        @keyframes paiche-bubbles-float {
          0% { transform: translateY(0); opacity: 0.6; }
          70% { opacity: 0.35; }
          100% { transform: translateY(-18px); opacity: 0; }
        }
        .paiche-bubbles {
          animation: paiche-bubbles-float 2.6s ease-out infinite;
          transform-origin: center;
        }
        @media (prefers-reduced-motion: reduce) {
          svg[style*="paiche-swim"] { animation: none !important; }
          .paiche-bubbles { animation: none !important; }
        }`}
      </style>
    </svg>
  );
}

export default PaicheMascot;
