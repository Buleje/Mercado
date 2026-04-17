"use client";

/**
 * Recipe illustrations — line-art SVG custom.
 * Estilo editorial: solo stroke, sin fills de colores.
 * Todas respetan currentColor para adaptarse al tema.
 */

interface Props {
  className?: string;
  ariaLabel?: string;
}

export function JuaneIllustration({ className, ariaLabel }: Props) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={ariaLabel ?? "Juane de gallina"}
    >
      {/* Bijao leaf wrap (folded) */}
      <path d="M30 50 Q60 30 90 50 Q100 70 90 90 Q60 105 30 90 Q20 70 30 50 Z" />
      <path d="M30 50 Q35 45 45 44" />
      <path d="M90 50 Q85 45 75 44" />
      {/* Leaf central vein */}
      <path d="M60 30 L60 100" strokeWidth="1" opacity="0.6" />
      {/* Side veins */}
      <path d="M60 50 Q48 52 38 60" strokeWidth="1" opacity="0.5" />
      <path d="M60 50 Q72 52 82 60" strokeWidth="1" opacity="0.5" />
      <path d="M60 70 Q48 72 38 80" strokeWidth="1" opacity="0.5" />
      <path d="M60 70 Q72 72 82 80" strokeWidth="1" opacity="0.5" />
      {/* Tie string */}
      <circle cx="60" cy="30" r="3" />
      <path d="M57 28 L53 22" />
      <path d="M63 28 L67 22" />
    </svg>
  );
}

export function TacachoIllustration({ className, ariaLabel }: Props) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={ariaLabel ?? "Tacacho con cecina"}
    >
      {/* Plantain sphere (machacado) */}
      <ellipse cx="60" cy="72" rx="28" ry="20" />
      {/* Texture inside */}
      <path d="M40 68 Q50 65 60 68" strokeWidth="1" opacity="0.55" />
      <path d="M55 76 Q65 73 75 76" strokeWidth="1" opacity="0.55" />
      <path d="M45 82 Q55 79 65 82" strokeWidth="1" opacity="0.55" />
      {/* Cecina slices on top */}
      <path d="M35 54 Q45 44 60 48 Q75 52 85 44" />
      <path d="M38 56 Q48 50 58 52 Q70 54 82 48" strokeWidth="1" opacity="0.6" />
      {/* Herb sprig */}
      <path d="M60 30 L60 44" />
      <path d="M56 36 L60 40" />
      <path d="M64 36 L60 40" />
      <path d="M57 32 L60 36" />
      <path d="M63 32 L60 36" />
    </svg>
  );
}

export function InchicapiIllustration({ className, ariaLabel }: Props) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={ariaLabel ?? "Inchicapi de gallina"}
    >
      {/* Bowl */}
      <path d="M22 58 Q22 88 60 90 Q98 88 98 58" />
      <ellipse cx="60" cy="58" rx="38" ry="6" />
      {/* Soup surface ripples */}
      <path d="M34 62 Q44 58 54 62" strokeWidth="1" opacity="0.55" />
      <path d="M64 66 Q74 62 84 66" strokeWidth="1" opacity="0.55" />
      {/* Floating yucca cubes */}
      <rect x="42" y="52" width="6" height="6" rx="1" />
      <rect x="70" y="54" width="5" height="5" rx="1" opacity="0.7" />
      <rect x="58" y="50" width="4" height="4" rx="1" opacity="0.5" />
      {/* Steam */}
      <path d="M45 36 Q48 30 45 24" opacity="0.5" />
      <path d="M60 32 Q63 26 60 20" opacity="0.5" />
      <path d="M75 36 Q78 30 75 24" opacity="0.5" />
    </svg>
  );
}

export function CevicheIllustration({ className, ariaLabel }: Props) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={ariaLabel ?? "Ceviche de paiche"}
    >
      {/* Plate (top view, slightly elliptical) */}
      <ellipse cx="60" cy="66" rx="44" ry="14" />
      <ellipse cx="60" cy="66" rx="34" ry="10" opacity="0.5" />
      {/* Fish cubes */}
      <rect x="42" y="60" width="8" height="7" rx="1.5" transform="rotate(-8 46 63)" />
      <rect x="56" y="62" width="8" height="7" rx="1.5" transform="rotate(10 60 65)" />
      <rect x="70" y="59" width="8" height="7" rx="1.5" transform="rotate(-6 74 62)" />
      <rect x="50" y="68" width="7" height="6" rx="1.5" opacity="0.7" transform="rotate(12 53 71)" />
      <rect x="66" y="69" width="7" height="6" rx="1.5" opacity="0.7" transform="rotate(-10 70 72)" />
      {/* Lime half */}
      <circle cx="90" cy="45" r="8" />
      <path d="M85 44 L95 44 M90 40 L90 48 M86 41 L94 48 M86 48 L94 41" strokeWidth="1" opacity="0.5" />
      {/* Cilantro sprigs */}
      <path d="M30 50 L34 58" />
      <path d="M34 52 L38 56" />
      <path d="M30 50 L28 48" />
    </svg>
  );
}

export const RECIPE_ILLUSTRATIONS: Record<
  string,
  (props: Props) => React.ReactElement
> = {
  juane: JuaneIllustration,
  tacacho: TacachoIllustration,
  inchicapi: InchicapiIllustration,
  "ceviche-paiche": CevicheIllustration,
};
