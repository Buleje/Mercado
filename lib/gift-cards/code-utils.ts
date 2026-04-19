import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * lib/gift-cards/code-utils.ts — ADR-077
 *
 * Helpers criptograficos para tarjetas de regalo Buleje.
 *
 * Objetivo: NUNCA persistir el codigo plano. Solo HMAC-SHA256(code, AUTH_SECRET)
 * va a la DB; el codigo original se devuelve UNA SOLA VEZ al comprador y ya
 * no se puede recuperar desde la aplicacion.
 *
 * Ver docs/adr/077-gift-cards-hmac-redemption.md para la decision completa.
 */

// ── Alfabeto y formato ──────────────────────────────────────────────────────

/**
 * Alfabeto "sin ambiguedad" — excluye 0/O, 1/I/L, 2/Z, 5/S, U/V para que el
 * usuario pueda tipear el codigo sin errores comunes.
 * 32 caracteres → log2(32) = 5 bits de entropia por char.
 */
const ALPHABET = "ABCDEFGHJKMNPQRTWXY346789";

/** Longitud del codigo plano (sin guiones). 16 chars * ~5 bits = ~80 bits. */
const CODE_LENGTH = 16;

/** Formato humano: 4-4-4-4 con guiones. */
function formatCode(raw: string): string {
  if (raw.length !== CODE_LENGTH) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

/** Quita guiones y normaliza a mayusculas para lookup. */
export function normalizeCode(input: string): string {
  return input.replace(/[-\s]/g, "").toUpperCase();
}

// ── Secreto HMAC ────────────────────────────────────────────────────────────

function getHmacSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET required — add to .env");
  }
  // Derivar un sub-secreto dedicado: si algun dia decidimos rotar el de gift
  // cards sin tocar el de sesiones, la rotacion vive aqui.
  return `${secret}-gift-cards`;
}

// ── API publica ─────────────────────────────────────────────────────────────

/**
 * Genera un codigo plano aleatorio formateado "XXXX-XXXX-XXXX-XXXX".
 *
 * Usa `crypto.randomBytes` (CSPRNG). Los bytes se mapean a indices del
 * alfabeto via modulo — como 32 divide 256, el sesgo es cero.
 */
export function generateCode(): string {
  const buf = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    // 32 divides 256 exactamente → modulo 32 es uniforme, sin sesgo
    out += ALPHABET[buf[i] & 0x1f];
  }
  return formatCode(out);
}

/**
 * Hash determinista del codigo plano: HMAC-SHA256(normalized, secret).
 * El mismo input siempre produce el mismo hash — se usa para el lookup por
 * `codeHash @unique` en la tabla gift_cards.
 */
export function hashCode(plainCode: string): string {
  const normalized = normalizeCode(plainCode);
  return createHmac("sha256", getHmacSecret()).update(normalized).digest("hex");
}

/**
 * Compara dos hashes con timing-safe para evitar side-channel attacks.
 * Aunque en la practica siempre hacemos el lookup por `@unique`, este helper
 * existe para casos de validacion manual (p.ej. tests, admin CLI).
 */
export function compareHashes(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Devuelve los ultimos 4 chars (sin guiones) para mostrar en UI masked. */
export function codeLast4(plainCode: string): string {
  const n = normalizeCode(plainCode);
  return n.slice(-4);
}

/**
 * Mascara un codigo plano para UI: "****-****-****-XXXX".
 * Acepta codigos con o sin guiones.
 */
export function maskCode(plainCode: string): string {
  const n = normalizeCode(plainCode);
  if (n.length < 4) return "****-****-****-????";
  const last = n.slice(-4);
  return `****-****-****-${last}`;
}

/**
 * Mascara usando solo el last4 ya persistido (sin necesidad del codigo plano).
 * Util para render del admin / dashboard del cliente.
 */
export function maskFromLast4(last4: string): string {
  const clean = last4.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(-4);
  const padded = clean.padStart(4, "?");
  return `****-****-****-${padded}`;
}

/**
 * Validar formato de un codigo antes de gastar un hash call.
 * No garantiza que exista, solo que la forma es plausible.
 */
export function isPlausibleCode(input: string): boolean {
  const n = normalizeCode(input);
  if (n.length !== CODE_LENGTH) return false;
  for (const c of n) {
    if (!ALPHABET.includes(c)) return false;
  }
  return true;
}
