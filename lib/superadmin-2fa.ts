/**
 * lib/superadmin-2fa.ts
 *
 * Real TOTP-based 2FA for SuperAdmin (RFC 6238).
 *
 * Generates time-based 6-digit codes that rotate every 30 seconds.
 * Secret is stored in env var SUPERADMIN_TOTP_SECRET (base32 encoded).
 * Verification allows a window of +-1 step to account for clock drift.
 *
 * In development, the current code is printed to the server console.
 */
import { logger } from "@/lib/logger";
import { sendWhatsAppQueued } from "@/lib/whatsapp";

// ── 2FA Method: "totp" (authenticator app) or "whatsapp" (code via WhatsApp) ─
type TwoFAMethod = "totp" | "whatsapp";
function get2FAMethod(): TwoFAMethod {
  const method = process.env.SUPERADMIN_2FA_METHOD?.toLowerCase();
  if (method === "whatsapp") return "whatsapp";
  return "totp";
}

// ── WhatsApp challenge storage (6-digit code, 5 min TTL) ────────────────────
const WHATSAPP_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const whatsappChallenges = new Map<string, { code: string; username: string; expiresAt: number }>();

function cleanExpiredChallenges(): void {
  const now = Date.now();
  for (const [id, entry] of whatsappChallenges) {
    if (now > entry.expiresAt) whatsappChallenges.delete(id);
  }
}

// ── TOTP Constants ──────────────────────────────────────────────────────────

const TOTP_PERIOD = 30; // seconds per code rotation
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // +-1 step tolerance for clock drift

// ── Base32 decoding (RFC 4648) ──────────────────────────────────────────────

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(encoded: string): Uint8Array {
  const cleaned = encoded.replace(/[=\s]/g, "").toUpperCase();
  const bits: number[] = [];

  for (const char of cleaned) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) throw new Error(`Invalid base32 character: ${char}`);
    // Each base32 char = 5 bits
    for (let i = 4; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i * 8 + j];
    }
    bytes[i] = byte;
  }
  return bytes;
}

function base32Encode(buffer: Uint8Array): string {
  const bits: number[] = [];
  for (const byte of buffer) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }

  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    if (i + 5 > bits.length) break;
    let val = 0;
    for (let j = 0; j < 5; j++) {
      val = (val << 1) | bits[i + j];
    }
    result += BASE32_ALPHABET[val];
  }
  return result;
}

// ── HMAC-SHA1 via Web Crypto ────────────────────────────────────────────────

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const keyBuf = new Uint8Array(key).buffer;
  const msgBuf = new Uint8Array(message).buffer;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgBuf);
  return new Uint8Array(signature);
}

// ── TOTP Generation (RFC 6238) ──────────────────────────────────────────────

/**
 * Generate a TOTP code for the given secret and time counter.
 * Uses HMAC-SHA1 per RFC 6238 / RFC 4226.
 */
async function generateTOTP(secret: Uint8Array, counter: bigint): Promise<string> {
  // Convert counter to 8-byte big-endian buffer
  const counterBuf = new Uint8Array(8);
  const view = new DataView(counterBuf.buffer);
  view.setBigUint64(0, counter, false); // big-endian

  const hmac = await hmacSha1(secret, counterBuf);

  // Dynamic truncation (RFC 4226 §5.3)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = code % 10 ** TOTP_DIGITS;
  return otp.toString().padStart(TOTP_DIGITS, "0");
}

/**
 * Get the current time counter for TOTP.
 */
