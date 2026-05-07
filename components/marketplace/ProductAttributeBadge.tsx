"use client";

/**
 * ProductAttributeBadge — Sticker con mini-ilustración para atributos especiales
 * de productos del marketplace. Se monta como absolute sobre ProductCard.
 *
 * No invade la card original — se usa como overlay decorativo + aria-label.
 *
 * Variantes:
 *  - "socio": Exclusivo para socios Buleje (corona)
 *  - "bodega-al-mes": Producto con suscripción recurrente (calendario)
 *  - "en-vivo": Producto destacado en live actual (chip LIVE)
 *  - "asistente": Recomendado por asistente IA (bot)
 *
 * @example
 * <div className="relative">
 *   <ProductCard product={p} />
 *   {p.isSocio && (
 *     <ProductAttributeBadge variant="socio" position="top-left" />
 *   )}
 * </div>
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  SocioCorona,
  CalendarioEntrega,
  VideoEnVivo,
  AsistenteBuleje,
} from "@/components/ui-system/illustrations";

export type ProductAttributeVariant =
  | "socio"
  | "bodega-al-mes"
  | "en-vivo"
  | "asistente";

type Position = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface Props {
  variant: ProductAttributeVariant;
  /** Posición absolute dentro del contenedor relative. Default: "top-left". */
  position?: Position;
  /** Override del label accesible por defecto. */
  ariaLabel?: string;
  className?: string;
}

const POSITION_CLS: Record<Position, string> = {
  "top-left": "top-2 left-2",
  "top-right": "top-2 right-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-right": "bottom-2 right-2",
};

interface VariantConfig {
  illustration: ReactNode;
  label: string;
  tone: string;
}

function buildVariants(strokeSize: number): Record<ProductAttributeVariant, VariantConfig> {
  return {
    socio: {
      illustration: <SocioCorona size={strokeSize} />,
      label: "Exclusivo para socios Buleje",
      tone: "bg-[var(--accent,var(--text-primary))]/10 text-[var(--accent,var(--text-primary))] border-[var(--accent,var(--text-primary))]/25",
    },
    "bodega-al-mes": {
      illustration: <CalendarioEntrega size={strokeSize} />,
      label: "Disponible en Bodega al Mes (suscripción)",
      tone: "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)] border-[var(--data-success-500)]/25",
    },
    "en-vivo": {
      illustration: <VideoEnVivo size={strokeSize} />,
      label: "Destacado en vivo ahora",
      tone: "bg-[var(--data-error,#e11d48)]/10 text-[var(--data-error,#e11d48)] border-[var(--data-error,#e11d48)]/25",
    },
    asistente: {
      illustration: <AsistenteBuleje size={strokeSize} />,
      label: "Recomendado por el asistente IA",
      tone: "bg-[var(--text-primary)]/5 text-[var(--text-primary)] border-[var(--rule-base)]",
    },
  };
}

export function ProductAttributeBadge({
  variant,
  position = "top-left",
  ariaLabel,
  className,
}: Props) {
  const VARIANTS = buildVariants(20);
  const config = VARIANTS[variant];

  return (
    <div
      className={cn(
        "absolute z-10 inline-flex items-center justify-center",
        "h-8 w-8 rounded-full border",
        "backdrop-blur-sm shadow-sm",
        config.tone,
        POSITION_CLS[position],
        className,
      )}
      role="img"
      aria-label={ariaLabel ?? config.label}
      title={ariaLabel ?? config.label}
    >
      {config.illustration}
    </div>
  );
}

/**
 * ProductAttributeChip — Versión pill con ilustración + label, útil para
 * mostrar dentro del body de la card o como sticker extendido.
 */
export function ProductAttributeChip({
  variant,
  label,
  className,
}: {
  variant: ProductAttributeVariant;
  /** Override del label mostrado. */
  label?: string;
  className?: string;
}) {
  const VARIANTS = buildVariants(14);
  const config = VARIANTS[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.05em]",
        config.tone,
        className,
      )}
    >
      <span className="inline-flex shrink-0" aria-hidden="true">
        {config.illustration}
      </span>
      {label ?? variantLabel(variant)}
    </span>
  );
}

function variantLabel(variant: ProductAttributeVariant): string {
  if (variant === "socio") return "Socio";
  if (variant === "bodega-al-mes") return "Bodega al mes";
  if (variant === "en-vivo") return "En vivo";
  return "IA";
}
