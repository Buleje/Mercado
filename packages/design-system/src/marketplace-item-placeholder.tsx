/**
 * MarketplaceItemPlaceholder — placeholder canonical para productos sin imagen (ADR-075).
 *
 * Icono storefront lineal gris, sin ilustraciones Pucallpa, sin colores vibrantes.
 * Aspect 1:1. Label "Sin foto" opcional.
 *
 * Diferencia con StoreImagePlaceholder:
 * - Este es para ITEMS/PRODUCTOS (no tiendas).
 * - Usa un solo icono storefront neutral (no rota entre 4 ilustraciones).
 * - Aspect cuadrado (1/1) en lugar de 4/3.
 *
 * @example
 *   <MarketplaceItemPlaceholder />
 *   <MarketplaceItemPlaceholder label="Sin imagen" className="rounded-t-xl" />
 */
"use client";

import { cn } from "./utils";

export interface MarketplaceItemPlaceholderProps {
  /** Texto del label inferior. Default: "Sin foto". Pasar null para ocultar. */
  label?: string | null;
  /** Override de clases del contenedor. */
  className?: string;
}

/**
 * Icono storefront — una sola fachada de tienda, strokeWidth 1.5, sin relleno.
 * Identico al icono del screenshot de referencia.
 */
function StorefrontIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* Techo / awning */}
      <path d="M8 26 L32 10 L56 26" />
      <path d="M6 26 H58" />
      {/* Cuerpo de la tienda */}
      <rect x="10" y="26" width="44" height="28" />
      {/* Puerta central */}
      <rect x="26" y="38" width="12" height="16" rx="1" />
      {/* Ventana izquierda */}
      <rect x="14" y="32" width="10" height="8" rx="1" />
      {/* Ventana derecha */}
      <rect x="40" y="32" width="10" height="8" rx="1" />
      {/* Sol decorativo pequeño arriba */}
      <circle cx="32" cy="6" r="3" />
      <path d="M32 1 V3 M32 9 V11 M27 6 H25 M39 6 H37 M28.5 2.5 L27 1 M36.5 9.5 L38 11 M36.5 2.5 L38 1 M28.5 9.5 L27 11" strokeWidth={1} />
    </svg>
  );
}

export function MarketplaceItemPlaceholder({
  label = "Sin foto",
  className,
}: MarketplaceItemPlaceholderProps) {
  return (
    <div
      role="img"
      aria-label="Producto sin foto"
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-1.5",
        "bg-[var(--surface-sunken)]",
        className,
      )}
    >
      <StorefrontIcon className="w-14 h-14 text-[var(--text-tertiary)] opacity-50" />
      {label != null && (
        <span
          aria-hidden="true"
          className="text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)]"
        >
          {label}
        </span>
      )}
    </div>
  );
}
