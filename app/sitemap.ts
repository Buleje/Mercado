import type { MetadataRoute } from "next";
import { categories } from "@/data/products";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://www.bodegasanmartin.pe";
  const lastModified = new Date();

  // Fetch live product IDs from DB for dynamic sitemap entries
  let dbProducts: { id: number }[] = [];
  try {
    dbProducts = await prisma.product.findMany({
      where: { active: true },
      select: { id: true },
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
      changeFrequency: "weekly",
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

  // Individual product pages — dynamic from DB
  const productPages: MetadataRoute.Sitemap = dbProducts.map((product) => ({
    url: `${baseUrl}/producto/${product.id}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...categoryPages, ...productPages];
}
