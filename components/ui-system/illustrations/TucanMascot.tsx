"use client";

/**
 * TucanMascot — Tucán amazónico line-art standalone.
 *
 * El tucán pico iris (Ramphastos toco) es el ave más reconocible de la
 * Amazonía peruana. Mascota secundaria que complementa a PaicheMascot
 * (pez del río) con la fauna aérea de la selva.
 *
 * Uso sugerido:
 *   - Onboarding (bienvenida al sitio — "el tucán te guía")
 *   - Success moments (pedido confirmado — ave que vuela con tu pedido)
 *   - Banners de referidos / programas de fidelización
 *
 * Técnicas anti-IA-genérico (alineado con PaicheMascot + pucallpa-locals):
 *   - Wobble en cuerpo y cabeza
 *   - Pico expresivo, no geométrico — curva orgánica tipo "hoz"
 *   - Ojo asimétrico con anillo (característica del tucán real)
 *   - Plumas sugeridas en cola, no dibujadas 1-a-1
 *   - Rama bajo las patas con leve irregularidad
 *
 * Animación `tucan-hop` opcional: pequeño salto + inclinación de cabeza
 * cada 4s, simula el movimiento real del tucán al posarse.
 */

interface Props extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Si true, agrega animación suave de "salto" sobre rama. */
  animated?: boolean;
}

export function TucanMascot({
  size = 96,
  strokeWidth = 1.75,
  className,
  animated = false,
  ...rest
}: Props) {
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
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
              animation: "tucan-hop 4s ease-in-out infinite",
              transformOrigin: "50% 80%",
            }
          : undefined
      }
      {...rest}
    >
      {/* Cuerpo — ovalado con curva orgánica */}
      <path
        d="M72 82q-8 16 -6 38q3 22 18 32q20 6 38 -2q14 -10 14 -34q-2 -22 -12 -38q-26 -8 -52 4z"
        fill="currentColor"
        opacity="0.12"
      />
      <path d="M72 82q-8 16 -6 38q3 22 18 32q20 6 38 -2q14 -10 14 -34q-2 -22 -12 -38q-26 -8 -52 4z" />

      {/* Cabeza — ligeramente inclinada */}
      <path
        d="M78 72q-4 -16 4 -26q14 -10 30 -6q14 4 16 18q2 14 -4 22q-20 6 -46 -8z"
        fill="currentColor"
        opacity="0.15"
      />
      <path d="M78 72q-4 -16 4 -26q14 -10 30 -6q14 4 16 18q2 14 -4 22q-20 6 -46 -8z" />

      {/* Ojo + anillo (característico del tucán) */}
      <circle cx="102" cy="58" r="2.5" fill="currentColor" />
      <circle cx="102" cy="58" r="6" opacity="0.4" />
      <circle cx="102" cy="58" r="9" opacity="0.2" strokeDasharray="2 2" />

      {/* Pico gigante expresivo — curva tipo hoz, asimétrica */}
      <path
        d="M125 54q30 -8 50 10q-4 10 -20 16q-18 4 -30 -4q-8 -6 0 -22z"
        fill="currentColor"
        opacity="0.18"
      />
      <path d="M125 54q30 -8 50 10q-4 10 -20 16q-18 4 -30 -4q-8 -6 0 -22z" strokeWidth={strokeWidth * 1.1} />
      {/* Línea divisoria del pico (color band) */}
      <path d="M130 64q20 -4 38 4" opacity="0.5" />
      {/* Punta del pico */}
      <path d="M170 70l8 2" opacity="0.7" />

      {/* Pecho (área blanca sugerida) */}
      <path d="M82 98q14 4 30 2" opacity="0.4" />
      <path d="M80 108q18 4 34 0" opacity="0.3" />

      {/* Ala plegada */}
      <path d="M108 100q14 8 20 26q-12 10 -28 -2" opacity="0.55" />
      <path d="M112 110q4 8 12 14" opacity="0.4" />
      <path d="M116 108q6 6 12 12" opacity="0.3" />

      {/* Cola — plumas sugeridas */}
      <path d="M128 145l12 8l-2 -14l8 -4" opacity="0.6" />
      <path d="M130 150l10 6" opacity="0.4" />

      {/* Patas */}
      <path d="M90 154v14" strokeWidth={strokeWidth * 1.2} />
      <path d="M102 154v14" strokeWidth={strokeWidth * 1.2} />
      {/* Garras */}
      <path d="M86 168l-3 4M90 168v5M94 168l3 4" opacity="0.7" />
      <path d="M98 168l-3 4M102 168v5M106 168l3 4" opacity="0.7" />

      {/* Rama bajo las patas — línea orgánica */}
      <path d="M60 172q40 -4 80 2q20 0 40 -2" strokeWidth={strokeWidth * 1.2} opacity="0.7" />
      {/* Hojas en la rama */}
      <path d="M62 172q-4 -8 -10 -6M58 170q-2 -10 4 -14" opacity="0.55" />
      <path d="M178 172q4 -8 10 -6M182 170q2 -10 -4 -14" opacity="0.55" />

      {/* Hojas flotantes decorativas arriba */}
      <path d="M30 40q6 -4 12 2q-4 6 -10 4z" fill="currentColor" opacity="0.15" />
      <path d="M30 40q6 -4 12 2q-4 6 -10 4z" opacity="0.5" />

      <style>
        {`@keyframes tucan-hop {
          0%, 90%, 100% { transform: translateY(0) rotate(0deg); }
          92% { transform: translateY(-6px) rotate(-3deg); }
          95% { transform: translateY(0) rotate(2deg); }
          97% { transform: translateY(-2px) rotate(0deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          svg[style*="tucan-hop"] { animation: none !important; }
        }`}
      </style>
    </svg>
  );
}

export default TucanMascot;
