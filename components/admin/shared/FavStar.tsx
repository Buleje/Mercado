"use client";

import { Star } from "lucide-react";
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
      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
      title={favs.isFav(id) ? "Quitar de favoritos" : "Agregar a favoritos"}
    >
      {favs.isFav(id) ? (
        <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
      ) : (
        <Star className="h-4 w-4 text-gray-300" />
      )}
    </button>
  );
}
