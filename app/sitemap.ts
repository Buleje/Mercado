import type { MetadataRoute } from "next";
import { categories, slugify } from "@/data/products";
import { zones } from "@/data/zones";
import { districts } from "@/data/districts";
import { prisma } from "@/lib/prisma";

const realCategories = categories.filter((c) => c.id !== "todos");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_URL || "https://www.buleje.pe";
  const lastModified = new Date();

  // SECURITY 2026-05-06 (audit storefront H03): el sitemap raíz solo expone
  // productos del tenant "main" (Buleje plataforma) + cap a 1000 entries
  // (audit H11). Antes se listaban productos cross-tenant → competidores
  // enumeraban todo el catálogo de tiendas privadas. Cada tenant debe
  // generar su propio sitemap por subdominio (futuro: sitemap multi-archivo).
  let dbProducts: { id: number; name: string }[] = [];
  try {
    dbProducts = await prisma.product.findMany({
      where: { tenantId: "main", active: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
      take: 1000,
    });
  } catch {
    // DB unavailable during static build — fall back to empty
  }

  // Static pages with high priority
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "daily",
      priority: 1.0,
      alternates: { languages: { "es-PE": baseUrl } },
    },
    {
      url: `${baseUrl}/tienda`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
      alternates: { languages: { "es-PE": `${baseUrl}/tienda` } },
    },
    {
      url: `${baseUrl}/recetas`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/buscar`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/tiendas`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.95,
      alternates: { languages: { "es-PE": `${baseUrl}/tiendas` } },
    },
    {
      url: `${baseUrl}/marketplace/ofertas`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.85,
      alternates: { languages: { "es-PE": `${baseUrl}/marketplace/ofertas` } },
    },
    {
      url: `${baseUrl}/marketplace/explorar`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: `${baseUrl}/marketplace/como-pagar`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
      alternates: { languages: { "es-PE": `${baseUrl}/marketplace/como-pagar` } },
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/registro`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/about`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/ayuda`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacidad`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terminos`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // Category pages (excluding "todos")
  const categoryPages: MetadataRoute.Sitemap = categories
    .filter((cat) => cat.id !== "todos")
    .map((cat) => ({
      url: `${baseUrl}/tienda/categoria/${cat.id}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.8,
      alternates: { languages: { "es-PE": `${baseUrl}/tienda/categoria/${cat.id}` } },
    }));

  // Dynamic DB categories (if any not in static data)
  let dbCategoryPages: MetadataRoute.Sitemap = [];
  try {
    const dbCats = await prisma.product.findMany({
      where: { active: true, deletedAt: null },
      select: { category: true },
      distinct: ["category"],
    });
    const staticCatIds = new Set(categories.map((c) => c.id));
    dbCategoryPages = dbCats
      .filter((c) => c.category && !staticCatIds.has(c.category))
      .map((c) => ({
        url: `${baseUrl}/tienda/categoria/${encodeURIComponent(c.category)}`,
        lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
  } catch {
    // ignore
  }

  // Individual product pages — dynamic from DB
  const productPages: MetadataRoute.Sitemap = dbProducts.map((product) => ({
    url: `${baseUrl}/tienda/${product.id}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  // ────────────────────────────────────────────────────────────────────────
  // Task #13: Marketplace stores + store products + recipes
  // ────────────────────────────────────────────────────────────────────────

  // Marketplace stores + store products — dynamic from DB
  const marketplacePages: MetadataRoute.Sitemap = [];
  try {
    // Fetch all published stores
    const stores = await prisma.store.findMany({
      where: { isPublished: true },
      select: { id: true, slug: true, updatedAt: true },
      orderBy: { rating: "desc" },
    });

    // Add marketplace hub
    marketplacePages.push({
      url: `${baseUrl}/marketplace`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.9,
    });

    // Add individual store pages
    const storePages = stores.map((s) => ({
      url: `${baseUrl}/marketplace/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
    marketplacePages.push(...storePages);

    // Audit 2026-05-17 02-P2-3: incluir páginas /t/[slug] (storefronts
    // white-label de tenants) en sitemap root. Antes solo se exponían
    // /marketplace/${slug} y los tenants white-label quedaban fuera de
    // Google. Reusamos la query de stores publicadas porque cada Store
    // tiene un Tenant asociado (slug es la misma identidad).
    const tenantPages = stores.map((s) => ({
      url: `${baseUrl}/t/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
    marketplacePages.push(...tenantPages);

    // Fetch all active store products from all published stores
    const storeIds = stores.map((s) => s.id);
    if (storeIds.length > 0) {
      // Audit 2026-05-17 02-P1-03: sin take, findMany puede retornar miles
      // de rows en build → OOM en Vercel build container. Cap a 5000 productos
      // priorizando los más recientes (sitemap Google acepta hasta 50k URLs,
      // 5k es safe + cubre los más relevantes para SEO).
      const storeProducts = await prisma.storeProduct.findMany({
        where: {
          storeId: { in: storeIds },
          isActive: true,
        },
        select: {
          id: true,
          storeId: true,
          productId: true,
        },
        orderBy: { id: "desc" },
        take: 5000,
      });

      // Build storeId -> slug map
      const storeSlugMap = new Map(stores.map((s) => [s.id, s.slug]));

      // StoreProduct no tiene updatedAt — usar ahora mismo como fallback conservador.
      const now = new Date();

      // Add store product detail pages: /marketplace/{storeSlug}/producto/{productId}
      const productDetailPages = storeProducts.map((sp) => {
        const storeSlug = storeSlugMap.get(sp.storeId) || "unknown";
        return {
          url: `${baseUrl}/marketplace/${storeSlug}/producto/${sp.productId}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
        };
      });
      marketplacePages.push(...productDetailPages);
    }
  } catch {
    // DB unavailable during static build
    marketplacePages.push({
      url: `${baseUrl}/marketplace`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.9,
    });
  }

  // Recipe detail pages — REACTIVADO 2026-04-20 (Sprint S2).
  // La pagina app/marketplace/recetas/[id]/page.tsx ahora existe con
  // metadata SEO + JSON-LD Recipe schema.
  let recipePages: MetadataRoute.Sitemap = [];
  try {
    const recipes = await prisma.receta.findMany({
      where: { activa: true },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    });

    recipePages = recipes.map((r) => ({
      url: `${baseUrl}/marketplace/recetas/${r.id}`,
      lastModified: r.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    // DB unavailable — devolver lista vacia es safe
  }

  // Programmatic SEO — zone pages (/zona/[ciudad] + /zona/[ciudad]/[categoria])
  const zonePages: MetadataRoute.Sitemap = [];
  for (const zone of zones) {
    // City landing page
    zonePages.push({
      url: `${baseUrl}/zona/${zone.slug}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.85,
    });
    // City × category pages
    for (const cat of realCategories) {
      zonePages.push({
        url: `${baseUrl}/zona/${zone.slug}/${cat.id}`,
        lastModified,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  }

  // Programmatic SEO — zone × product pages (/zona/[ciudad]/producto/[slug])
  const zoneProductPages: MetadataRoute.Sitemap = [];
  if (dbProducts.length > 0) {
    for (const zone of zones) {
      for (const product of dbProducts) {
        zoneProductPages.push({
          url: `${baseUrl}/zona/${zone.slug}/producto/${slugify(product.name)}`,
          lastModified,
          changeFrequency: "weekly",
          priority: 0.6,
        });
      }
    }
  }

  // Programmatic SEO — district landing + district × category pages
  // /zona/[ciudad]/distrito/[distrito] + /zona/[ciudad]/distrito/[distrito]/[categoria]
  const districtPages: MetadataRoute.Sitemap = [];
  for (const district of districts) {
    // District landing
    districtPages.push({
      url: `${baseUrl}/zona/${district.cityslug}/distrito/${district.slug}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.78,
    });
    // District × category
    for (const cat of realCategories) {
      districtPages.push({
        url: `${baseUrl}/zona/${district.cityslug}/distrito/${district.slug}/${cat.id}`,
        lastModified,
        changeFrequency: "daily",
        priority: 0.72,
      });
    }
  }

  // TS-43: Tiendas directorio + rutas por zona (long-tail SEO)
  const TIENDAS_ZONES = ["centro", "manantay", "calleria", "yarinacocha", "campo_verde"] as const;
  const tiendasPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/tiendas`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...TIENDAS_ZONES.map((z) => ({
      url: `${baseUrl}/tiendas/${z}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.85,
    })),
  ];

  return [
    ...staticPages,
    ...categoryPages,
    ...dbCategoryPages,
    ...productPages,
    ...marketplacePages,    // Stores + store products
    ...recipePages,         // Recipe detail pages
    ...zonePages,
    ...zoneProductPages,
    ...districtPages,       // District landing + district × category
    ...tiendasPages,        // TS-43: directorio + rutas por zona
  ];
}
