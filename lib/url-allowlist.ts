/**
 * lib/url-allowlist.ts
 *
 * Helper SSRF: valida que una URL de imagen apunte a un hostname permitido
 * y no sea una IP reservada (loopback, privada, link-local).
 *
 * Usado por schemas Zod con `.refine(isAllowedImageUrl)` en rutas de
 * marketplace que aceptan URLs externas (branding, banners, imágenes).
 */

const ALLOWED_HOSTNAME_PATTERNS = [
  /\.supabase\.co$/,
  /\.vercel-storage\.com$/,
  /\.vercel-blob\.com$/,
  /^cdn\.buleje\.pe$/,
];

/** Rangos de IP reservadas (IPv4) que deben rechazarse siempre. */
const RESERVED_IPV4_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^127\./,
  /^0\./,
];

function isReservedIp(hostname: string): boolean {
  // IPv6 loopback
  if (hostname === "::1" || hostname === "[::1]") return true;
  // IPv4 reserved
  return RESERVED_IPV4_PATTERNS.some((re) => re.test(hostname));
}

/**
 * Devuelve `true` si la URL es una URL HTTP/HTTPS con hostname permitido
 * y sin IP reservada.
 *
 * Uso en Zod:
 *   z.string().url().refine(isAllowedImageUrl, "URL de imagen no permitida")
 */
export function isAllowedImageUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const hostname = parsed.hostname;

  if (isReservedIp(hostname)) return false;

  return ALLOWED_HOSTNAME_PATTERNS.some((re) => re.test(hostname));
}
