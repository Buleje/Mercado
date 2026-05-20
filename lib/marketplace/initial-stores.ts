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
    // Brandon 2026-05-20 v11 audit P0: filtramos tiendas de prueba/demo
    // del listado público — audit detectó "Tienda 3 Pruebas" y "buleje"
    // en minúscula apareciendo en home + /tiendas + JSON-LD + sitemap,
    // dañando credibilidad del marketplace y diluyendo el index Google.
    const TEST_SLUG_BLOCKLIST = new Set(["tienda-3", "buleje", "main", "demo"]);
    const TEST_PATTERN = /(test|prueba|demo|sandbox|pruebas)/i;
    const rowsRaw = await prisma.store.findMany({
      where: { isPublished: true },
      orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
      take: 60, // pedimos más para compensar las que filtremos abajo
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
    const rows = rowsRaw
      .filter(
        (s) =>
          !TEST_SLUG_BLOCKLIST.has(s.slug.toLowerCase()) &&
          !TEST_PATTERN.test(s.slug) &&
          !TEST_PATTERN.test(s.name ?? ""),
      )
      .slice(0, 30);

    // Patch cover via raw SQL — la columna existe en DB pero schema.prisma
    // no se actualiza (zona peligrosa). Sin esto, la portada nunca llega
    // al SSR de /tiendas y la card del marketplace usa solo el logo.
    const ids = rows.map((r) => r.id);
    let coverMap = new Map<string, string | null>();
    let hoursMap = new Map<string, unknown>();
    if (ids.length > 0) {
      try {
        // Patch cover y hoursJson juntos — ambas columnas viven fuera del schema Prisma.
        const patches = await prisma.$queryRawUnsafe<
          Array<{ id: string; cover: string | null; hoursJson: unknown }>
        >(
          `SELECT id, cover, "hoursJson" FROM "Store" WHERE id = ANY($1::text[])`,
          ids,
        );
        coverMap = new Map(patches.map((c) => [c.id, c.cover]));
        hoursMap = new Map(patches.map((c) => [c.id, c.hoursJson]));
      } catch {
        // sin cover/hours → fallback al render sin overlay closed
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

    return rows.map((s) => {
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
      };
    });
  } catch {
    // Graceful degrade: devuelve [] y el cliente hace fetch en useEffect.
    return [];
  }
}
