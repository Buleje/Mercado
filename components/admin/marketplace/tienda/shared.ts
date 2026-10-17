import type { Dispatch, SetStateAction } from "react";
import type { MarketplaceStoreData } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";

export type SetStore = Dispatch<SetStateAction<MarketplaceStoreData>>;

/** Iniciales para el avatar cuando la tienda no tiene logo. */
export function inicialesTienda(store: Pick<MarketplaceStoreData, "name" | "slug">): string {
  return (
    (store.name || store.slug || "BS")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "BS"
  );
}
