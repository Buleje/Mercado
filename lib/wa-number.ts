/**
 * lib/wa-number.ts — normalización client-safe del número de WhatsApp.
 *
 * (lib/whatsapp.ts es `server-only` — no se puede importar en componentes
 *  cliente como el Footer; por eso este util vive aparte.)
 *
 * Bug 2026-05-30 (audit): el Footer hacía `value.replace(/\D/g, "")` sobre
 * `hp.footerWhatsApp`, que es una URL COMPLETA tipo
 * `https://wa.me/51929340532?text=Hola%2C%20quiero%20hacer%20un%20pedido`.
 * Stripear todos los no-dígitos de la URL conservaba los dígitos del query
 * URL-encoded (`%2C`→`2`, `%20`→`20` ×4 = `220202020`) y los pegaba al número
 * → `51929340532` + `220202020` = `51929340532220202020` (link roto).
 *
 * `extractWaNumber` acepta tanto un número crudo (`+51 929 340 532`,
 * `929340532`) como una URL `wa.me/<num>?...` (o `?phone=<num>`) y devuelve
 * SOLO los dígitos del número, cortando en el `?`.
 */
export function extractWaNumber(value?: string | null): string {
  if (!value) return "";
  const waMe = value.match(/wa\.me\/(\d+)/);
  if (waMe) return waMe[1]!;
  const sendPhone = value.match(/[?&]phone=(\d+)/);
  if (sendPhone) return sendPhone[1]!;
  // Número crudo (puede traer +, espacios, guiones) → solo dígitos.
  return value.replace(/\D/g, "");
}

/**
 * Construye `https://wa.me/<num>?text=<msg>` desde un número crudo O una URL
 * wa.me, con mensaje opcional. Devuelve "" si no hay número válido.
 */
export function buildWaLink(value?: string | null, message?: string): string {
  const num = extractWaNumber(value);
  if (!num) return "";
  return message ? `https://wa.me/${num}?text=${encodeURIComponent(message)}` : `https://wa.me/${num}`;
}
