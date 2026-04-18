/**
 * lib/auth/otp-store.ts
 *
 * In-memory OTP store for phone verification.
 *
 * Acceptable for MVP — will migrate to Redis when multi-region deployment
 * requires shared state across Vercel instances.
 *
 * Cada entrada expira a los 5 minutos y se invalida tras el primer uso exitoso.
 * El contador de intentos fallidos se incrementa en cada verificacion incorrecta;
 * al alcanzar MAX_ATTEMPTS la entrada se elimina para forzar un nuevo envio.
 */

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutos
const MAX_ATTEMPTS = 5; // intentos de verificacion antes de invalidar

interface OtpEntry {
  code: string;
  expiresAt: number;
  attempts: number;
}

// Module-level Map — persiste mientras la instancia Node este viva.
const otpStore = new Map<string, OtpEntry>();

// Limpia entradas expiradas de forma oportunista en cada operacion.
function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of otpStore) {
    if (now >= entry.expiresAt) otpStore.delete(key);
  }
}

/**
 * Guarda un codigo OTP para el numero de telefono normalizado.
 * Sobreescribe cualquier entrada previa (el endpoint /send ya aplica
 * rate limit antes de llegar aqui).
 */
export function storeOtp(phone: string, code: string): void {
  purgeExpired();
  otpStore.set(phone, {
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
}

/**
 * Verifica el codigo OTP para el telefono dado.
 *
 * - Devuelve `"ok"` si el codigo es correcto y no ha expirado.
 * - Devuelve `"expired"` si no existe entrada o ya expiro.
 * - Devuelve `"invalid"` si el codigo no coincide (incrementa intentos).
 * - Devuelve `"max_attempts"` si se supero el limite de intentos y
 *   la entrada fue eliminada.
 *
 * En caso de exito elimina la entrada (single-use).
 */
export function verifyOtp(
  phone: string,
  code: string,
): "ok" | "expired" | "invalid" | "max_attempts" {
  purgeExpired();
  const entry = otpStore.get(phone);

  if (!entry || Date.now() >= entry.expiresAt) {
    return "expired";
  }

  if (entry.code !== code) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) {
      otpStore.delete(phone);
      return "max_attempts";
    }
    return "invalid";
  }

  // Codigo correcto — consumir la entrada (single-use)
  otpStore.delete(phone);
  return "ok";
}
