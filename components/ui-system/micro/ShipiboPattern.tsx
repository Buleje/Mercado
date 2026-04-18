"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";

/**
 * ShipiboPattern — textil shipibo-conibo (kené) decorativo.
 *
 * Patrón geométrico tradicional amazónico. Uso en footer, hero backgrounds,
 * dividers culturales. Siempre con opacidad baja para no invadir.
 *
 * Research: illustration.app "humanity signals" — patrones tradicionales
 * transmiten identidad cultural auténtica que IA no puede replicar.
 *
 * @example
 * <ShipiboPattern variant="horizontal" opacity={0.05} />
 * <ShipiboPattern variant="divider" color="var(--shipibo-red)" />
 */

interface Props {
  /** Horizontal: banda larga · Divider: línea separadora · Corner: esquina */
  variant?: "horizontal" | "divider" | "corner";
  /** Opacidad — default 0.08 (sutil) */
  opacity?: number;
  /** Color override — default currentColor */
  color?: string;
  /** Altura en px — default 40 */
  height?: number;
  className?: string;
}

export const ShipiboPattern = memo(function ShipiboPattern({
  variant = "horizontal",
  opacity = 0.08,
  color = "currentColor",
  height = 40,
  className,
}: Props) {
  if (variant === "divider") {
    return (
      <div className={cn("w-full", className)} style={{ height: 20, opacity }} aria-hidden>
        <svg
          viewBox="0 0 400 20"
          preserveAspectRatio="none"
          width="100%"
          height="20"
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Zigzag con rombos intercalados — patrón kené */}
          <path d="M0 10l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5l10 5l10 -5" />
          {/* Rombos pequeños intercalados */}
          {Array.from({ length: 20 }, (_, i) => (
            <path
              key={i}
              d={`M${20 + i * 20} 10l2 -3l2 3l-2 3z`}
            />
          ))}
        </svg>
      </div>
    );
  }

  if (variant === "corner") {
    return (
      <svg
        viewBox="0 0 80 80"
        width="80"
        height="80"
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn("pointer-events-none", className)}
        style={{ opacity }}
        aria-hidden
      >
        {/* Forma angular tradicional shipiba */}
        <path d="M5 5h70" />
        <path d="M5 5v70" />
        <path d="M15 15h50v4h-50z" />
        <path d="M15 15v50h4v-50z" />
        <path d="M25 25l8 -8M25 35l18 -18M25 45l28 -28" />
        {/* Rombos en esquina */}
        <path d="M60 10l3 -3l3 3l-3 3z" />
        <path d="M10 60l3 -3l3 3l-3 3z" />
        <path d="M55 55l4 -4l4 4l-4 4z" />
      </svg>
    );
  }

  // horizontal (default) — band with repeating kené pattern
  return (
    <div className={cn("w-full", className)} style={{ height, opacity }} aria-hidden>
      <svg
        viewBox={`0 0 400 ${height}`}
        preserveAspectRatio="xMidYMid slice"
        width="100%"
        height={height}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Lineas horizontales superior + inferior */}
        <path d={`M0 4h400M0 ${height - 4}h400`} />

        {/* Zigzag principal */}
        <path
          d={`M0 ${height / 2}${Array.from({ length: 40 }, (_, i) =>
            `l10 ${i % 2 === 0 ? -6 : 6}`,
          ).join("")}`}
        />

        {/* Segundo zigzag offset */}
        <path
          d={`M5 ${height / 2}${Array.from({ length: 40 }, (_, i) =>
            `l10 ${i % 2 === 0 ? 6 : -6}`,
          ).join("")}`}
          opacity={0.55}
        />

        {/* Rombos verticales repetidos */}
        {Array.from({ length: 20 }, (_, i) => (
          <g key={i} transform={`translate(${20 + i * 20} ${height / 2})`}>
            <path d="M0 -3l2 -2l2 2l-2 2z" />
            <path d="M0 3l2 2l2 -2l-2 -2z" />
          </g>
        ))}

        {/* Barras verticales gruesas cada 80px (pattern rhythm) */}
        {Array.from({ length: 5 }, (_, i) => (
          <path
            key={i}
            d={`M${40 + i * 80} 4v${height - 8}`}
            strokeWidth={2}
            opacity={0.6}
          />
        ))}
      </svg>
    </div>
  );
});
