/**
 * marketplace-featured.db.ts — Tiendas destacadas cercanas al usuario.
 *
 * Una sola consulta: filtra Store por isPublished + featured (con fallback
 * a top-rated si no hay suficientes featured), embebe hasta N StoreProducts
 * activos como "productos destacados" para el preview drawer.
 *
 * Distancia haversine se calcula en JS — Postgres no tiene PostGIS habilitado
 * acá. Como pre-filtro DB usamos un bounding-box (~111 km/grado lat) para
 * evitar traer todas las stores del país. Con stores totales en 3 dígitos
 * el bounding-box es overkill pero deja la query lista para escalar.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { haversineKm } from "@/lib/geo-utils";
import { cacheLife, cacheTag } from "next/cache";
import { publicStoreWhere } from "@/lib/marketplace/public-store-filter";

export interface FeaturedNearbyProduct {
  id: string;
  productId: number;
  name: string;
  image: string;
  retailPrice: number;
  discountPrice: number | null;
  /** Hasta cuándo vale la oferta. `null` = sin caducidad. Sin este campo la
   *  tarjeta no puede saber si la rebaja sigue viva (ver `precio-vigente.ts`). */
  discountUntil: string | null;
  discountLabel: string | null;
}

export interface FeaturedNearbyStore {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  banner: string | null;
  category: string;
  /** zona del store (proxy de "dirección" hasta tener address en Store/Tenant). */
  zone: string | null;
  rating: number;
  reviewCount: number;
  description: string | null;
  distanceKm: number;
  productosDestacados: FeaturedNearbyProduct[];
}

interface GetFeaturedNearbyOpts {
  lat: number;
  lng: number;
  radiusKm: number;
  limit: number;
  productsPerStore: number;
}

/**
 * Devuelve hasta `limit` tiendas dentro de `radiusKm` ordenadas por
 * distancia ascendente. Embebe los productos activos top por id desc
 * (proxy simple de "destacados" — Buleje todavía no tiene flag featured
 * a nivel StoreProduct).
 */
export async function getFeaturedNearby(
  opts: GetFeaturedNearbyOpts,
): Promise<FeaturedNearbyStore[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("marketplace:featured-nearby");

  const { lat, lng, radiusKm, limit, productsPerStore } = opts;

  // Bounding box en grados — sobre-estima un poco para no perder edge cases.
  const latDelta = radiusKm / 110.574;
  const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180) || 1);

  const rows = await prisma.store.findMany({
    where: {
      isPublished: true,
      lat: { not: null, gte: lat - latDelta, lte: lat + latDelta },
      lng: { not: null, gte: lng - lngDelta, lte: lng + lngDelta },
    },
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
      lat: true,
      lng: true,
      products: {
        where: { isActive: true },
        orderBy: [{ id: "desc" }],
        take: productsPerStore,
        select: {
          id: true,
          productId: true,
          retailPrice: true,
          discountPrice: true,
          discountUntil: true,
          discountLabel: true,
          product: {
            select: { name: true, image: true },
          },
        },
      },
    },
    // Trae el doble del límite para tener margen post-haversine.
    take: limit * 4,
  });

  const enriched = rows
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => {
      const distanceKm = haversineKm(lat, lng, s.lat as number, s.lng as number);
      return {
        id: s.id,
        slug: s.slug,
        name: s.name,
        logo: s.logo,
        banner: s.banner,
        category: s.category,
        zone: s.zone,
        rating: s.rating,
        reviewCount: s.reviewCount,
        description: s.description,
        distanceKm,
        productosDestacados: s.products.map((p) => ({
          id: p.id,
          productId: p.productId,
          name: p.product.name,
          image: p.product.image,
          retailPrice: Number(p.retailPrice),
          discountPrice: p.discountPrice != null ? Number(p.discountPrice) : null,
          discountUntil: p.discountUntil ? p.discountUntil.toISOString() : null,
          discountLabel: p.discountLabel,
        })),
      } satisfies FeaturedNearbyStore;
    })
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => {
      // Prioridad: rating desc luego distancia asc — empate balanceado.
      const scoreA = a.rating * 0.6 - a.distanceKm * 0.05;
      const scoreB = b.rating * 0.6 - b.distanceKm * 0.05;
      return scoreB - scoreA;
    })
    .slice(0, limit);

  return enriched;
}

