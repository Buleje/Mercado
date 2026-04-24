"use client";

/**
 * Buleje Logo — ilustrativo canonico (ADR-067 Ola final).
 *
 * Estilo: Notion-minimalist line-art hand-drawn-feel.
 * Representa una bodega: fachada con techo de dos aguas + ventana + puerta.
 * El "wobble humano" aplica aqui tambien: lineas no perfectas, detalle carino.
 *
 * Técnica:
 * - viewBox 48x48 (tamano logo optimo)
 * - stroke currentColor -> pinta teal cuando contexto es claro, white en dark
 * - strokeWidth 1.75 default (entre linea suave y logo visible)
 * - Variante "mark" = solo la ilustracion
 * - Variante "wordmark" = mark + texto "Buleje" a la derecha
 *
 * Reemplaza:
 * - Bloque "B" teal solido en Header/MarketplaceNavbar
 * - ShoppingBasket en AdminSidebar (tenant logo fallback)
 * - ShieldCheck "Platform" en SuperAdminShell
 */

import { cn } from "@/lib/utils";

interface LogoProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

const baseProps = (size: number, strokeWidth: number) => ({
  viewBox: "0 0 48 48",
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
 * BulejeMark — icono cuadrado de la bodega ilustrada.
 *
 * Composicion:
 *  - Techo en dos aguas (trapecio con caida suave)
 *  - Cuerpo fachada con ventana + puerta
 *  - Toldo sutil que evoca la bodega de barrio
 *  - Linea base del piso con leve imperfeccion
 */
export function BulejeMark({ size = 40, strokeWidth = 1.75, className, ...rest }: LogoProps) {
  return (
    <svg {...baseProps(size, strokeWidth)} className={className} {...rest}>
      {/* Fachada cuerpo — con leve inclinacion, no rectangulo perfecto */}
      <path d="M9 22q15 -2 30 0v18q-15 1 -30 0z" />
      {/* Techo dos aguas — vertice 24,10 */}
      <path d="M7 22l17 -12l17 12" />
      {/* Toldo sutil sobre fachada (mitad izquierda, detalle bodega) */}
      <path d="M11 22q6 3 13 0" opacity="0.55" />
      {/* Puerta — rectangulo con pomo */}
      <path d="M20 40v-10q4 -1 8 0v10" />
      <circle cx="25" cy="36" r="0.6" fill="currentColor" />
      {/* Ventana izquierda — cuadrado dividido */}
      <rect x="11.5" y="26" width="6" height="6" rx="0.5" />
      <path d="M14.5 26v6M11.5 29h6" opacity="0.5" />
      {/* Ventana derecha — cuadrado dividido */}
      <rect x="30.5" y="26" width="6" height="6" rx="0.5" />
      <path d="M33.5 26v6M30.5 29h6" opacity="0.5" />
      {/* Suelo linea — con leve wobble */}
      <path d="M6 42q18 -1 36 0" opacity="0.55" />
      {/* Detalle chimenea derecha */}
      <path d="M33 16v-4h3v2" opacity="0.7" />
    </svg>
  );
}

/**
 * BulejeWordmark — mark + texto "Buleje" a la derecha.
 * Uso: Header, MarketplaceNavbar, About hero.
 */
interface WordmarkProps extends LogoProps {
  /** Tamano del texto tipografico. Default 20 */
  textSize?: number;
  /** Si se muestra el texto o solo el mark (responsive). Default true */
  showText?: boolean;
}

export function BulejeWordmark({
  size = 36,
  strokeWidth = 1.75,
  textSize = 18,
  showText = true,
  className,
  ...rest
}: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BulejeMark size={size} strokeWidth={strokeWidth} {...rest} />
      {showText && (
        <span
          className="font-bold tracking-tight leading-none"
          style={{ fontSize: `${textSize}px` }}
        >
          Buleje
        </span>
      )}
    </span>
  );
}

/**
 * BulejeLogo — export flexible con variant prop.
 * Permite usar <BulejeLogo variant="mark" /> o <BulejeLogo variant="wordmark" />.
 */
interface BulejeLogoProps extends WordmarkProps {
  variant?: "mark" | "wordmark";
}

export function BulejeLogo({ variant = "mark", ...props }: BulejeLogoProps) {
  if (variant === "wordmark") return <BulejeWordmark {...props} />;
  return <BulejeMark {...props} />;
}

export default BulejeLogo;
