import type { MetadataRoute } from "next";
import { products, categories } from "@/data/products";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://www.bodegasanmartin.pe";
  const lastModified = new Date();

  // Static pages with high priority
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/tienda`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/admin`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  // Category pages (excluding "todos")
  const categoryPages: MetadataRoute.Sitemap = categories
    .filter((cat) => cat.id !== "todos")
    .map((cat) => ({
      url: `${baseUrl}/tienda?categoria=${cat.id}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));

  // Individual product pages
  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${baseUrl}/producto/${product.id}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...categoryPages, ...productPages];
}
