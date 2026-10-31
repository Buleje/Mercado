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
  /**
   * Fuerza la variante "b blanca" (mark-dark) SIEMPRE, ignorando el tema de la
   * página. Útil sobre fondos oscuros fijos (footer grafito/negro, banners
   * dark) donde la "b oscura" del light-mode no contrastaría. Default false.
   */
  forceDark?: boolean;
}

/**
 * BulejeMark — "b" con swoosh teal. Cuadrado 1:1, sin texto.
 * Usar en navbar (36–48px), app icons, avatares, watermarks.
 */
export function BulejeMark({ size = 40, className, forceDark = false, ...rest }: LogoProps) {
  delete (rest as { strokeWidth?: number }).strokeWidth;
  // forceDark: una sola imagen (b blanca) sin alternancia por tema — para fondos
  // oscuros fijos como el footer, donde la "b oscura" desaparecería.
  if (forceDark) {
    return (
      <span
        className={cn("inline-flex items-center justify-center shrink-0 relative", className)}
        style={{ width: size, height: size }}
        {...rest}
      >
        <Image
          src={MARK_DARK_SRC}
          alt="Buleje"
          width={size}
          height={size}
          priority={size >= 48}
          className="object-contain block"
          sizes={`${size}px`}
        />
      </span>
    );
  }
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
  forceDark = false,
  ...rest
}: WordmarkProps) {
  delete (rest as { strokeWidth?: number }).strokeWidth;
  const tSize = textSize ?? Math.round(size * 0.55);
  return (
    // Round 10 fix: inline style con --accent-600 (más oscuro que --accent)
    // garantiza contraste WCAG AA 4.5:1+ sobre fondo blanco. La clase
    // text-[var(--accent-600)] no se generaba en Tailwind 4 JIT (turbopack
    // bug). dark:text-white sigue funcionando vía className override.
    <span
      className={cn("inline-flex items-center gap-2", className)}
      // forceDark = fondo oscuro fijo (footer): el texto debe heredar el color
      // del className (text-white) en vez del accent-600 oscuro, que sobre negro
      // no contrasta (fix Brandon 2026-06-15: "Buleje" negro sobre negro).
      style={forceDark ? undefined : { color: "var(--accent-600, var(--accent))" }}
      {...rest}
    >
      <BulejeMark size={size} forceDark={forceDark} />
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