function getTimeCounter(timestampMs: number = Date.now()): bigint {
  return BigInt(Math.floor(timestampMs / 1000 / TOTP_PERIOD));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the TOTP secret from environment variable.
 * Returns null if not configured.
 */
function getSecret(): Uint8Array | null {
  const secretB32 = process.env.SUPERADMIN_TOTP_SECRET;
  if (!secretB32) return null;
  try {
    return base32Decode(secretB32);
  } catch {
    logger.error("[2FA] Invalid SUPERADMIN_TOTP_SECRET — not valid base32");
    return null;
  }
}

/**
 * Generate a new random TOTP secret (20 bytes = 160 bits).
 * Returns base32-encoded string suitable for SUPERADMIN_TOTP_SECRET env var.
 * Call this once to set up 2FA, then store the result in .env.
 */
export function generateSecret(): string {
  const buf = new Uint8Array(20);
  crypto.getRandomValues(buf);
  return base32Encode(buf);
}

/**
 * Create a 2FA challenge. For TOTP mode, uses the authenticator app.
 * For WhatsApp mode, generates a random 6-digit code and sends it via WhatsApp.
 */
export function create2FAChallenge(username: string): { challengeId: string; code: Promise<string> } {
  const method = get2FAMethod();

  // ── WhatsApp mode: random 6-digit code sent via WhatsApp ───────────────
  if (method === "whatsapp") {
    cleanExpiredChallenges();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const challengeId = crypto.randomUUID();
    whatsappChallenges.set(challengeId, {
      code,
      username,
      expiresAt: Date.now() + WHATSAPP_CODE_TTL_MS,
    });

    const phone = process.env.SUPERADMIN_PHONE;
    if (phone) {
      const msg = `🔐 *Código de verificación — Buleje*\n\nTu código de acceso SuperAdmin es:\n\n*${code}*\n\nExpira en 5 minutos. No compartas este código.`;
      sendWhatsAppQueued(phone, msg, { tenantId: "__platform__", context: "2fa-code" }).catch(() => {});
    } else {
      logger.warn("[2FA] SUPERADMIN_PHONE not configured — cannot send WhatsApp code");
    }

    if (process.env.NODE_ENV === "development") {
      logger.debug(`[2FA-WhatsApp] Código para ${username}: ${code}`);
    }

    logger.info(`[2FA] WhatsApp challenge created for ${username}`);
    return { challengeId, code: Promise.resolve(code) };
  }

  // ── TOTP mode: authenticator app ──────────────────────────────────────
  const secret = getSecret();
  if (!secret) {
    // Fallback: generate a random code and log it (dev-only behavior)
    const code = String(Math.floor(100000 + Math.random() * 900000));
    logger.warn("[2FA] No TOTP secret configured — using random code fallback");
    if (process.env.NODE_ENV === "development") {
      logger.debug(`[2FA] Codigo de verificacion para ${username}: ${code}`);
    }
    return {
      challengeId: crypto.randomUUID(),
      code: Promise.resolve(code),
    };
  }

  const counter = getTimeCounter();
  const codePromise = generateTOTP(secret, counter);

  // Log to console in development
  if (process.env.NODE_ENV === "development") {
    codePromise.then((code) => {
      logger.debug(`[2FA] TOTP code for ${username}: ${code} (valid for ${TOTP_PERIOD}s)`);
    }).catch(() => {});
  }

  logger.info(`[2FA] TOTP challenge created for ${username}`);

  return {
    challengeId: `totp-${counter.toString()}`,
    code: codePromise,
  };
}

/**
 * Verify a 2FA code. For WhatsApp mode, checks the stored challenge.
 * For TOTP mode, checks current time step +-1 window.
 */
export async function verify2FACode(
  challengeId: string,
  code: string,
): Promise<{ valid: boolean; username?: string }> {
  // ── WhatsApp challenge verification ────────────────────────────────────
  const whatsappChallenge = whatsappChallenges.get(challengeId);
  if (whatsappChallenge) {
    whatsappChallenges.delete(challengeId); // One-time use
    if (Date.now() > whatsappChallenge.expiresAt) {
      logger.warn("[2FA] WhatsApp code expired");
      return { valid: false };
    }
    // Constant-time comparison
    if (code.length !== whatsappChallenge.code.length) return { valid: false };
    let result = 0;
    for (let j = 0; j < code.length; j++) {
      result |= code.charCodeAt(j) ^ whatsappChallenge.code.charCodeAt(j);
    }
    if (result === 0) {
      logger.info("[2FA] WhatsApp code verified successfully");
      return { valid: true, username: whatsappChallenge.username };
    }
    logger.warn("[2FA] WhatsApp code verification failed");
    return { valid: false };
  }

  // ── TOTP verification ─────────────────────────────────────────────────
  const secret = getSecret();

  if (!secret) {
    // No TOTP secret configured — reject all codes in production
    if (process.env.NODE_ENV === "production") {
      logger.error("[2FA] verify called but no TOTP secret configured");
      return { valid: false };
    }
    // In dev without secret, accept any 6-digit code (fallback mode)
    logger.warn("[2FA] No TOTP secret — dev fallback accepts any 6-digit code");
    return { valid: /^\d{6}$/.test(code), username: "superadmin" };
  }

  const counter = getTimeCounter();

  // Check current step and +-TOTP_WINDOW steps
  for (let i = -TOTP_WINDOW; i <= TOTP_WINDOW; i++) {
    const expected = await generateTOTP(secret, counter + BigInt(i));

    // Constant-time comparison to prevent timing attacks
    if (expected.length !== code.length) continue;
    let result = 0;
    for (let j = 0; j < expected.length; j++) {
      result |= expected.charCodeAt(j) ^ code.charCodeAt(j);
    }
    if (result === 0) {
      logger.info("[2FA] TOTP code verified successfully");
      return { valid: true, username: "superadmin" };
    }
  }

  logger.warn("[2FA] TOTP code verification failed");
  return { valid: false };
}

/**
 * Check if 2FA is enabled (via env var).
 * Set SUPERADMIN_2FA=true to enable.
 */
export function is2FAEnabled(): boolean {
  return process.env.SUPERADMIN_2FA === "true";
}

/**
 * Generate a TOTP URI for use with authenticator apps (Google Authenticator, Authy, etc.).
 * Format: otpauth://totp/{label}?secret={base32}&issuer={issuer}&algorithm=SHA1&digits=6&period=30
 */
export function getTOTPUri(label: string = "Buleje SuperAdmin", issuer: string = "Buleje"): string | null {
  const secretB32 = process.env.SUPERADMIN_TOTP_SECRET;
  if (!secretB32) return null;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}
