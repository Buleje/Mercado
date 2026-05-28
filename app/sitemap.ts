import type { MetadataRoute } from "next";
import { categories, slugify } from "@/data/products";
import { zones } from "@/data/zones";
import { districts } from "@/data/districts";
import { prisma } from "@/lib/prisma";

const realCategories = categories.filter((c) => c.id !== "todos");

// 2026-05-28 audit P0: cap a top productos para evitar explosión zone×product
// (zones × dbProducts antes generaba 16,000 URLs thin-content, agente SEO H1).
// Solución: reducir productos en zone×product a top-50 por id (proxy de
// novedad). El detalle individual del producto sigue cubierto en /tienda/{slug}.
const ZONE_X_PRODUCT_TOP_N = 50;

/**
 * Helper: agrega alternates con es-PE + x-default (SEO H2 audit 2026-05-28).
 * Google guidance: https://developers.google.com/search/docs/specialty/international/localized-versions
 * Sin x-default, Google asume es-PE única y descuenta rank en es-AR, es-MX, es genérico.
 */
function withHreflang(url: string) {
  return {
    languages: {
      "es-PE": url,
      "x-default": url,
    },
  };
}

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
  // 2026-05-28 audit BUG-03: paralelizamos las 4 queries independientes con
  // Promise.all() — antes eran await secuenciales (~5×latencia DB). Reduce
  // ~60% el tiempo de generar el sitemap. Cada catch local devuelve [] en
  // fallback (DB unavailable durante static build).
  //
  // NOTA: Product/StoreProduct/Receta model no tienen updatedAt/createdAt en
  // schema actual. Usamos lastModified compartido. Pendiente migration
  // breaking (expand-migrate-contract) para agregar @updatedAt y emitir
  // lastModified real por entidad. Ver migration-planner.
  //
  // Imagen sitemap (audit M3/BUG-05): productos con `image` field se emiten
  // con `images: [imageUrl]` para indexar en Google Images. Cada URL puede
  // listar hasta 1000 imágenes según el spec.
  const [dbProducts, dbCats, stores, recipes] = await Promise.all([
    prisma.product
      .findMany({
        where: { tenantId: "main", active: true, deletedAt: null },
        select: { id: true, name: true, image: true },
        orderBy: { id: "desc" },
        take: 1000,
      })
      .catch(() => [] as Array<{ id: number; name: string; image: string | null }>),
    prisma.product
      .findMany({
        where: { tenantId: "main", active: true, deletedAt: null },
        select: { category: true },
        distinct: ["category"],
      })
      .catch(() => [] as Array<{ category: string }>),
    prisma.store
      .findMany({
        where: { isPublished: true },
        select: { id: true, slug: true, updatedAt: true, name: true },
        orderBy: { rating: "desc" },
      })
      .catch(() => [] as Array<{ id: string; slug: string; updatedAt: Date; name: string | null }>),
    prisma.receta
      .findMany({
        where: { tenantId: "main", activa: true },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1000,
      })
      .catch(() => [] as Array<{ id: string; updatedAt: Date }>),
  ]);

  // Static pages with high priority — TODAS con x-default hreflang
  // (audit H2 2026-05-28): antes solo es-PE → Google asumía única locale.
  // Ahora x-default cubre es-AR, es-MX, es genérico, fallback global.
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "daily",
      priority: 1.0,
      alternates: withHreflang(baseUrl),
    },
    {
      url: `${baseUrl}/tienda`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
      alternates: withHreflang(`${baseUrl}/tienda`),
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
      alternates: withHreflang(`${baseUrl}/tiendas`),
    },
    {
      url: `${baseUrl}/marketplace/ofertas`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.85,
      alternates: withHreflang(`${baseUrl}/marketplace/ofertas`),
    },
    {
      url: `${baseUrl}/marketplace/explorar`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.85,
      alternates: withHreflang(`${baseUrl}/marketplace/explorar`),
    },
    {
      url: `${baseUrl}/marketplace/como-pagar`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
      alternates: withHreflang(`${baseUrl}/marketplace/como-pagar`),
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
      alternates: withHreflang(`${baseUrl}/negocios`),
    },
    {
      url: `${baseUrl}/abrir-tienda`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: withHreflang(`${baseUrl}/abrir-tienda`),
    },
    {
      url: `${baseUrl}/vender`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.85,
      alternates: withHreflang(`${baseUrl}/vender`),
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
  // 2026-05-28 audit M2: changeFrequency `daily` era fake-feed — categorías
  // "Frutas/Abarrotes/Lácteos" no cambian estructura diaria. Google deprioritiza
  // feeds inflados → CTR baja. Cambio a `weekly` (realista).
  const categoryPages: MetadataRoute.Sitemap = categories
    .filter((cat) => cat.id !== "todos")
    .map((cat) => ({
      url: `${baseUrl}/tienda/categoria/${cat.id}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      alternates: withHreflang(`${baseUrl}/tienda/categoria/${cat.id}`),
    }));

  // Dynamic DB categories (if any not in static data)
  //
  // 2026-05-28 BUGFIX: el dedup contra static categories era case-sensitive
  // y comparaba ID-slug (frutas-verduras) contra label-DB (Frutas y Verduras).
  // Resultado: Google veía DUPLICADOS para cada categoría (slug + label encoded).
  // Ahora normalizamos AMBAS fuentes a slug y deduplicamos correctamente.
  //
  // 2026-05-28 audit BUG-03: dbCats ahora viene de la Promise.all() unificada
  // arriba (variable `dbCats` ya cargada). Se elimina query duplicada.
  const staticCatSlugs = new Set<string>();
  for (const c of categories) {
    staticCatSlugs.add(c.id);
    staticCatSlugs.add(slugify(c.label));
  }
  const dbCategoryPages: MetadataRoute.Sitemap = dbCats
    .filter((c) => c.category && !staticCatSlugs.has(slugify(c.category)))
    .map((c) => ({
      url: `${baseUrl}/tienda/categoria/${slugify(c.category)}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

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
  //
  // 2026-05-28 audit M3/BUG-05: agregamos `images: [imageUrl]` cuando existe.
  // Productos con foto se indexan en Google Images (~30% tráfico extra LatAm
  // visual según audit competitivo Rappi/MercadoLibre).
  const seenSlugs = new Set<string>();
  const productPages: MetadataRoute.Sitemap = dbProducts
    .map((product) => ({
      slug: slugify(product.name || ""),
      image: product.image,
    }))
    .filter(({ slug }) => {
      if (!slug || seenSlugs.has(slug)) return false;
      seenSlugs.add(slug);
      return true;
    })
    .map(({ slug, image }) => ({
      url: `${baseUrl}/tienda/${slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
      ...(image ? { images: [image] } : {}),
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

  // 2026-05-28 audit BUG-03: `stores` viene de la Promise.all() unificada arriba.
  // Filtramos blocklist/pattern aquí (no se puede aplicar como where en Prisma).
  const filteredStores = stores.filter(
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
    alternates: withHreflang(`${baseUrl}/marketplace`),
  });

  // Add individual marketplace store pages.
  // Cada store tiene `updatedAt` real (a diferencia de Product) → lastModified real.
  const storePages = filteredStores.map((s) => ({
    url: `${baseUrl}/marketplace/${s.slug}`,
    lastModified: s.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
  marketplacePages.push(...storePages);

  // Audit 2026-05-17 02-P2-3 + 2026-05-28 P1 Coverage: incluir storefront
  // white-label /t/[slug] Y /t/[slug]/tienda. Antes solo /t/{slug} estaba —
  // /t/{slug}/tienda existe en code (app/t/[slug]/tienda/page.tsx) pero
  // Google no la descubría (asimetría detectada por coverage audit).
  const tenantPages = filteredStores.flatMap((s) => [
    {
      url: `${baseUrl}/t/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/t/${s.slug}/tienda`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.65,
    },
  ]);
  marketplacePages.push(...tenantPages);

  // Fetch all active store products from all published stores
  const storeIds = filteredStores.map((s) => s.id);
  if (storeIds.length > 0) {
    try {
      // Audit 2026-05-17 02-P1-03: sin take, findMany puede retornar miles
      // de rows en build → OOM en Vercel build container. Cap a 5000 productos
      // priorizando los más recientes (sitemap Google acepta hasta 50k URLs,
      // 5k es safe + cubre los más relevantes para SEO).
      // 2026-05-28 audit M3: imagen sitemap via Product relation (StoreProduct
      // no tiene imageUrl propio — el producto base lo provee).
      const storeProducts = await prisma.storeProduct.findMany({
        where: {
          storeId: { in: storeIds },
          isActive: true,
        },
        select: {
          id: true,
          storeId: true,
          productId: true,
          product: { select: { image: true } },
        },
        orderBy: { id: "desc" },
        take: 5000,
      });

      // Build storeId -> slug map
      const storeSlugMap = new Map(filteredStores.map((s) => [s.id, s.slug]));

      // StoreProduct no tiene updatedAt — usar `now` para fallback conservador
      // (Brandon: TODO migration breaking para agregar updatedAt).
      const now = new Date();

      // Add store product detail pages: /marketplace/{storeSlug}/producto/{productId}
      const productDetailPages = storeProducts.map((sp) => {
        const storeSlug = storeSlugMap.get(sp.storeId) || "unknown";
        const img = sp.product?.image;
        return {
          url: `${baseUrl}/marketplace/${storeSlug}/producto/${sp.productId}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.6,
          ...(img ? { images: [img] } : {}),
        };
      });
      marketplacePages.push(...productDetailPages);
    } catch {
      // storeProduct query falla — skip product details, mantener stores
    }
  }

  // Recipe detail pages — REACTIVADO 2026-04-20 (Sprint S2).
  // La pagina app/marketplace/recetas/[id]/page.tsx ahora existe con
  // metadata SEO + JSON-LD Recipe schema.
  // 2026-05-28: `recipes` ahora viene de la Promise.all() unificada arriba.
  const recipePages: MetadataRoute.Sitemap = recipes.map((r) => ({
    url: `${baseUrl}/marketplace/recetas/${r.id}`,
    lastModified: r.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // Programmatic SEO — zone pages (/zona/[ciudad] + /zona/[ciudad]/[categoria])
  // 2026-05-28 audit M2: changeFrequency `daily` en city×category era fake.
  // Las páginas son derivadas (mismo contenido por zona). Cambio a `weekly`.
  const zonePages: MetadataRoute.Sitemap = [];
  for (const zone of zones) {
    // City landing page
    zonePages.push({
      url: `${baseUrl}/zona/${zone.slug}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.85,
      alternates: withHreflang(`${baseUrl}/zona/${zone.slug}`),
    });
    // City × category pages
    for (const cat of realCategories) {
      const cityCatUrl = `${baseUrl}/zona/${zone.slug}/${cat.id}`;
      zonePages.push({
        url: cityCatUrl,
        lastModified,
        changeFrequency: "weekly", // realista vs daily fake
        priority: 0.8,
        alternates: withHreflang(cityCatUrl),
      });
    }
  }

  // Programmatic SEO — zone × product pages (/zona/[ciudad]/producto/[slug])
  //
  // 2026-05-28 audit HIGH (SEO H1 + Tech BUG-01): cap a TOP_N productos por zona.
  // Antes: |zones| × |dbProducts| = 16 × 1000 = 16,000 URLs thin-content.
  // Ahora: |zones| × TOP_N(50) = 800 URLs targeted.
  //
  // Razón: Google marca como thin content cuando hay miles de URLs apuntando
  // a contenido casi-idéntico (mismo producto, diferente "ciudad" en la URL).
  // El detalle real del producto sigue cubierto por /tienda/{slug}.
  //
  // Estrategia: top productos ordenados por id desc (proxy de novedad). Para
  // futuro mejor: ordenar por searchVolume / clicks (requiere telemetría).
  const zoneProductPages: MetadataRoute.Sitemap = [];
  const seenZoneProducts = new Set<string>(); // dedup por (zone,slug)
  if (dbProducts.length > 0) {
    const topProductsForZones = dbProducts.slice(0, ZONE_X_PRODUCT_TOP_N);
    for (const zone of zones) {
      for (const product of topProductsForZones) {
        const productSlug = slugify(product.name || "");
        if (!productSlug) continue;
        const key = `${zone.slug}:${productSlug}`;
        if (seenZoneProducts.has(key)) continue;
        seenZoneProducts.add(key);
        const url = `${baseUrl}/zona/${zone.slug}/producto/${productSlug}`;
        zoneProductPages.push({
          url,
          lastModified,
          changeFrequency: "monthly", // realista, no daily (audit M2)
          priority: 0.5, // bajamos vs 0.6 — son páginas long-tail derivadas
          alternates: withHreflang(url),
        });
      }
    }
  }

  // Programmatic SEO — district landing + district × category pages
  // /zona/[ciudad]/distrito/[distrito] + /zona/[ciudad]/distrito/[distrito]/[categoria]
  // 2026-05-28 audit M2: district × category cambia a weekly (no daily fake).
  const districtPages: MetadataRoute.Sitemap = [];
  for (const district of districts) {
    // District landing
    const districtUrl = `${baseUrl}/zona/${district.cityslug}/distrito/${district.slug}`;
    districtPages.push({
      url: districtUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.78,
      alternates: withHreflang(districtUrl),
    });
    // District × category
    for (const cat of realCategories) {
      const districtCatUrl = `${baseUrl}/zona/${district.cityslug}/distrito/${district.slug}/${cat.id}`;
      districtPages.push({
        url: districtCatUrl,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.72,
        alternates: withHreflang(districtCatUrl),
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
