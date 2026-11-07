"use client";

/**
 * ProductImagePlaceholder — placeholder estándar "Falta agregar imagen".
 *
 * Reusado por todas las secciones del catálogo (ProductCard, PopularProducts,
 * FlashDeals, FeaturedCarousel, LastUnitsSection, QuickAddModal). Se renderiza
 * cuando:
 *   - El producto no tiene `image` cargada en DB
 *   - O el `<Image>` falla en cargar (404, CORS, etc.)
 *
 * Indica al dueño que falta material visual sin romper la grilla.
 */

interface Props {
  /** Tamaño del icono (px). 32 default. */
  size?: number;
  /** Texto opcional (por defecto "Falta agregar imagen"). */
  label?: string;
  /** Si false, oculta el texto — útil para cards muy pequeñas. */
  showLabel?: boolean;
  className?: string;
}

export default function ProductImagePlaceholder({
  size = 32,
  label = "Falta agregar imagen",
  showLabel = true,
  className,
}: Props) {
  return (
    <div
      className={
        "absolute inset-0 flex flex-col items-center justify-center gap-2 border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)] p-2 " +
        (className ?? "")
      }
      aria-label={label}
      // Hook estable para ocultar el nag "Falta agregar imagen" SOLO en la tienda
      // individual del comerciante (CSS scopeado a [data-store-chrome="tenant"]):
      // al cliente final no le mostramos copy interno de admin. Brandon 2026-06-22.
      data-img-placeholder=""
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-40"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <rect width={18} height={18} x={3} y={3} rx={2} />
        <circle cx={9} cy={9} r={2} />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
      {showLabel && (
        <span className="text-[length:var(--ts-2xs)] font-semibold text-center leading-tight">
          {label}
        </span>
      )}
    </div>
  );
}
