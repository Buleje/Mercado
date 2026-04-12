/**
 * #26 Superadmin 2FA TOTP persistente — lib/auth/totp.ts
 *
 * Implementación TOTP RFC 6238 (Time-based One-Time Password) sin dependencias externas.
 * Usa node:crypto para HMAC-SHA1 y base32 encode/decode propios.
 *
 * Compatible con Google Authenticator, Authy, 1Password, etc.
 * El algoritmo usa ventana de ±1 step (30s) para tolerancia de drift de reloj.
 */

import { createHmac, randomBytes } from "node:crypto";

// ─── Base32 ────────────────────────────────────────────────────────────────────

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_DECODE_MAP: Record<string, number> = {};
for (let i = 0; i < BASE32_CHARS.length; i++) {
  BASE32_DECODE_MAP[BASE32_CHARS[i]] = i;
}

function base32Encode(buf: Buffer): string {
  let result = "";
  let bits = 0;
  let value = 0;

  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_CHARS[(value >>> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    result += BASE32_CHARS[(value << (5 - bits)) & 0x1f];
  }

  return result;
}

function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of clean) {
    const charValue = BASE32_DECODE_MAP[char];
    if (charValue === undefined) {
      throw new Error(`Carácter base32 inválido: ${char}`);
    }
    value = (value << 5) | charValue;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

// ─── HOTP (counter-based) ─────────────────────────────────────────────────────

/**
 * Genera un código HOTP de 6 dígitos dado un secret y counter.
 * RFC 4226 §5.3
 */
function generateHotp(secret: Buffer, counter: bigint): string {
  // Convierte counter a 8 bytes big-endian
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(counter);

  const hmac = createHmac("sha1", secret).update(counterBuf).digest();

  // Dynamic truncation RFC 4226 §5.3
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 1_000_000).padStart(6, "0");
}

// ─── TOTP (time-based) ────────────────────────────────────────────────────────

const TOTP_STEP = 30; // segundos por step (RFC 6238 estándar)

/**
 * Genera el código TOTP de 6 dígitos para el momento actual (o `time` en segundos Unix).
 */
export function generateTotpCode(secret: string, time?: number): string {
  const secretBuf = base32Decode(secret);
  const t = Math.floor((time ?? Date.now() / 1000) / TOTP_STEP);
  return generateHotp(secretBuf, BigInt(t));
}

/**
 * Verifica un código TOTP con ventana de ±`window` steps (default ±1 = ±30s).
 * Retorna `true` si el código es válido dentro de la ventana de tolerancia.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  window = 1,
): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  const secretBuf = base32Decode(secret);
  const t = Math.floor(Date.now() / 1000 / TOTP_STEP);

  for (let delta = -window; delta <= window; delta++) {
    const expected = generateHotp(secretBuf, BigInt(t + delta));
    if (expected === code) return true;
  }

  return false;
}

// ─── Generación de secret ─────────────────────────────────────────────────────

/**
 * Genera un secret TOTP aleatorio de 20 bytes (160 bits) codificado en base32.
 * Compatible con RFC 6238 y la mayoría de apps autenticadoras.
 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

// ─── URI otpauth ──────────────────────────────────────────────────────────────

/**
 * Construye el URI otpauth:// para generar QR code en apps autenticadoras.
 * Formato: otpauth://totp/{issuer}:{account}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30
 *
 * Ejemplo:
 *   const uri = buildOtpauthUri(secret, "admin@bodega.com", "Buleje");
 *   // Pasar a una librería QR como `qrcode` para renderizarlo
 */
export function buildOtpauthUri(
  secret: string,
  account: string,
  issuer: string,
): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: String(TOTP_STEP),
  });

  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?${params.toString()}`;
}
