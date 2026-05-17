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
        // Audit 2026-05-17 02-P2-6: removido `/_next/` del disallow.
        // Googlebot necesita cargar chunks JS para renderizar y indexar
        // contenido client-side; bloquearlos impedía el render server-side
        // de paths que dependen del bundle. Google ignora `/_next/static/`
        // por defecto al rastrear, así que la entrada era inocua pero
        // redundante y podía confundir a auditores SEO.
        disallow: [
          "/api/",
          "/admin/",
          "/superadmin/",
          "/checkout/",
          "/cuenta/",
          "/marketplace/mi-cuenta/",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/admin/", "/superadmin/", "/checkout/", "/cuenta/"],
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
