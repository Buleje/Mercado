/**
 * Simple TOTP-like 2FA for SuperAdmin.
 * Generates a 6-digit code that rotates every 5 minutes.
 * In production, send this code via email/WhatsApp.
 * In development, it prints to the server console.
 */
import { logger } from "@/lib/logger";

const CODE_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes

// In-memory store for pending 2FA codes
const pendingCodes = new Map<string, { code: string; expiresAt: number; username: string }>();

/**
 * Generate a 6-digit random code for authentication
 */
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Create a 2FA challenge for a username. Returns the code (for logging/sending).
 */
export function create2FAChallenge(username: string): { challengeId: string; code: string } {
  // Clean up expired codes
  const now = Date.now();
  for (const [id, entry] of pendingCodes) {
    if (entry.expiresAt < now) pendingCodes.delete(id);
  }

  const code = generateCode();
  const challengeId = crypto.randomUUID();

  pendingCodes.set(challengeId, {
    code,
    expiresAt: now + CODE_VALIDITY_MS,
    username,
  });

  // Log to server console (in production, send via email or WhatsApp)
  logger.info(`[2FA] Code for ${username}: ${code} (expires in 5 min)`);
  if (process.env.NODE_ENV === "development") {
    console.log(`\n🔐 [2FA] Código de verificación para ${username}: ${code}\n`);
  }

  return { challengeId, code };
}

/**
 * Verify a 2FA code against a pending challenge.
 * Returns true if valid, consumes the code.
 */
export function verify2FACode(challengeId: string, code: string): { valid: boolean; username?: string } {
  const entry = pendingCodes.get(challengeId);
  if (!entry) return { valid: false };

  // Expired?
  if (entry.expiresAt < Date.now()) {
    pendingCodes.delete(challengeId);
    return { valid: false };
  }

  // Constant-time comparison to prevent timing attacks
  if (entry.code.length !== code.length) {
    return { valid: false };
  }
  let result = 0;
  for (let i = 0; i < entry.code.length; i++) {
    result |= entry.code.charCodeAt(i) ^ code.charCodeAt(i);
  }
  if (result !== 0) return { valid: false };

  // Valid — consume the code
  const username = entry.username;
  pendingCodes.delete(challengeId);
  return { valid: true, username };
}

/**
 * Check if 2FA is enabled (via env var).
 * Set SUPERADMIN_2FA=true to enable.
 */
export function is2FAEnabled(): boolean {
  return process.env.SUPERADMIN_2FA === "true";
}
