import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";

/**
 * Shape esperado por MarketplaceContent.initialStores.
 *
 * Debe coincidir con el shape de la API pública
 * `/api/marketplace/stores` — no divergir.
 */
export interface InitialStore {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  description: string | null;
  lat?: number | null;
  lng?: number | null;
  vacationMode?: boolean;
  vacationMessage?: string | null;
}

/**
 * Fetches top published stores para el first paint del marketplace.
 *
 * Usa Next 16 Cache Components (ADR-019):
 *   - `"use cache"` hace el resultado cacheable por el framework
 *   - `cacheLife("minutes")` = TTL ~5 min
 *   - `cacheTag("marketplace:stores")` = invalidable on admin changes
 *
 * Devuelve máximo 30 stores — enough para first paint + above-the-fold.
 * El cliente seguirá haciendo fetch para filtros/zonas/búsqueda.
 *
 * Si el fetch falla (DB down), devuelve array vacío — el cliente hará
 * su propio fetch y el skeleton aparece como fallback.
 */
export async function getInitialMarketplaceStores(): Promise<InitialStore[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("marketplace:stores");

  try {
    const rows = await prisma.store.findMany({
      where: { isPublished: true },
      orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
      take: 30,
      select: {
        id: true,
        slug: true,
        name: true,
        logo: true,
        category: true,
        zone: true,
        rating: true,
        reviewCount: true,
        description: true,
      },
    });

    return rows.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      logo: s.logo,
      category: s.category,
      zone: s.zone,
      rating: s.rating,
      reviewCount: s.reviewCount,
      description: s.description,
    }));
  } catch {
    // Graceful degrade: devuelve [] y el cliente hace fetch en useEffect.
    return [];
  }
}
