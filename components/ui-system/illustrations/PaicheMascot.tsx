"use client";

/**
 * PaicheMascot — Paiche extraído como ilustración standalone (sin la olla).
 *
 * El paiche (Arapaima gigas) es el pez más icónico de la Amazonía peruana,
 * símbolo cultural de Ucayali/Pucallpa. Esta ilustración lo presenta
 * "libre" — nadando — para usarse como mascota:
 *   - BulejeLoader (paiche nadando mientras carga)
 *   - /not-found (404 con humor local)
 *   - Onboarding (bienvenida amazónica)
 *   - Success states (pedido recibido = paiche saltando)
 *
 * Técnicas anti-IA-genérico aplicadas (alineado con pucallpa-locals.tsx):
 *   - Wobble micro en curvas del cuerpo
 *   - Escamas sugeridas, no hiperrealistas
 *   - Ojo asimétrico (1.5px radio)
 *   - Cola con gesto orgánico, no geométrico
 *
 * @example
 *   <PaicheMascot size={96} className="text-[var(--accent)]" />
 *   <PaicheMascot size={160} strokeWidth={2} animated />
 */

interface Props extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Si true, agrega animación suave de nado. */
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
      viewBox="0 0 200 120"
      width={size}
      height={size * 0.6}
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
              animation: "paiche-swim 3s ease-in-out infinite",
            }
          : undefined
      }
      {...rest}
    >
      {/* Cuerpo principal del paiche — ligeramente ovalado, wobble humano */}
      <path
        d="M30 60q15 -22 70 -22q40 0 70 20q-4 10 -18 14q-25 6 -52 6q-30 -1 -52 -6q-14 -4 -18 -12z"
        fill="currentColor"
        opacity="0.12"
      />
      <path d="M30 60q15 -22 70 -22q40 0 70 20q-4 10 -18 14q-25 6 -52 6q-30 -1 -52 -6q-14 -4 -18 -12z" />

      {/* Ojo asimétrico (cabeza lado izquierdo) */}
      <circle cx="48" cy="55" r="1.8" fill="currentColor" />
      <circle cx="48" cy="55" r="4" opacity="0.35" />

      {/* Branquia sugerida */}
      <path d="M60 50q2 6 0 14" opacity="0.55" />

      {/* Escamas laterales — trazos cortos ascendentes, no geométricos */}
      <path
        d="M78 52q4 5 0 10M92 52q5 5 0 10M106 52q5 5 0 10M120 54q5 5 0 10M132 56q4 4 0 8M144 58q4 4 0 8"
        opacity="0.5"
      />

      {/* Línea lateral del pez — sutil */}
      <path d="M40 64q30 -4 60 -3q30 -1 58 2" opacity="0.3" strokeDasharray="3 4" />

      {/* Aleta dorsal */}
      <path d="M100 38l-4 -10l12 -2l10 8" opacity="0.7" />
      <path d="M100 38q5 -6 18 -4" opacity="0.55" />

      {/* Aleta ventral */}
      <path d="M90 78l-4 8l10 2l8 -4" opacity="0.7" />

      {/* Cola expresiva — gesto orgánico */}
      <path
        d="M170 58l16 -10l-4 14l8 6l-10 10l-14 -8z"
        fill="currentColor"
        opacity="0.15"
      />
      <path d="M170 58l16 -10l-4 14l8 6l-10 10l-14 -8z" />

      {/* Burbujas pequeñas (vida) — opcionales, arriba izquierda */}
      <circle cx="20" cy="30" r="1.5" opacity="0.4" />
      <circle cx="28" cy="22" r="1" opacity="0.35" />
      <circle cx="36" cy="15" r="0.8" opacity="0.3" />

      <style>
        {`@keyframes paiche-swim {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          25% { transform: translateX(-4px) rotate(-1deg); }
          50% { transform: translateX(0) rotate(0deg); }
          75% { transform: translateX(4px) rotate(1deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          svg[style*="paiche-swim"] { animation: none !important; }
        }`}
      </style>
    </svg>
  );
}

export default PaicheMascot;
