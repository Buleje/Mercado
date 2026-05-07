"use client";

import { Star } from "@buleje/design-system/icons";
import type { useFavoriteCharts } from "@/hooks/use-favorite-charts";

/**
 * Shared favorite star button for chart cards.
 * Replaces: ComprasFavStar, SalesFavStar, CatFavStar, FavStar, FinanzasFavStar.
 */
export default function FavStar({
  id,
  favs,
}: {
  id: string;
  favs: ReturnType<typeof useFavoriteCharts>;
}) {
  return (
    <button
      onClick={() => favs.toggle(id)}
      className="p-1 hover:bg-[var(--surface-sunken)] rounded transition-colors"
      title={favs.isFav(id) ? "Quitar de favoritos" : "Agregar a favoritos"}
    >
      {favs.isFav(id) ? (
        <Star className="h-4 w-4 text-[var(--data-warning-500)] fill-[var(--data-warning-500)]" />
      ) : (
        <Star className="h-4 w-4 text-[var(--text-tertiary)]" />
      )}
    </button>
  );
}
