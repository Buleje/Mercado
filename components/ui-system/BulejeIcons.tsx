"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Consistent lucide icon renderer.
 * All icons render with stroke 1.5 and consistent sizing.
 */
interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  as: LucideIcon;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  strokeWidth?: number;
}

const SIZE = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
  xl: "h-6 w-6",
};

export function Icon({ as: LucideComp, size = "md", strokeWidth = 1.5, className, ...rest }: IconProps) {
  return (
    <LucideComp
      className={cn(SIZE[size], className)}
      strokeWidth={strokeWidth}
      {...rest}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * BRAND SVG ICONS — Custom line-art (1.5 stroke, currentColor)
 * No emojis anywhere. Each icon is recognizable at 24-48px.
 * ═══════════════════════════════════════════════════════════════════════ */

interface BrandIconProps extends React.SVGAttributes<SVGSVGElement> {
  className?: string;
  strokeWidth?: number;
}

const baseSvgProps = (strokeWidth = 1.5) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/** Buleje brand mark — abstract bodega roofline + B */
export function BulejeMark({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 14h3a2 2 0 1 1 0 4H9v-4Z" />
      <path d="M9 10h3a2 2 0 1 1 0 4H9v-4Z" />
    </svg>
  );
}

/** Jungle leaf — Ucayali/Pucallpa motif */
export function JungleLeaf({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M20 4c-8 0-14 5-14 12a6 6 0 0 0 8 5.6" />
      <path d="M6 16c4 0 9-2 14-12" strokeOpacity="0.6" />
      <path d="M8 18h0" strokeLinecap="round" />
    </svg>
  );
}

/** Delivery moto — not a generic truck emoji */
export function DeliveryMoto({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <circle cx="6" cy="17" r="3" />
      <circle cx="18" cy="17" r="3" />
      <path d="M9 17h6" />
      <path d="M8 17l3-7h4l3 4" />
      <path d="M11 10h5" />
      <path d="M14 6h2l1 2" />
    </svg>
  );
}

/** Recipe pot — for cooking/recipes */
export function RecipePot({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M4 10h16" />
      <path d="M5 10v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
      <path d="M8 10V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" />
      <path d="M12 4v1" strokeOpacity="0.6" />
      <path d="M10 3v1" strokeOpacity="0.5" />
      <path d="M14 3v1" strokeOpacity="0.5" />
    </svg>
  );
}

/** Coin stack — for finances, billing, earnings */
export function CoinStack({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
      <path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
      <path d="M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
    </svg>
  );
}

/** Trend line — alternative to lucide trending-up, more editorial */
export function TrendLine({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M3 19h18" strokeOpacity="0.3" />
      <path d="M3 15 L8 10 L12 13 L16 7 L21 5" />
      <circle cx="8" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="21" cy="5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Document contract — for invoices, facturacion SUNAT, receipts */
export function DocumentContract({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M7 2h8l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path d="M15 2v4h4" />
      <path d="M9 11h6" strokeOpacity="0.5" />
      <path d="M9 14h6" strokeOpacity="0.5" />
      <path d="M9 17h4" strokeOpacity="0.5" />
    </svg>
  );
}

/** Pucallpa river curve — for location/zones */
export function RiverCurve({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M3 6c4 0 4 4 8 4s4-4 8-4" />
      <path d="M3 12c4 0 4 4 8 4s4-4 8-4" strokeOpacity="0.7" />
      <path d="M3 18c4 0 4 4 8 4s4-4 8-4" strokeOpacity="0.4" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * v4 — 12 iconos nuevos (Ola 1 Brand System)
 * ═══════════════════════════════════════════════════════════════════════ */

/** Canasta — orden/pedido */
export function Canasta({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M4 9h16l-2 11H6L4 9Z" />
      <path d="M8 9V5a4 4 0 0 1 8 0v4" />
      <path d="M9 13v4M12 13v4M15 13v4" />
    </svg>
  );
}

/** Olla — cocina/chef */
export function Olla({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M4 11h16v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6Z" />
      <path d="M3 11h18" />
      <path d="M8 8c0-1 1-1 1-2s-1-1-1-2" />
      <path d="M12 8c0-1 1-1 1-2s-1-1-1-2" />
      <path d="M16 8c0-1 1-1 1-2s-1-1-1-2" />
    </svg>
  );
}

/** Pesa — inventario por peso */
export function Pesa({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M4 9h16l-1.5 10a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2L4 9Z" />
      <circle cx="12" cy="14" r="3" />
      <path d="M10 5h4l-1 4h-2l-1-4Z" />
    </svg>
  );
}

/** BolsaDelivery — entrega a domicilio */
export function BolsaDelivery({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M5 8h14l-1 13H6L5 8Z" />
      <path d="M9 8V5a3 3 0 0 1 6 0v3" />
      <path d="M10 13h4M10 16h4" />
    </svg>
  );
}

/** RecetarioOpen — libro abierto recetas */
export function RecetarioOpen({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M3 5c3 0 6 1 9 3v13c-3-2-6-3-9-3V5Z" />
      <path d="M21 5c-3 0-6 1-9 3v13c3-2 6-3 9-3V5Z" />
      <path d="M7 9h3M7 12h3M14 9h3M14 12h3" />
    </svg>
  );
}

/** CuadernoFiado — cuaderno de credito cliente */
export function CuadernoFiado({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M5 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5V3Z" />
      <path d="M5 7h14M5 11h14M5 15h10" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}

/** HuellaCliente — identidad/fidelidad */
export function HuellaCliente({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M12 3c-4 0-7 3-7 7v3" />
      <path d="M19 13v-3c0-2-1-4-3-5" />
      <path d="M9 13v-3a3 3 0 0 1 6 0v3" />
      <path d="M9 16c0 2 1 4 2 5" />
      <path d="M15 16c0 2-1 4-2 5" />
      <path d="M12 12v5" />
    </svg>
  );
}

/** MapaUcayali — mapa regional con ubicacion */
export function MapaUcayali({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M4 5l5-2 6 2 5-2v14l-5 2-6-2-5 2V5Z" />
      <path d="M9 3v16M15 5v16" />
      <circle cx="12" cy="11" r="1.5" />
    </svg>
  );
}

/** BilleteSoles — efectivo/soles */
export function BilleteSoles({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <rect x="3" y="7" width="18" height="11" rx="1" />
      <circle cx="12" cy="12.5" r="2.5" />
      <path d="M6 10v5M18 10v5" />
    </svg>
  );
}

/** TanqueGas — gas domestico */
export function TanqueGas({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M8 21h8" />
      <path d="M7 8a5 5 0 0 1 10 0v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8Z" />
      <path d="M10 5V3h4v2" />
      <path d="M9 12h6" />
    </svg>
  );
}

/** NodosRed — red/multi-tienda */
export function NodosRed({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 7.5L10 10.5M17.5 7.5L14 10.5M6.5 16.5L10 13.5M17.5 16.5L14 13.5" />
    </svg>
  );
}

/** CursoGrafico — curso de precio/trend */
export function CursoGrafico({ className, strokeWidth, ...rest }: BrandIconProps) {
  return (
    <svg {...baseSvgProps(strokeWidth)} className={cn("h-5 w-5", className)} {...rest}>
      <path d="M3 20h18" />
      <path d="M7 16v-4" />
      <path d="M11 16v-8" />
      <path d="M15 16v-6" />
      <path d="M19 16v-10" />
      <path d="M5 8l4-4 4 3 6-5" />
      <path d="M15 2h4v4" />
    </svg>
  );
}

export const BULEJE_ICONS = {
  // v1
  mark: BulejeMark,
  leaf: JungleLeaf,
  moto: DeliveryMoto,
  pot: RecipePot,
  coins: CoinStack,
  trend: TrendLine,
  contract: DocumentContract,
  river: RiverCurve,
  // v4
  canasta: Canasta,
  olla: Olla,
  pesa: Pesa,
  bolsaDelivery: BolsaDelivery,
  recetarioOpen: RecetarioOpen,
  cuadernoFiado: CuadernoFiado,
  huellaCliente: HuellaCliente,
  mapaUcayali: MapaUcayali,
  billeteSoles: BilleteSoles,
  tanqueGas: TanqueGas,
  nodosRed: NodosRed,
  cursoGrafico: CursoGrafico,
} as const;
