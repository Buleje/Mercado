"use client";

/**
 * Buleje Logo — assets oficiales (PNG transparente, optimizados via sharp).
 *
 * Mayo 2026: el SVG ilustrativo (bodega line-art) fue reemplazado por
 * el logo de marca real. Hay 2 PNG:
 *  - /brand/buleje-logo-mark.png  — solo "b" + swoosh, transparente, 256x256
 *  - /brand/buleje-logo.png        — full (mark + "Buleje" stacked), 512x512
 *
 * Componentes:
 *  - BulejeMark      — solo la marca (mark-only PNG). Cuadrado.
 *  - BulejeWordmark  — mark + texto "Buleje" horizontal (CSS). Layout pill.
 *  - BulejeLogo      — alias con prop `variant`.
 *
 * Para splash/login/hero verticales con el wordmark grabado en la imagen,
 * usar `<Image src="/brand/buleje-logo.png" />` directo, no estos componentes.
 */

import Image from "next/image";
import { cn } from "@/lib/utils";

const MARK_SRC = "/brand/buleje-logo-mark.png";
const MARK_DARK_SRC = "/brand/buleje-logo-mark-dark.png";

interface LogoProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  size?: number;
  /** @deprecated solo por compat — el PNG no usa stroke. */
  strokeWidth?: number;
  className?: string;
}

/**
 * BulejeMark — "b" con swoosh teal. Cuadrado 1:1, sin texto.
 * Usar en navbar (36–48px), app icons, avatares, watermarks.
 */
export function BulejeMark({ size = 40, className, ...rest }: LogoProps) {
  delete (rest as { strokeWidth?: number }).strokeWidth;
  return (
    <span
      className={cn("inline-flex items-center justify-center shrink-0 relative", className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      {/* Light mode: b oscura + swoosh teal */}
      <Image
        src={MARK_SRC}
        alt="Buleje"
        width={size}
        height={size}
        priority={size >= 48}
        className="object-contain block dark:hidden"
        sizes={`${size}px`}
      />
      {/* Dark mode: b blanca + swoosh teal */}
      <Image
        src={MARK_DARK_SRC}
        alt=""
        aria-hidden
        width={size}
        height={size}
        priority={size >= 48}
        className="object-contain hidden dark:block"
        sizes={`${size}px`}
      />
    </span>
  );
}

interface WordmarkProps extends LogoProps {
  /** Tamano del texto "Buleje". Default = size * 0.55. */
  textSize?: number;
  /** Si false, oculta el texto y queda solo el mark. Default true. */
  showText?: boolean;
}

/**
 * BulejeWordmark — mark + texto "Buleje" horizontal lado a lado.
 * Layout: inline-flex, gap entre mark y texto. Ideal para navbars.
 * El texto usa la misma fuente del DS y hereda color del padre via
 * `color: currentColor` (className define el color).
 */
export function BulejeWordmark({
  size = 36,
  textSize,
  showText = true,
  className,
  ...rest
}: WordmarkProps) {
  delete (rest as { strokeWidth?: number }).strokeWidth;
  const tSize = textSize ?? Math.round(size * 0.55);
  return (
    <span className={cn("inline-flex items-center gap-2", className)} {...rest}>
      <BulejeMark size={size} />
      {showText && (
        <span
          className="font-extrabold tracking-tight leading-none"
          style={{ fontSize: `${tSize}px`, letterSpacing: "-0.02em" }}
        >
          Buleje
        </span>
      )}
    </span>
  );
}

interface BulejeLogoProps extends WordmarkProps {
  variant?: "mark" | "wordmark";
}

export function BulejeLogo({ variant = "mark", ...props }: BulejeLogoProps) {
  if (variant === "wordmark") return <BulejeWordmark {...props} />;
  return <BulejeMark {...props} />;
}

export default BulejeLogo;
