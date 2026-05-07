// ═══════════════════════════════════════════════════════
// CMS URL VALIDATORS — SSRF / XSS allowlist
// SECURITY 2026-05-07 (audit CMS #4): block schemas validan
// backgroundImage y ctaLink contra esta lista para evitar
// SSRF en img-proxy y XSS via javascript: / data: URIs.
// ═══════════════════════════════════════════════════════

export const HOSTNAME_ALLOWLIST = [
  "supabase.co",
  "images.unsplash.com",
  "cdn.jsdelivr.net",
];

/**
 * Verifica que la URL sea https y que el hostname esté en la allowlist
 * (match exacto o subdominio).
 */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return HOSTNAME_ALLOWLIST.some(
      (d) => u.hostname === d || u.hostname.endsWith("." + d)
    );
  } catch {
    return false;
  }
}

/**
 * Verifica que el link sea una ruta relativa, http o https.
 * Bloquea javascript:, data:, vbscript:, etc.
 */
export function isAllowedLink(href: string): boolean {
  if (href.startsWith("/")) return true;
  try {
    const u = new URL(href);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
