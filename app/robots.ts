import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://www.buleje.pe";

  // In non-production environments (Vercel previews, staging, local),
  // block ALL crawlers to avoid polluting search indexes.
  const isProduction =
    process.env.NEXT_PUBLIC_BASE_URL === baseUrl ||
    process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV?.startsWith("preview");

  if (!isProduction) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/_next/"],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
      // Block AI training crawlers — they scrape content without linking back
      {
        userAgent: ["CCBot", "GPTBot", "anthropic-ai", "Google-Extended", "Bytespider"],
        disallow: "/",
      },
      // Allow AI discovery bots (these send traffic back via citations)
      {
        userAgent: ["ChatGPT-User", "PerplexityBot"],
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
