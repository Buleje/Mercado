/**
 * lib/credit/reniec-client.ts
 *
 * Cliente de verificación RENIEC para Fiado Digital Ola 2 — Fase 1 scaffold.
 *
 * Ver `docs/fiado-digital-ola2-plan.md` §2.4 + §3 (endpoint POST /api/credit/reniec/verify)
 * y ADR-021 para el contexto completo.
 *
 * ### Modo degrade por defecto
 *
 * Mientras TD-030 (`LoyaltyTransaction`) no esté aplicado y la tabla
 * `ReniecVerification` no exista en schema, este módulo **siempre** retorna
 * modo degrade (`verified: false`, `source: "degrade"`). El caller sigue
 * funcionando sin bloquearse por API externa caída ni por falta de schema.
 *
 * Ver principio §7 de ADR-021: "Fallback graceful si RENIEC falla. Degrade
 * mode: dniVerified=false + scoring sin bonus + admin puede validar
 * manualmente. El sistema nunca se bloquea por API externa caída."
 *
 * ### Providers soportados (futuro)
 *
 * - `apis.net.pe` — proveedor freemium más usado en Perú (S/0.05–0.10 por hit)
 * - `sunat` — backup via scraping de consulta RUC extendida
 * - `none` / undefined — degrade mode
 *
 * Env var: `RENIEC_PROVIDER=apis|sunat|none`
 *
 * ### Rate limiting
 *
 * Usa `createRateLimiter` de `lib/rate-limit.ts` — 10 req/min por IP.
 * El rate limit es **local in-process**. En multi-instance usar Redis.
 *
 * ### Cache
 *
 * Envuelto con `"use cache"` + `cacheTag("reniec:${dni}")` +
 * `cacheLife({ revalidate: 86400 })` = 1 día de freshness. Invalidación
 * manual vía `updateTag("reniec:${dni}")` cuando el admin re-verifica.
 *
 * ### TODOs — dependencias TD-030
 *
 * - [ ] (TD-030) Conectar API real `apis.net.pe`:
 *       `GET https://api.apis.net.pe/v2/reniec/dni?numero=${dni}`
 *       header `Authorization: Bearer ${RENIEC_API_TOKEN}`
 * - [ ] (TD-030) Conectar fallback SUNAT via endpoint público
 * - [ ] (TD-030) Persistir hit en `ReniecVerification` tabla (schema pending)
 *       con `expiresAt = now + 90 days` y `rawResponse` para auditoría
 * - [ ] (TD-030) Leer cache previo de `ReniecVerification` antes de golpear API
 */

import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createRateLimiter, type FactoryLimiter } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ReniecSource = "apis.net.pe" | "sunat" | "degrade";

export type ReniecResult = {
  /** true si la API externa confirmó el DNI. false en degrade/error. */
  verified: boolean;
  /** Nombre completo devuelto por RENIEC (si hubo hit). */
  fullName?: string;
  /** Fecha de nacimiento (si la API la devolvió). */
  birthDate?: Date;
  /** Provider que respondió — `degrade` cuando nadie contestó. */
  source: ReniecSource;
  /** Timestamp de la verificación. */
  checkedAt: Date;
  /** Mensaje de error si hubo falla (no contiene secretos ni stack). */
  errorMessage?: string;
};

// ─── Rate limiter local (10 req/min por IP) ──────────────────────────────────

const RENIEC_RATE_LIMIT: FactoryLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000,
});

/** Timeout en ms para cualquier fetch a API externa. */
const RENIEC_TIMEOUT_MS = 3000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Valida que el DNI sea exactamente 8 dígitos numéricos. */
function isValidDni(dni: string): boolean {
  return /^\d{8}$/.test(dni);
}

/** Retorna el resultado en modo degrade. Nunca lanza. */
function degradeResult(errorMessage?: string): ReniecResult {
  return {
    verified: false,
    source: "degrade",
    checkedAt: new Date(),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Verifica un DNI contra RENIEC con cache de 1 día por DNI.
 *
 * Nunca lanza. En caso de error (provider caído, timeout, rate limit, DNI
 * inválido) retorna degrade mode. El caller debe confiar en `verified`.
 *
 * @param dni  8 dígitos numéricos
 * @param clientIp IP del cliente para rate limiting (opcional, usa "global" por default)
 */
export async function verifyDni(
  dni: string,
  clientIp: string = "global",
): Promise<ReniecResult> {
  "use cache";
  cacheLife({ revalidate: 86400, stale: 3600, expire: 604800 });
  cacheTag(`reniec:${dni}`);

  // Validación básica — no cuenta contra rate limit
  if (!isValidDni(dni)) {
    return degradeResult("DNI inválido — debe ser 8 dígitos numéricos");
  }

  // Rate limit local — 10 req/min por IP
  if (!RENIEC_RATE_LIMIT.check(clientIp)) {
    logger.warn("[reniec-client] Rate limit excedido", { clientIp });
    return degradeResult("Rate limit local excedido — reintenta en 1 minuto");
  }

  const provider = (process.env.RENIEC_PROVIDER ?? "none").toLowerCase();

  // Modo explícito degrade: sin API, sin costo
  if (provider === "none") {
    return degradeResult();
  }

  // Proveedores soportados — todos son stub hasta que TD-030 esté aplicado
  if (provider === "apis" || provider === "apis.net.pe") {
    // TODO(TD-030): conectar API real apis.net.pe
    // const token = process.env.RENIEC_API_TOKEN;
    // const controller = new AbortController();
    // const timer = setTimeout(() => controller.abort(), RENIEC_TIMEOUT_MS);
    // try {
    //   const res = await fetch(
    //     `https://api.apis.net.pe/v2/reniec/dni?numero=${dni}`,
    //     {
    //       headers: { Authorization: `Bearer ${token}` },
    //       signal: controller.signal,
    //     },
    //   );
    //   if (!res.ok) return degradeResult(`apis.net.pe HTTP ${res.status}`);
    //   const data = await res.json();
    //   return {
    //     verified: true,
    //     fullName: `${data.nombres} ${data.apellidoPaterno} ${data.apellidoMaterno}`,
    //     source: "apis.net.pe",
    //     checkedAt: new Date(),
    //   };
    // } catch (err) {
    //   return degradeResult(`apis.net.pe error: ${(err as Error).message}`);
    // } finally {
    //   clearTimeout(timer);
    // }
    void RENIEC_TIMEOUT_MS; // suppress unused-warning until wired
    logger.info("[reniec-client] provider=apis — stub hasta TD-030", { dni });
    return degradeResult("provider apis.net.pe pendiente — TD-030");
  }

  if (provider === "sunat") {
    // TODO(TD-030): conectar fallback SUNAT
    logger.info("[reniec-client] provider=sunat — stub hasta TD-030", { dni });
    return degradeResult("provider sunat pendiente — TD-030");
  }

  // Provider desconocido → degrade silencioso
  logger.warn("[reniec-client] provider desconocido", { provider });
  return degradeResult(`provider desconocido: ${provider}`);
}

/**
 * Helper público para saber si el modo degrade está forzado por env.
 * Útil para que la UI muestre un banner "validación RENIEC no disponible".
 */
export function isReniecDegradeMode(): boolean {
  const provider = (process.env.RENIEC_PROVIDER ?? "none").toLowerCase();
  return provider === "none";
}
