/**
 * ProductPhotoFallback — placeholder amable para productos SIN foto.
 *
 * Única fuente del "sin foto" del marketplace (Brandon 2026-07-04): ícono Lucide
 * de la categoría en un círculo con tinte de marca + nombre del producto sobre un
 * degradado suave. Convierte el negativo ("no hay imagen") en un tile intencional
 * y reconocible, en vez del texto crudo "Sin foto". Presentational, server-safe.
 *
 * Se usa en UnifiedProductCard (card principal) y en cualquier mini-card que antes
 * pintaba su propio "Sin foto" (CartSuggestions, etc.).
 */

import {
  Pizza,
  Beef,
  Beer,
  Carrot,
  ChefHat,
  Cookie,
  Croissant,
  Drumstick,
  Fish,
  Milk,
  Sandwich,
  Apple,
  Package,
  ShoppingCart,
  type LucideIcon,
} from "@buleje/design-system/icons";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  abarrotes: Package,
  bebidas: Beer,
  carnes: Beef,
  lacteos: Milk,
  frutas: Apple,
  verduras: Carrot,
  panaderia: Croissant,
  golosinas: Cookie,
  limpieza: Package,
  hogar: Package,
  mascotas: Package,
  bebes: Package,
  farmacia: Package,
  ferreteria: Package,
  pollo: Drumstick,
  polleria: Drumstick,
  pescados: Fish,
  congelados: Package,
  pizza: Pizza,
  pizzas: Pizza,
  pizzeria: Pizza,
  sandwich: Sandwich,
  sandwiches: Sandwich,
  comida: ChefHat,
  comidas: ChefHat,
  restaurante: ChefHat,
  restaurantes: ChefHat,
  default: ShoppingCart,
};

/** Normaliza la categoría (sin tildes, minúscula) para matchear el mapa. */
function iconFor(category?: string | null): LucideIcon {
  const key = (category ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return CATEGORY_ICON[key] ?? CATEGORY_ICON.default;
}

export function ProductPhotoFallback({
  name,
  category,
  /** Tamaño del círculo del ícono. "sm" para mini-cards, "md" (default) para el card grande. */
  size = "md",
  showName = true,
}: {
  name?: string | null;
  category?: string | null;
  size?: "sm" | "md";
  showName?: boolean;
}) {
  const Icon = iconFor(category);
  const circle = size === "sm" ? "h-11 w-11" : "h-16 w-16";
  const glyph = size === "sm" ? "h-5 w-5" : "h-8 w-8";
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-3 bg-linear-to-br from-[var(--accent)]/8 via-[var(--surface-canvas)] to-[var(--accent)]/5"
      aria-label={name ? `${name} — sin foto` : "Producto sin foto"}
    >
      <span
        className={`inline-flex ${circle} items-center justify-center rounded-full bg-[var(--accent)]/12 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/15`}
        aria-hidden
      >
        <Icon className={glyph} strokeWidth={1.5} />
      </span>
      {showName && name && (
        <p className="text-xs font-bold text-[var(--text-secondary)] leading-tight line-clamp-2 max-w-[92%]">
          {name}
        </p>
      )}
    </div>
  );
}
