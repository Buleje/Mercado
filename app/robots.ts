import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://www.buleje.pe";

  // Brandon 2026-05-20 v10 audit P0: lógica de detección reescrita.
  // El bug previo era precedencia de operadores: `A || B && C` se evalúa
  // como `A || (B && C)` — si NEXT_PUBLIC_BASE_URL no estaba seteado en
  // Vercel, NODE_ENV=production sin VERCEL_ENV=preview era SUFICIENTE,
  // pero NEXT_PUBLIC_BASE_URL=undefined seguía siendo el primer chequeo.
  // Resultado: en algunos deploys de Vercel devolvía "Disallow: /" en
  // producción y Google no indexaba NADA.
  //
  // Nueva lógica más estricta y robusta:
  //   prod si NEXT_PUBLIC_BASE_URL === www.buleje.pe (canonical)
  //   prod si VERCEL_ENV === "production" (production deploy de Vercel)
  //   En cualquier otro caso (dev, preview, branch deploys) → noindex
  const isProduction =
    process.env.NEXT_PUBLIC_BASE_URL === baseUrl ||
    process.env.VERCEL_ENV === "production";

  if (!isProduction) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
      // Aún en non-prod declaramos el sitemap (no afecta noindex pero
      // ayuda a herramientas como Search Console preview).
      sitemap: `${baseUrl}/sitemap.xml`,
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
      // Brandon 2026-05-25: Google-Extended PERMITIDO — alimenta Google AI
      // Overviews + Gemini (lo más usado en Perú) y Google sí cita la fuente.
      // Objetivo: ser referente en búsqueda IA de Google.
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: ["/api/", "/admin/", "/superadmin/", "/checkout/", "/cuenta/"],
      },
      // Brandon 2026-05-27: GPTBot (OpenAI) + ClaudeBot/anthropic-ai (Anthropic)
      // PERMITIDOS. Trade-off aceptado: usan el contenido PÚBLICO para entrenar
      // a cambio de máxima presencia en ChatGPT y Claude. Las zonas privadas
      // (api/admin/checkout/cuenta) siguen vetadas.
      {
        userAgent: ["GPTBot", "ClaudeBot", "anthropic-ai"],
        allow: "/",
        disallow: ["/api/", "/admin/", "/superadmin/", "/checkout/", "/cuenta/"],
      },
      // Training de terceros que no citan ni mandan tráfico de retorno —
      // siguen bloqueados (Common Crawl, ByteDance/TikTok).
      {
        userAgent: ["CCBot", "Bytespider"],
        disallow: "/",
      },
      // Allow AI discovery/search bots (these send traffic back via citations).
      // Brandon 2026-05-27: agregados OAI-SearchBot (índice de ChatGPT Search /
      // SearchGPT — distinto de GPTBot de entrenamiento) y Perplexity-User
      // (fetch on-demand cuando un usuario pregunta). Objetivo: aparecer como
      // fuente citada en respuestas de IA y captar el tráfico de retorno.
      {
        userAgent: [
          "ChatGPT-User",
          "OAI-SearchBot",
          "PerplexityBot",
          "Perplexity-User",
        ],
        allow: "/",
        disallow: ["/api/", "/admin/", "/superadmin/", "/checkout/", "/cuenta/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
