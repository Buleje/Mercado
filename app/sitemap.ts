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
  //
  // NOTA: Product model no tiene updatedAt/createdAt en schema actual.
  // Usamos lastModified compartido. Pendiente: agregar `updatedAt DateTime @updatedAt`
  // a Product (migration breaking) para lastModified real por producto.
  let dbProducts: { id: number; name: string }[] = [];
  try {
    dbProducts = await prisma.product.findMany({
      where: { tenantId: "main", active: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { id: "desc" },
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
    // 2026-05-28 SEO fix: /buscar REMOVIDO del sitemap.
    // Search-result pages NUNCA deben estar en sitemap — diluyen crawl budget
    // y Google las indexa como contenido duplicado del catálogo. La pagina
    // /buscar/page.tsx debe tener metadata.robots = { index: false } (TODO).
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
    // Brandon 2026-05-27 SEO: /negocios y /abrir-tienda son las landings B2B
    // de mayor intención comercial (software para bodegas). Estaban AUSENTES
    // del sitemap — Google no las priorizaba. priority alto + changeFrequency
    // weekly (cambian con ofertas del Plan Fundador / precios).
    {
      url: `${baseUrl}/negocios`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.95,
      alternates: { languages: { "es-PE": `${baseUrl}/negocios` } },
    },
    {
      url: `${baseUrl}/abrir-tienda`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: { languages: { "es-PE": `${baseUrl}/abrir-tienda` } },
    },
    {
      url: `${baseUrl}/vender`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.85,
      alternates: { languages: { "es-PE": `${baseUrl}/vender` } },
    },
    // Brandon 2026-05-20 v10 audit P1 SEO: /pricing y /registro REMOVIDOS
    // del sitemap — son paginas internas/transaccionales que no aportan
    // valor SEO y diluyen la calidad del index. Si necesitan estar
    // indexadas en el futuro, restaurar + agregar metadata.robots noindex
    // donde corresponda.
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
  //
  // 2026-05-28 BUGFIX: el dedup contra static categories era case-sensitive
  // y comparaba ID-slug (frutas-verduras) contra label-DB (Frutas y Verduras).
  // Resultado: Google veía DUPLICADOS para cada categoría (slug + label encoded).
  // Ahora normalizamos AMBAS fuentes a slug y deduplicamos correctamente.
  let dbCategoryPages: MetadataRoute.Sitemap = [];
  try {
    const dbCats = await prisma.product.findMany({
      // SECURITY 2026-05-25 (audit): scope a tenant "main" — antes exponía
      // categorías cross-tenant en el sitemap público (mismo patrón que dbProducts arriba).
      where: { tenantId: "main", active: true, deletedAt: null },
      select: { category: true },
      distinct: ["category"],
    });
    // Set normalizada de IDs ya cubiertos por categoryPages: slug del id + slug del label.
    const staticCatSlugs = new Set<string>();
    for (const c of categories) {
      staticCatSlugs.add(c.id);
      staticCatSlugs.add(slugify(c.label));
    }
    dbCategoryPages = dbCats
      .filter((c) => c.category && !staticCatSlugs.has(slugify(c.category)))
      .map((c) => ({
        // Emite SIEMPRE el slug normalizado (no encodeURIComponent del nombre
        // capitalizado). Cierra la duplicación con dbCategoryPages.
        url: `${baseUrl}/tienda/categoria/${slugify(c.category)}`,
        lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
  } catch {
    // ignore
  }

  // Individual product pages — dynamic from DB
  //
  // 2026-05-28 BUGFIX: antes emitía /tienda/{id} (1252382 etc) pero el route
  // handler `app/(store)/tienda/[slug]/page.tsx` espera SLUG del nombre
  // (línea 28: `slugify(p.name) === slug`). Resultado: 80+ URLs en sitemap
  // apuntaban a 404. Ahora emite /tienda/{slug} usando el mismo slugify().
  //
  // Productos sin nombre (edge case) se filtran porque slugify("") === "".
  //
  // Dedup adicional: si dos productos generan el mismo slug (ej. "agua-cielo"
  // de "Agua Cielo" y "Agua Cielo!" ambos slugify a "agua-cielo"), Set descarta
  // duplicados — Google no debe ver 2 URLs idénticas.
  const seenSlugs = new Set<string>();
  const productPages: MetadataRoute.Sitemap = dbProducts
    .map((product) => ({ slug: slugify(product.name || "") }))
    .filter(({ slug }) => {
      if (!slug || seenSlugs.has(slug)) return false;
      seenSlugs.add(slug);
      return true;
    })
    .map(({ slug }) => ({
      url: `${baseUrl}/tienda/${slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

  // ────────────────────────────────────────────────────────────────────────
  // Task #13: Marketplace stores + store products + recipes
  // ────────────────────────────────────────────────────────────────────────

  // Marketplace stores + store products — dynamic from DB.
  // Brandon 2026-05-20 v10 audit P0: filtramos tiendas de prueba/test
  // (slug contiene "test", "prueba", "demo" o exactos "buleje"/"main"/
  // "tienda-3") — Google indexaba 13+ urls de "Tienda 3 Pruebas" con
  // contenido vacío, dañando la calidad del sitio.
  const TEST_SLUG_BLOCKLIST = new Set(["tienda-3", "buleje", "main", "demo"]);
  const TEST_SLUG_PATTERN = /(test|prueba|demo|sandbox)/i;
  const marketplacePages: MetadataRoute.Sitemap = [];
  try {
    // Fetch all published stores
    const stores = (await prisma.store.findMany({
      where: { isPublished: true },
      select: { id: true, slug: true, updatedAt: true, name: true },
      orderBy: { rating: "desc" },
    })).filter(
      (s) =>
        !TEST_SLUG_BLOCKLIST.has(s.slug.toLowerCase()) &&
        !TEST_SLUG_PATTERN.test(s.slug) &&
        !TEST_SLUG_PATTERN.test(s.name ?? ""),
    );

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
      // SECURITY 2026-05-25 (audit): scope a tenant "main" — antes listaba recetas cross-tenant.
      where: { tenantId: "main", activa: true },
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
      alternates: { languages: { "es-PE": `${baseUrl}/zona/${zone.slug}` } },
    });
    // City × category pages
    for (const cat of realCategories) {
      zonePages.push({
        url: `${baseUrl}/zona/${zone.slug}/${cat.id}`,
        lastModified,
        changeFrequency: "daily",
        priority: 0.8,
        alternates: { languages: { "es-PE": `${baseUrl}/zona/${zone.slug}/${cat.id}` } },
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
          alternates: { languages: { "es-PE": `${baseUrl}/zona/${zone.slug}/producto/${slugify(product.name)}` } },
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
      alternates: { languages: { "es-PE": `${baseUrl}/zona/${district.cityslug}/distrito/${district.slug}` } },
    });
    // District × category
    for (const cat of realCategories) {
      districtPages.push({
        url: `${baseUrl}/zona/${district.cityslug}/distrito/${district.slug}/${cat.id}`,
        lastModified,
        changeFrequency: "daily",
        priority: 0.72,
        alternates: { languages: { "es-PE": `${baseUrl}/zona/${district.cityslug}/distrito/${district.slug}/${cat.id}` } },
      });
    }
  }

  // TS-43: Tiendas directorio + rutas por zona (long-tail SEO).
  // Brandon 2026-05-20 v10 audit P0: la URL /tiendas YA está en staticPages
  // arriba (línea ~60) — duplicarla aquí causaba que Google la flagee como
  // mala calidad técnica. Mantenemos solo las rutas por zona long-tail.
  const TIENDAS_ZONES = ["centro", "manantay", "calleria", "yarinacocha", "campo_verde"] as const;
  const tiendasPages: MetadataRoute.Sitemap = TIENDAS_ZONES.map((z) => ({
    url: `${baseUrl}/tiendas/${z}`,
    lastModified,
    changeFrequency: "daily" as const,
    priority: 0.85,
  }));

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
