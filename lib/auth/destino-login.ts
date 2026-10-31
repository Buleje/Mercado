/**
 * Adónde vuelve el login del panel (`?from=`): SOLO a una ruta de este mismo
 * sitio. Puro y client-safe; lo usan `/admin/login` y `/admin/login/2fa`.
 *
 * - SECURITY 2026-05-16 (P0 open redirect): fuera `https://evil.com`,
 *   `//evil.com`, `javascript:`, `data:` y `\`.
 * - 31-10 (revisión de security): fuera también los caracteres de control. El
 *   navegador borra tabuladores y saltos de una URL, así que `/\t/evil.com`
 *   (`?from=/%09/evil.com`) terminaba en `//evil.com` = otro sitio.
 * - 31-10: el destino conserva su `?…#…` (el QR de una etiqueta abre
 *   `/admin?tab=documentos&doc=<id>`). No se decodifica otra vez:
 *   `URLSearchParams.get` ya lo hizo, y un `%` suelto del `?…` tumbaba el destino.
 * - Al final se arma con `new URL` sobre un origen ficticio y se exige el mismo
 *   origen: lo que el navegador interpretaría como otro host no pasa.
 */
const ORIGEN_FICTICIO = "https://panel.invalid";

export function destinoSeguroLogin(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\u0000-\u001F\u007F\\]/.test(raw)) return fallback;
  if (raw.includes("://")) return fallback;
  try {
    const u = new URL(raw, ORIGEN_FICTICIO);
    if (u.origin !== ORIGEN_FICTICIO) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
