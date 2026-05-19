/**
 * lib/crypto/totp-cipher.ts
 *
 * Audit 2026-05-17 05-P1-5: cifrado AES-GCM-256 para TOTP secrets en DB.
 *
 * Antes: `AdminUser.totpSecret` y `SuperadminUser.totpSecret` se persistían
 * en texto plano. Un atacante con read-only en la DB (backup leak, breach
 * con SELECT pero sin escritura, dev con dump prod) podía generar códigos
 * TOTP válidos para cualquier cuenta enrollada → bypass total 2FA.
 *
 * Ahora: cifrados con AES-GCM-256 usando una key derivada de AUTH_SECRET
 * via HKDF-SHA256 con info="totp-cipher-v1". El IV se prefija al
 * ciphertext (12 bytes) y se serializa todo como base64.
 *
 * Formato persistido (string):
 *   "enc:v1:<base64(iv || ciphertext+authTag)>"
 *
 * Backwards-compat: si la string NO tiene el prefijo "enc:v1:", se asume
 * texto plano (legacy) y se devuelve as-is desde decrypt(). El cron de
 * rotación (futuro ADR-114) puede migrar lazy: en cada login exitoso,
 * re-encriptar y persistir.
 */

import "server-only";

const PREFIX = "enc:v1:";
const ALGO = "AES-GCM";
const IV_BYTES = 12; // recommended for GCM

let cachedKey: CryptoKey | null = null;

/** Deriva una key AES-GCM-256 estable de AUTH_SECRET via HKDF-SHA256. */
async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error("[totp-cipher] AUTH_SECRET required to derive TOTP key");
  }
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(authSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  cachedKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("buleje-totp-salt-v1"),
      info: enc.encode("totp-cipher-v1"),
    },
    baseKey,
    { name: ALGO, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
}

/** Convierte Uint8Array a base64. */
function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Convierte base64 a Uint8Array. */
function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Cifra un TOTP secret. Devuelve string con prefijo `enc:v1:`. */
export async function encryptTotpSecret(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;
  if (plaintext.startsWith(PREFIX)) return plaintext; // ya cifrado
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    enc.encode(plaintext),
  );
  const cipher = new Uint8Array(cipherBuf);
  const combined = new Uint8Array(iv.length + cipher.length);
  combined.set(iv, 0);
  combined.set(cipher, iv.length);
  return PREFIX + toB64(combined);
}

/**
 * Descifra un TOTP secret. Si no tiene el prefijo, retorna as-is (legacy
 * texto plano — migración lazy).
 */
export async function decryptTotpSecret(stored: string | null): Promise<string | null> {
  if (!stored) return stored;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plain — backwards-compat
  const key = await getKey();
  const combined = fromB64(stored.slice(PREFIX.length));
  if (combined.length <= IV_BYTES) {
    throw new Error("[totp-cipher] ciphertext too short");
  }
  const iv = combined.slice(0, IV_BYTES);
  const cipher = combined.slice(IV_BYTES);
  const plainBuf = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    cipher,
  );
  return new TextDecoder().decode(plainBuf);
}

/** Helper para detectar si un secret está cifrado (útil en migraciones lazy). */
export function isEncryptedTotpSecret(stored: string | null | undefined): boolean {
  return !!stored && stored.startsWith(PREFIX);
}
