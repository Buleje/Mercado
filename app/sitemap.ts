import type { MetadataRoute } from "next";
import { categories } from "@/data/products";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_URL || "https://www.buleje.pe";
  const lastModified = new Date();

  // Fetch live product IDs from DB for dynamic sitemap entries
  let dbProducts: { id: number; name: string }[] = [];
  try {
    dbProducts = await prisma.product.findMany({
      where: { active: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
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

  return [
    ...staticPages,
    ...categoryPages,
    ...dbCategoryPages,
    ...productPages,
  ];
}
