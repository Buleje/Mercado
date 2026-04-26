/**
 * #44 CSRF double-submit cookie — lib/security/csrf.ts
 *
 * Implementa protección CSRF mediante el patrón "double-submit cookie":
 * 1. El servidor genera un token aleatorio y lo setea como cookie `csrf_token`
 *    (httpOnly=false para que JS del cliente pueda leerlo).
 * 2. El cliente JavaScript lee la cookie y la envía en el header `X-CSRF-Token`.
 * 3. El servidor compara cookie vs header con `timingSafeEqual`.
 *
 * Integración en layout:
 *   - El token se lee en el cliente desde la cookie `csrf_token`.
 *   - Alternativamente se puede exponer en un meta tag:
 *       <meta name="csrf-token" content={token} />
 *     y el JS cliente hace:
 *       const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content");
 *       fetch("/api/...", { headers: { "X-CSRF-Token": token } });
 *   - NO tocar app/layout.tsx — documentado aquí para que el frontend lo implemente.
 *
 * Paths exentos (no requieren CSRF):
 *   /api/webhooks/* — webhooks externos (Stripe, MP, etc.)
 *   /api/cron/*     — tareas cron internas con CRON_SECRET
 *   /api/mp-webhook — webhook MercadoPago
 *   /api/stripe-webhook — webhook Stripe
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

// ─── Constantes ────────────────────────────────────────────────────────────────

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const TOKEN_LENGTH = 32; // bytes → 43 chars base64url

/** Paths que NO requieren validación CSRF (webhooks externos, cron y beacons públicos). */
export const CSRF_EXEMPT_PREFIXES: readonly string[] = [
  "/api/webhooks/",
  "/api/cron/",
  "/api/mp-webhook",
  "/api/stripe-webhook",
  // Beacon público de pageview de la tienda individual.
  // navigator.sendBeacon no permite headers custom — no puede enviar X-CSRF-Token.
  // El endpoint es fire-and-forget: valida slug + ipHash y nunca devuelve datos.
  "/api/store-page/visits",
];

// ─── Generación ────────────────────────────────────────────────────────────────

/** Genera un token CSRF de 32 bytes en base64url. */
export function generateCsrfToken(): string {
  return randomBytes(TOKEN_LENGTH).toString("base64url");
}

// ─── Cookie ────────────────────────────────────────────────────────────────────

/**
 * Agrega la cookie `csrf_token` a una Response.
 * httpOnly=false intencional: el JS del cliente necesita leer el valor.
 * sameSite=Lax protege contra CSRF en navegación cross-site.
 */
export function setCsrfCookie(response: NextResponse, token: string): void {
  const isProd = process.env.NODE_ENV === "production";
  const cookieParts = [
    `${CSRF_COOKIE}=${token}`,
    "Path=/",
    "SameSite=Lax",
    isProd ? "Secure" : "",
    // NO httpOnly — debe ser legible por JS cliente
  ]
    .filter(Boolean)
    .join("; ");

  response.headers.append("Set-Cookie", cookieParts);
}

// ─── Verificación ──────────────────────────────────────────────────────────────

/**
 * Verifica CSRF comparando la cookie vs el header X-CSRF-Token.
 * Usa `timingSafeEqual` para prevenir timing attacks.
 * Retorna `true` si el token es válido, `false` si no.
 */
export function verifyCsrf(req: NextRequest): boolean {
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get(CSRF_HEADER);

  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;

  try {
    const a = Buffer.from(cookieToken, "utf8");
    const b = Buffer.from(headerToken, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verifica si el path está exento de CSRF.
 */
export function isCsrfExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Helper para Route Handlers: retorna un objeto de error si CSRF falla,
 * `null` si es válido o si el path está exento.
 *
 * Uso:
 *   const csrfError = requireCsrf(req);
 *   if (csrfError) return NextResponse.json(csrfError, { status: 403 });
 */
export function requireCsrf(
  req: NextRequest,
): { error: string } | null {
  const pathname = req.nextUrl?.pathname ?? "";

  if (isCsrfExempt(pathname)) return null;

  // Solo aplica a mutaciones (POST, PUT, PATCH, DELETE)
  const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (!mutatingMethods.includes(req.method.toUpperCase())) return null;

  if (!verifyCsrf(req)) {
    return { error: "CSRF token inválido o ausente" };
  }

  return null;
}