export interface FeaturedStoreWithProducts {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  banner: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  productsCount: number;
  productosDestacados: FeaturedNearbyProduct[];
}

/**
 * Tiendas destacadas SIN geolocalización — para la sección "Cerca tuyo" del
 * home cuando no hay coords del usuario. Misma estrategia de embeber productos
 * en UNA sola query (sin N+1), ordenadas por rating + reseñas. Cacheado.
 */
/** Producto para el showcase Premium: incluye su categoría para mostrar variedad. */
export interface ShowcaseProduct {
  productId: number;
  name: string;
  image: string;
  retailPrice: number;
  discountPrice: number | null;
  /** Sin esto la card Premium no puede saber si la rebaja venció. */
  discountUntil: string | null;
  category: string;
}

/**
 * Para las cards Premium de /tiendas: devuelve, por cada slug, UN producto de
 * cada categoría (hasta `maxCategories`) → el cliente ve la variedad de la
 * tienda, no 4 productos de lo mismo. Map slug → ShowcaseProduct[].
 */
export async function getStoreShowcaseByCategory(
  slugs: string[],
  maxCategories = 6,
): Promise<Record<string, ShowcaseProduct[]>> {
  "use cache";
  cacheLife("minutes");
  cacheTag("marketplace:featured-stores");

  if (slugs.length === 0) return {};
  const stores = await prisma.store.findMany({
    where: { slug: { in: slugs } },
    select: {
      slug: true,
      products: {
        where: { isActive: true },
        orderBy: [{ id: "desc" }],
        take: 60, // suficiente para cubrir todas las categorías
        select: {
          productId: true,
          retailPrice: true,
          discountPrice: true,
          discountUntil: true,
          product: { select: { name: true, image: true, category: true } },
        },
      },
    },
  });

  const out: Record<string, ShowcaseProduct[]> = {};
  for (const s of stores) {
    const seen = new Set<string>();
    const picked: ShowcaseProduct[] = [];
    for (const p of s.products) {
      const cat = p.product.category || "Otros";
      if (seen.has(cat)) continue;
      seen.add(cat);
      picked.push({
        productId: p.productId,
        name: p.product.name,
        image: p.product.image ?? "",
        retailPrice: Number(p.retailPrice),
        discountPrice: p.discountPrice != null ? Number(p.discountPrice) : null,
        discountUntil: p.discountUntil ? p.discountUntil.toISOString() : null,
        category: cat,
      });
      if (picked.length >= maxCategories) break;
    }
    out[s.slug] = picked;
  }
  return out;
}

export async function getFeaturedStoresWithProducts(opts: {
  limit: number;
  productsPerStore: number;
}): Promise<FeaturedStoreWithProducts[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("marketplace:featured-stores");

  const { limit, productsPerStore } = opts;

  const rows = await prisma.store.findMany({
    where: { ...publicStoreWhere, vacationMode: { not: true } },
    orderBy: [{ rating: "desc" }, { reviewCount: "desc" }],
    take: limit,
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
      _count: { select: { products: true } },
      products: {
        where: { isActive: true },
        orderBy: [{ id: "desc" }],
        take: productsPerStore,
        select: {
          id: true,
          productId: true,
          retailPrice: true,
          discountPrice: true,
          discountUntil: true,
          discountLabel: true,
          product: { select: { name: true, image: true } },
        },
      },
    },
  });

  return rows.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    logo: s.logo,
    banner: s.banner,
    category: s.category,
    zone: s.zone,
    rating: Number(s.rating ?? 0),
    reviewCount: s.reviewCount,
    productsCount: s._count.products,
    productosDestacados: s.products.map((p) => ({
      id: p.id,
      productId: p.productId,
      name: p.product.name,
      image: p.product.image ?? "",
      retailPrice: Number(p.retailPrice),
      discountPrice: p.discountPrice != null ? Number(p.discountPrice) : null,
      discountUntil: p.discountUntil ? p.discountUntil.toISOString() : null,
      discountLabel: p.discountLabel,
    })),
  }));
}
