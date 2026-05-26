import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag } from "next/cache";
import { publicStoreWhere } from "@/lib/marketplace/public-store-filter";

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
  /** Portada — imagen principal de la card en /tiendas (4:3). */
  cover?: string | null;
  /** Banner — hero gigante al entrar al storefront (16:5). */
  banner?: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  description: string | null;
  lat?: number | null;
  lng?: number | null;
  vacationMode?: boolean;
  vacationMessage?: string | null;
  /** "Tienda en construccion" — overlay sobre la portada en /tiendas. */
  underConstruction?: boolean;
  underConstructionMessage?: string | null;
  /** Horario configurado por el dueño (jsonb). null si no hay hours custom. */
  openHours?:
    | Array<{ open: number; openMin: number; close: number; closeMin: number }>
    | Record<string, unknown>
    | null;
  /** Derivado server-side desde openHours. Default true para tiendas legacy. */
  isOpenNow?: boolean;
  /** ISO timestamp de la próxima apertura — null si todos los días closed. */
  nextOpeningAt?: string | null;
  /**
   * Nivel de visibilidad en /tiendas (controlado por superadmin):
   *   - "standard": card normal
   *   - "featured": card más grande + badge + prioridad
   *   - "premium":  card de fila completa con preview de productos + tope
   */
  displayTier?: StoreDisplayTier;
}

export type StoreDisplayTier = "standard" | "featured" | "premium";

/** Orden de prioridad: premium primero, luego featured, luego standard. */
export const TIER_RANK: Record<StoreDisplayTier, number> = {
  premium: 0,
  featured: 1,
  standard: 2,
};

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
    // 2026-05-26: visibilidad 100% por `isPublished` (controlada por el
    // SUPERADMIN en /superadmin/stores). Antes había un blocklist hardcodeado
    // (tienda-3/buleje/main/demo + patrón test/prueba/demo/sandbox) que ocultaba
    // "internamente" tiendas de prueba aunque estuvieran publicadas — Brandon
    // pidió que ese control viva SOLO en superadmin. Para ocultar una tienda,
    // el superadmin la despublica (botón Ocultar). Ver public-store-filter.ts.
    const rowsRaw = await prisma.store.findMany({
      where: { isPublished: true },
      orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
      take: 30,
      select: {
        id: true,
        slug: true,
        name: true,
        logo: true,
        banner: true,
        category: true,
        zone: true,
        rating: true,
        reviewCount: true,
        description: true,
      },
    });
    const rows = rowsRaw;

    // Patch cover via raw SQL — la columna existe en DB pero schema.prisma
    // no se actualiza (zona peligrosa). Sin esto, la portada nunca llega
    // al SSR de /tiendas y la card del marketplace usa solo el logo.
    const ids = rows.map((r) => r.id);
    let coverMap = new Map<string, string | null>();
    let hoursMap = new Map<string, unknown>();
    let tierMap = new Map<string, StoreDisplayTier>();
    if (ids.length > 0) {
      try {
        // Patch cover + hoursJson + displayTier — columnas que viven fuera del
        // schema Prisma (zona peligrosa). Mismo patrón raw-SQL para no migrar.
        const patches = await prisma.$queryRawUnsafe<
          Array<{ id: string; cover: string | null; hoursJson: unknown; displayTier: string | null }>
        >(
          `SELECT id, cover, "hoursJson", "displayTier" FROM "Store" WHERE id = ANY($1::text[])`,
          ids,
        );
        coverMap = new Map(patches.map((c) => [c.id, c.cover]));
        hoursMap = new Map(patches.map((c) => [c.id, c.hoursJson]));
        tierMap = new Map(
          patches.map((c) => [
            c.id,
            (c.displayTier === "premium" || c.displayTier === "featured"
              ? c.displayTier
              : "standard") as StoreDisplayTier,
          ]),
        );
      } catch {
        // sin cover/hours/tier → fallback al render normal
      }
    }

    // Bulk lookup del flag "Tienda en construccion" — JSON file storage,
    // mismo patron que store-category-orders (sin migracion). Cada card
    // muestra overlay si su slug tiene enabled=true.
    const { listConstructionMode } = await import("@/lib/store-construction-mode");
    const constructionMap: Record<string, { enabled: boolean; message?: string; updatedAt: string }> =
      await listConstructionMode().catch(() => ({}));

    // Helpers de horario para derivar isOpenNow + nextOpening en SSR.
    const { isOpenNow: storeIsOpenNow, nextOpening } = await import(
      "@/lib/marketplace-store-hours"
    );
    const NOW = new Date();

    const mapped = rows.map((s) => {
      const construction = constructionMap[s.slug];
      const hoursJson = hoursMap.get(s.id);
      const hasOwnHours = hoursJson && typeof hoursJson === "object";
      const isOpenNowVal = hasOwnHours
        ? storeIsOpenNow(hoursJson as never, NOW)
        : true; // legacy: sin hours → asumimos abierto
      const nextOpenAt = hasOwnHours ? nextOpening(hoursJson as never, NOW) : null;
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        logo: s.logo,
        cover: coverMap.get(s.id) ?? null,
        banner: s.banner,
        category: s.category,
        zone: s.zone,
        rating: s.rating,
        reviewCount: s.reviewCount,
        description: s.description,
        underConstruction: Boolean(construction?.enabled),
        underConstructionMessage: construction?.message ?? null,
        // ── Horario derivado ──
        openHours: hasOwnHours ? (hoursJson as never) : null,
        isOpenNow: isOpenNowVal,
        nextOpeningAt: nextOpenAt ? nextOpenAt.toISOString() : null,
        displayTier: tierMap.get(s.id) ?? "standard",
      };
    });

    // Orden final: premium → featured → standard (estable, preserva el orden
    // por rating dentro de cada nivel). Las tiendas con beneficio van arriba.
    return mapped.sort(
      (a, b) => TIER_RANK[a.displayTier] - TIER_RANK[b.displayTier],
    );
  } catch {
    // Graceful degrade: devuelve [] y el cliente hace fetch en useEffect.
    return [];
  }
}

/**
 * Conteo de tiendas PÚBLICAS — para el trust strip del header SSR ("N tiendas
 * activas"). Usa el mismo filtro que el listado público (excluye test/demo/
 * plataforma) para que el número coincida con lo que el usuario realmente ve.
 * Antes contaba todas las publicadas (incluía las de prueba) → decía 6 donde
 * el público ve 3. Devuelve 0 si la DB falla (el badge se oculta).
 */
export async function getPublishedStoreCount(): Promise<number> {
  "use cache";
  cacheLife("minutes");
  cacheTag("marketplace:stores");
  try {
    return await prisma.store.count({ where: publicStoreWhere });
  } catch {
    return 0;
  }
}
