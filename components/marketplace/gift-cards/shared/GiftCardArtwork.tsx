"use client";

/**
 * components/marketplace/gift-cards/shared/GiftCardArtwork.tsx
 *
 * Ilustracion SVG reusable para cada disenio de gift card. Sin emojis, sin
 * gradientes decorativos agresivos — solo composiciones limpias tokens-driven.
 */

import type { ReactElement } from "react";
import type { GiftCardDesign } from "@/lib/mocks/gift-cards.mock";

type Props = {
  design: GiftCardDesign;
  className?: string;
};

const PALETTES: Record<
  GiftCardDesign,
  { bg: string; ink: string; muted: string }
> = {
  cumpleanos:     { bg: "#FDF2F8", ink: "#9D174D", muted: "#F9A8D4" },
  navidad:        { bg: "#F0FDF4", ink: "#166534", muted: "#86EFAC" },
  felicitaciones: { bg: "#FFFBEB", ink: "#92400E", muted: "#FCD34D" },
  aniversario:    { bg: "#F5F3FF", ink: "#5B21B6", muted: "#C4B5FD" },
  gracias:        { bg: "#F0F9FF", ink: "#075985", muted: "#7DD3FC" },
  "anio-nuevo":   { bg: "#EEF2FF", ink: "#3730A3", muted: "#A5B4FC" },
  bienvenida:     { bg: "#F0FDFA", ink: "#115E59", muted: "#5EEAD4" },
  general:        { bg: "#F8FAFC", ink: "#334155", muted: "#CBD5E1" },
};

export default function GiftCardArtwork({ design, className }: Props) {
  const palette = PALETTES[design];

  return (
    <svg
      viewBox="0 0 320 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="0" y="0" width="320" height="200" rx="16" fill={palette.bg} />
      {/* Decoracion tope: circulos sutiles */}
      <circle cx="40" cy="36" r="14" fill={palette.muted} opacity="0.55" />
      <circle cx="72" cy="28" r="6" fill={palette.muted} opacity="0.35" />
      <circle cx="260" cy="160" r="22" fill={palette.muted} opacity="0.4" />
      <circle cx="290" cy="134" r="8" fill={palette.muted} opacity="0.3" />
      {renderSymbol(design, palette.ink, palette.muted)}
      {/* Label */}
      <text
        x="28"
        y="178"
        fontSize="12"
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
        fontWeight="600"
        letterSpacing="0.5"
        fill={palette.ink}
      >
        TARJETA DE REGALO
      </text>
      <text
        x="28"
        y="192"
        fontSize="9"
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
        fontWeight="500"
        letterSpacing="1"
        fill={palette.ink}
        opacity="0.6"
      >
        BULEJE MARKETPLACE
      </text>
    </svg>
  );
}

function renderSymbol(
  design: GiftCardDesign,
  ink: string,
  muted: string,
): ReactElement {
  const cx = 160;
  const cy = 90;

  switch (design) {
    case "cumpleanos":
      return (
        <g>
          <rect x={cx - 36} y={cy - 14} width="72" height="40" rx="4" fill={muted} />
          <rect x={cx - 36} y={cy + 2} width="72" height="2" fill={ink} opacity="0.25" />
          <rect x={cx - 4} y={cy - 36} width="8" height="22" fill={ink} opacity="0.7" />
          <path d={`M${cx} ${cy - 40} L${cx - 4} ${cy - 46} L${cx + 4} ${cy - 46} Z`} fill={ink} />
        </g>
      );
    case "navidad":
      return (
        <g>
          <path
            d={`M${cx} ${cy - 36} L${cx - 24} ${cy} L${cx - 12} ${cy} L${cx - 28} ${cy + 20} L${cx + 28} ${cy + 20} L${cx + 12} ${cy} L${cx + 24} ${cy} Z`}
            fill={ink}
            opacity="0.85"
          />
          <rect x={cx - 6} y={cy + 20} width="12" height="10" fill={muted} />
        </g>
      );
    case "felicitaciones":
      return (
        <g>
          <circle cx={cx} cy={cy} r="30" fill={muted} />
          <path
            d={`M${cx - 14} ${cy} L${cx - 4} ${cy + 10} L${cx + 16} ${cy - 12}`}
            stroke={ink}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      );
    case "aniversario":
      return (
        <g>
          <path
            d={`M${cx} ${cy + 20} C${cx - 36} ${cy - 10}, ${cx - 36} ${cy - 36}, ${cx} ${cy - 18} C${cx + 36} ${cy - 36}, ${cx + 36} ${cy - 10}, ${cx} ${cy + 20} Z`}
            fill={ink}
            opacity="0.85"
          />
        </g>
      );
    case "gracias":
      return (
        <g>
          <rect x={cx - 40} y={cy - 18} width="80" height="40" rx="6" fill={muted} />
          <path
            d={`M${cx - 40} ${cy - 18} L${cx} ${cy + 6} L${cx + 40} ${cy - 18}`}
            stroke={ink}
            strokeWidth="2.5"
            fill="none"
          />
        </g>
      );
    case "anio-nuevo":
      return (
        <g>
          <circle cx={cx} cy={cy} r="26" stroke={ink} strokeWidth="2.5" fill="none" />
          <line x1={cx} y1={cy - 18} x2={cx} y2={cy} stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
          <line x1={cx} y1={cy} x2={cx + 14} y2={cy + 4} stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
    case "bienvenida":
      return (
        <g>
          <rect x={cx - 30} y={cy - 18} width="60" height="36" rx="4" fill={muted} />
          <path d={`M${cx - 30} ${cy - 18} L${cx} ${cy - 36} L${cx + 30} ${cy - 18} Z`} fill={ink} opacity="0.8" />
        </g>
      );
    case "general":
    default:
      return (
        <g>
          <rect x={cx - 28} y={cy - 20} width="56" height="36" rx="4" fill={muted} />
          <rect x={cx - 4} y={cy - 24} width="8" height="48" fill={ink} opacity="0.6" />
          <rect x={cx - 28} y={cy - 4} width="56" height="4" fill={ink} opacity="0.3" />
          <path
            d={`M${cx - 4} ${cy - 24} C${cx - 20} ${cy - 36}, ${cx + 4} ${cy - 36}, ${cx} ${cy - 24}`}
            stroke={ink}
            strokeWidth="2"
            fill="none"
          />
        </g>
      );
  }
}
