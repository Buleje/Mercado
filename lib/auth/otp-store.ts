/**
 * lib/auth/otp-store.ts
 *
 * OTP store respaldado por cacheStore (Redis-aware cuando REDIS_URL está
 * configurado, fallback a MemoryStore en dev/single-instance).
 *
 * Migrado desde Map module-level (problema: se resetea por instancia Vercel
 * en multi-region → mismo OTP usable 2× en instancias distintas).
 *
 * cacheStore.get/set/del son síncronos (write-through MemoryStore + fire-and-
 * forget hacia Redis). No se necesita await en los llamadores.
 */

import { cacheStore } from "@/lib/cache";

const OTP_TTL_SEC = 300; // 5 minutos
const MAX_ATTEMPTS = 5;

const otpKey = (phone: string) => `otp:code:${phone}`;
const attemptsKey = (phone: string) => `otp:attempts:${phone}`;

/**
 * Guarda un código OTP para el número de teléfono normalizado.
 * Sobreescribe cualquier entrada previa (el endpoint /send ya aplica
 * rate limit antes de llegar aquí). Resetea el contador de intentos.
 */
export function storeOtp(phone: string, code: string): void {
  cacheStore.set(otpKey(phone), code, OTP_TTL_SEC);
  cacheStore.set(attemptsKey(phone), 0, OTP_TTL_SEC);
}

/**
 * Verifica el código OTP para el teléfono dado.
 *
 * - Devuelve `"ok"` si el código es correcto y no ha expirado.
 * - Devuelve `"expired"` si no existe entrada o ya expiró.
 * - Devuelve `"invalid"` si el código no coincide (incrementa intentos).
 * - Devuelve `"max_attempts"` si se superó el límite de intentos.
 *
 * En caso de éxito elimina la entrada (single-use).
 */
export function verifyOtp(
  phone: string,
  code: string,
): "ok" | "expired" | "invalid" | "max_attempts" {
  const stored = cacheStore.get<string>(otpKey(phone));
  if (!stored) return "expired";

  const attempts = cacheStore.get<number>(attemptsKey(phone)) ?? 0;
  if (attempts >= MAX_ATTEMPTS) {
    // Limpiar entradas agotadas
    cacheStore.del(otpKey(phone));
    cacheStore.del(attemptsKey(phone));
    return "max_attempts";
  }

  if (stored !== code) {
    cacheStore.set(attemptsKey(phone), attempts + 1, OTP_TTL_SEC);
    return "invalid";
  }

  // Código correcto — consumir la entrada (single-use)
  cacheStore.del(otpKey(phone));
  cacheStore.del(attemptsKey(phone));
  return "ok";
}
