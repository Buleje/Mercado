"use client";

/**
 * PaicheMascot — Paiche detallado de identidad amazónica (Arapaima gigas).
 *
 * v2 (mayo 2026): animacion mejorada. Antes era un swim monolitico (todo
 * el body se traslada). Ahora cada parte tiene su propia animacion:
 *   - Cuerpo: swim suave (sub-amplitude)
 *   - Cola: wag independiente (rotate desde la base, mas rapida)
 *   - Aletas: flap leve
 *   - Ojo: blink ocasional
 *   - Manchas: shimmer pulse
 *   - Burbujas: stream continuo con stagger
 *
 * Cada elemento usa transform-origin y delays diferentes para evitar el
 * efecto "robotico sincronizado". Respeta prefers-reduced-motion.
 *
 * @example
 *   <PaicheMascot size={240} className="text-[var(--accent)]" animated />
 */

interface Props extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Si true, agrega animacion completa (swim + tail wag + bubbles + blink). */
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
              animation: "paiche-swim 3.6s ease-in-out infinite",
              transformOrigin: "center",
            }
          : undefined
      }
      {...rest}
    >
      {/* ── Cuerpo — 3 capas de tono para profundidad ───────────────────── */}
      <g className={animated ? "paiche-body" : undefined}>
        {/* Capa ventral (mas clara) */}
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
        <circle cx="56" cy="62" r="6" opacity="0.18" fill="currentColor" />
        <circle cx="56" cy="62" r="5" opacity="0.5" />
        {/* Pupila con blink animation */}
        <g className={animated ? "paiche-eye" : undefined} style={animated ? { transformOrigin: "56px 62px" } : undefined}>
          <circle cx="56" cy="62" r="2.2" fill="currentColor" />
          <circle cx="54.5" cy="60.5" r="0.9" fill="#ffffff" opacity="0.95" />
        </g>

        {/* Branquia (arco + trazo corto) */}
        <path d="M70 56q3 8 0 18" opacity="0.55" />
        <path d="M74 60q2 5 0 10" opacity="0.4" />

        {/* Boca sutil */}
        <path d="M36 70q4 4 8 3" opacity="0.6" />

        {/* ── Escamas en 3 filas (dorsal · medial · ventral) ──────────────── */}
        <path
          d="M92 52q4 4 0 8M106 50q4 4 0 8M120 49q4 4 0 8M134 50q4 4 0 8M148 52q4 4 0 8M162 54q4 4 0 8M176 56q3 3 0 6"
          opacity="0.55"
        />
        <path
          d="M88 66q5 5 0 10M104 66q5 5 0 10M120 66q5 5 0 10M136 66q5 5 0 10M152 66q5 5 0 10M168 66q4 4 0 8M182 66q4 4 0 8"
          opacity="0.45"
        />
        <path
          d="M92 82q4 4 0 8M108 82q4 4 0 8M124 82q4 4 0 8M140 82q4 4 0 8M156 82q4 4 0 8M172 82q4 4 0 8"
          opacity="0.35"
        />

        {/* ── Linea lateral punteada ──────────────────────────────────────── */}
        <path
          d="M46 76q40 -6 76 -5q40 0 78 3"
          opacity="0.28"
          strokeDasharray="3 5"
        />

        {/* ── Aleta dorsal — flap animation ──────────────────────────────── */}
        <g className={animated ? "paiche-fin-dorsal" : undefined} style={animated ? { transformOrigin: "130px 42px" } : undefined}>
          <path d="M120 42l-6 -14l16 -2l14 10" opacity="0.7" />
          <path d="M120 42l4 -10" opacity="0.4" />
          <path d="M128 40l2 -10" opacity="0.4" />
          <path d="M136 40l4 -8" opacity="0.4" />
          <path d="M120 42q8 -8 24 -6" opacity="0.5" />
        </g>

        {/* Pectoral — pequena, adelante, flap */}
        <g className={animated ? "paiche-fin-pectoral" : undefined} style={animated ? { transformOrigin: "85px 85px" } : undefined}>
          <path d="M78 82q-4 12 6 18q8 4 14 -2" opacity="0.55" />
          <path d="M80 86q2 8 8 10" opacity="0.3" />
        </g>

        {/* Ventral — atras de la pectoral */}
        <g className={animated ? "paiche-fin-ventral" : undefined} style={animated ? { transformOrigin: "120px 94px" } : undefined}>
          <path d="M114 92l-4 10l14 2l10 -6" opacity="0.7" />
          <path d="M114 94l2 6" opacity="0.35" />
          <path d="M124 96l2 4" opacity="0.35" />
        </g>

        {/* Manchas rojas con shimmer */}
        <g className={animated ? "paiche-spots" : undefined}>
          <circle cx="180" cy="78" r="3" fill="currentColor" opacity="0.45" />
          <circle cx="192" cy="72" r="2.4" fill="currentColor" opacity="0.35" />
          <circle cx="188" cy="84" r="2" fill="currentColor" opacity="0.3" />
          <circle cx="200" cy="80" r="1.5" fill="currentColor" opacity="0.5" />
        </g>
      </g>

      {/* ── Cola (caudal) — tail wag independiente desde la base ──────── */}
      <g className={animated ? "paiche-tail" : undefined} style={animated ? { transformOrigin: "200px 78px" } : undefined}>
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
      </g>

      {/* ── Burbujas: stream continuo con stagger ─────────────────────── */}
      {animated && (
        <>
          <g className="paiche-bubble-stream paiche-bubble-1">
            <circle cx="24" cy="38" r="2" opacity="0.55" fill="currentColor" />
          </g>
          <g className="paiche-bubble-stream paiche-bubble-2">
            <circle cx="18" cy="26" r="1.4" opacity="0.45" fill="currentColor" />
          </g>
          <g className="paiche-bubble-stream paiche-bubble-3">
            <circle cx="32" cy="20" r="1.1" opacity="0.4" fill="currentColor" />
          </g>
          <g className="paiche-bubble-stream paiche-bubble-4">
            <circle cx="14" cy="14" r="0.9" opacity="0.35" fill="currentColor" />
          </g>
          <g className="paiche-bubble-stream paiche-bubble-5">
            <circle cx="40" cy="10" r="0.7" opacity="0.3" fill="currentColor" />
          </g>
          <g className="paiche-bubble-stream paiche-bubble-6">
            <circle cx="28" cy="48" r="1.3" opacity="0.5" fill="currentColor" />
          </g>
        </>
      )}
      {!animated && (
        <g>
          <circle cx="24" cy="38" r="2" opacity="0.45" />
          <circle cx="18" cy="26" r="1.4" opacity="0.38" />
          <circle cx="32" cy="20" r="1.1" opacity="0.32" />
          <circle cx="14" cy="14" r="0.9" opacity="0.28" />
          <circle cx="40" cy="10" r="0.7" opacity="0.24" />
        </g>
      )}

      {/* ── Agua — ondas sutiles abajo con shimmer ──────────────────────── */}
      <g className={animated ? "paiche-water" : undefined}>
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
      </g>

      <style>
        {`@keyframes paiche-swim {
          0%, 100% { transform: translateX(0) translateY(0) rotate(0deg); }
          25%      { transform: translateX(-4px) translateY(-2px) rotate(-1.5deg); }
          50%      { transform: translateX(0) translateY(0) rotate(0deg); }
          75%      { transform: translateX(4px) translateY(2px) rotate(1.5deg); }
        }
        @keyframes paiche-tail-wag {
          0%, 100% { transform: rotate(0deg); }
          25%      { transform: rotate(-8deg); }
          50%      { transform: rotate(0deg); }
          75%      { transform: rotate(8deg); }
        }
        @keyframes paiche-fin-flap {
          0%, 100% { transform: rotate(0deg) scaleY(1); }
          50%      { transform: rotate(-6deg) scaleY(0.92); }
        }
        @keyframes paiche-fin-flap-ventral {
          0%, 100% { transform: rotate(0deg); }
          50%      { transform: rotate(5deg); }
        }
        @keyframes paiche-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          95%, 97%      { transform: scaleY(0.05); }
        }
        @keyframes paiche-spots-shimmer {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.55; }
        }
        @keyframes paiche-bubble-rise {
          0%   { transform: translateY(8px) translateX(0); opacity: 0; }
          15%  { opacity: 0.7; }
          70%  { opacity: 0.4; }
          100% { transform: translateY(-32px) translateX(-3px); opacity: 0; }
        }
        @keyframes paiche-water-shimmer {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.6; }
        }

        .paiche-tail {
          animation: paiche-tail-wag 1.4s ease-in-out infinite;
        }
        .paiche-fin-dorsal {
          animation: paiche-fin-flap 2.2s ease-in-out infinite;
        }
        .paiche-fin-pectoral {
          animation: paiche-fin-flap 1.8s ease-in-out infinite;
          animation-delay: 0.3s;
        }
        .paiche-fin-ventral {
          animation: paiche-fin-flap-ventral 2.6s ease-in-out infinite;
          animation-delay: 0.5s;
        }
        .paiche-eye {
          animation: paiche-blink 4.5s ease-in-out infinite;
        }
        .paiche-spots {
          animation: paiche-spots-shimmer 2.8s ease-in-out infinite;
        }
        .paiche-water {
          animation: paiche-water-shimmer 3.2s ease-in-out infinite;
        }
        .paiche-bubble-stream {
          animation: paiche-bubble-rise 2.6s ease-out infinite;
          transform-origin: center;
        }
        .paiche-bubble-1 { animation-delay: 0s;    animation-duration: 2.4s; }
        .paiche-bubble-2 { animation-delay: 0.4s;  animation-duration: 2.8s; }
        .paiche-bubble-3 { animation-delay: 0.8s;  animation-duration: 2.6s; }
        .paiche-bubble-4 { animation-delay: 1.2s;  animation-duration: 3.0s; }
        .paiche-bubble-5 { animation-delay: 1.6s;  animation-duration: 2.5s; }
        .paiche-bubble-6 { animation-delay: 2.0s;  animation-duration: 2.7s; }

        @media (prefers-reduced-motion: reduce) {
          svg[style*="paiche-swim"] { animation: none !important; }
          .paiche-tail,
          .paiche-fin-dorsal,
          .paiche-fin-pectoral,
          .paiche-fin-ventral,
          .paiche-eye,
          .paiche-spots,
          .paiche-water,
          .paiche-bubble-stream { animation: none !important; }
        }`}
      </style>
    </svg>
  );
}

export default PaicheMascot;
