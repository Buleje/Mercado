"use client";

/**
 * Mapping de categoría (id o label) a ilustración Buleje.
 * Reemplaza los emojis en filtros de la tienda pública.
 *
 * - Categorias con ilustracion propia: frutas-verduras, carnes, lacteos,
 *   bebidas, limpieza, abarrotes.
 * - "todos" y fallback: Store icon (lucide) — no necesita ilustracion completa.
 */

import type { ComponentType, SVGAttributes } from "react";
import { Store } from "@buleje/design-system/icons";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
  BodegaAbriendo,
} from "@/components/ui-system/illustrations";

export type CategoryIconProps = SVGAttributes<SVGSVGElement> & {
  className?: string;
  size?: number;
  strokeWidth?: number;
};

export type CategoryIconComponent = ComponentType<CategoryIconProps>;

/**
 * Adapter que normaliza la firma de lucide `Store` al mismo shape
 * que usan las ilustraciones Buleje (size, strokeWidth, className).
 */
function StoreIconAdapter({ size = 160, strokeWidth, className, ...rest }: CategoryIconProps) {
  return (
    <Store
      width={size}
      height={size}
      strokeWidth={strokeWidth ?? 1.75}
      className={className}
      aria-hidden
      {...rest}
    />
  );
}

const BY_ID: Record<string, CategoryIconComponent> = {
  "todos": StoreIconAdapter,
  "frutas-verduras": VerduraFresca,
  "carnes": CarniceriaFresca,
  "lacteos": LacteosRefresh,
  "bebidas": BebidasVarias,
  "limpieza": LimpiezaDomicilio,
  "abarrotes": BodegaAbriendo,
};

/**
 * Devuelve el componente de ilustración apropiado para una categoría.
 * Si no hay match, usa StoreIconAdapter como fallback neutro.
 */
export function getCategoryIcon(idOrLabel: string | undefined | null): CategoryIconComponent {
  if (!idOrLabel) return StoreIconAdapter;
  const key = idOrLabel.toLowerCase().trim();
  if (BY_ID[key]) return BY_ID[key];
  // Fallback: intenta match por label normalizado (ej "Frutas y Verduras")
  const normalized = key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+y\s+/g, "-")
    .replace(/\s+/g, "-");
  return BY_ID[normalized] ?? StoreIconAdapter;
}

/** True si la categoria tiene ilustración Buleje (distinta del fallback Store). */
export function hasCategoryIllustration(idOrLabel: string | undefined | null): boolean {
  const Icon = getCategoryIcon(idOrLabel);
  return Icon !== StoreIconAdapter;
}
