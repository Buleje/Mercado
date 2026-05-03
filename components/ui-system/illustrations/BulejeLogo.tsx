"use client";

/**
 * Buleje Logo — único asset oficial.
 *
 * Mayo 2026: el SVG ilustrativo (bodega line-art) fue reemplazado por
 * el logo de marca real (`/brand/buleje-logo.png`) — la "b" con swoosh
 * teal + el wordmark "Buleje". Este es el único logo de la plataforma:
 * navbar, footer, login, onboarding, share images, todo.
 *
 * API conservada para retrocompat con los callers existentes:
 *  - BulejeMark / BulejeWordmark / BulejeLogo
 *  - props: size, className, strokeWidth (ignored, preserved type compat),
 *    textSize/showText (ignored — el PNG ya incluye el wordmark grabado).
 */

import Image from "next/image";
import { cn } from "@/lib/utils";

const LOGO_SRC = "/brand/buleje-logo.png";

interface LogoProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  size?: number;
  /** @deprecated solo por compat — el PNG no usa stroke. */
  strokeWidth?: number;
  className?: string;
}

/**
 * BulejeMark — logo cuadrado.
 * Usar para iconos pequeños (navbar 36–48px) y app icons (192/512).
 * El PNG ya incluye el wordmark "Buleje" grabado debajo de la marca.
 */
export function BulejeMark({ size = 40, className, ...rest }: LogoProps) {
  // strokeWidth se descarta — el PNG no es vector.
  delete (rest as { strokeWidth?: number }).strokeWidth;
  return (
    <span
      className={cn("inline-flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Image
        src={LOGO_SRC}
        alt="Buleje"
        width={size}
        height={size}
        priority={size >= 48}
        className="object-contain"
        sizes={`${size}px`}
      />
    </span>
  );
}

interface WordmarkProps extends LogoProps {
  /** @deprecated el PNG ya tiene el texto integrado. */
  textSize?: number;
  /** @deprecated el PNG siempre muestra el wordmark. */
  showText?: boolean;
}

/**
 * BulejeWordmark — alias de BulejeMark.
 * El PNG oficial ya integra el texto "Buleje" debajo de la marca, así
 * que mark y wordmark son la misma imagen.
 */
export function BulejeWordmark({
  size = 36,
  className,
  ...rest
}: WordmarkProps) {
  delete (rest as { strokeWidth?: number }).strokeWidth;
  delete (rest as { textSize?: number }).textSize;
  delete (rest as { showText?: boolean }).showText;
  return <BulejeMark size={size} className={className} {...rest} />;
}

interface BulejeLogoProps extends WordmarkProps {
  variant?: "mark" | "wordmark";
}

export function BulejeLogo({ variant: _variant = "mark", ...props }: BulejeLogoProps) {
  return <BulejeMark {...props} />;
}

export default BulejeLogo;
