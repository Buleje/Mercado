/**
 * lib/auth/csrf.ts — Per-route CSRF assertion (defense-in-depth)
 *
 * El middleware (`proxy.ts` → `lib/csrf.ts`) ya valida CSRF para la
 * mayoría de `/api/*` mutations, PERO exime `/api/superadmin/*` y
 * varias rutas de webhook. Este helper agrega validación a nivel
 * route handler para defense-in-depth en endpoints sensibles
 * (financieros, superadmin, mutación de tenants, etc).
 *
 * Diseño:
 *  - Lee cookie `csrf-token` (mismo nombre que `lib/csrf.ts` para
 *    coherencia con el frontend `csrfHeaders()`).
 *  - Lee header `X-CSRF-Token`.
 *  - Compara con `timingSafeEqual` (Node crypto).
 *  - Falla con 403 si missing/mismatch.
 *  - Idempotente, sin DB lookup.
 *  - Compatible con Bearer sk_ (skip — caller ya autenticó via API key).
 *
 * Uso típico (superadmin financial endpoint):
 *
 *   export async function POST(req: NextRequest) {
 *     const csrfFail = assertCsrf(req);
 *     if (csrfFail) return csrfFail;
 *     // ... resto del handler
 *   }
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Verifica que `csrf-token` cookie + `X-CSRF-Token` header coincidan.
 * Devuelve `NextResponse` con 403 si falla, o `null` si es válido.
 *
 * No falla si:
 *  - El request usa Bearer sk_ (API key auth, no requiere CSRF).
 *  - El método HTTP es safe (GET/HEAD/OPTIONS).
 */
export function assertCsrf(req: NextRequest | Request): NextResponse | null {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  // API key auth bypass — coherente con middleware.
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer sk_")) {
    return null;
  }

  // Compatibilidad con NextRequest (cookies API) y Request (header parse).
  const cookieToken = readCsrfCookie(req);
  const headerToken = req.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    return csrfForbidden("missing");
  }

  if (cookieToken.length !== headerToken.length) {
    return csrfForbidden("length-mismatch");
  }

  try {
    const a = Buffer.from(cookieToken, "utf8");
    const b = Buffer.from(headerToken, "utf8");
    if (a.length !== b.length) return csrfForbidden("buffer-mismatch");
    if (!timingSafeEqual(a, b)) return csrfForbidden("token-mismatch");
  } catch {
    return csrfForbidden("compare-error");
  }

  return null;
}

function readCsrfCookie(req: NextRequest | Request): string | null {
  // NextRequest tiene .cookies API tipada.
  const maybeNext = req as Partial<NextRequest>;
  if (maybeNext.cookies && typeof maybeNext.cookies.get === "function") {
    const v = maybeNext.cookies.get(CSRF_COOKIE_NAME)?.value;
    if (v) return v;
  }
  // Fallback: parsear Cookie header manualmente (Request plano).
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function csrfForbidden(reason: string): NextResponse {
  return NextResponse.json(
    {
      error: "CSRF token invalido o ausente. Recarga la pagina e intenta de nuevo.",
      code: "CSRF_FAILED",
      reason,
    },
    { status: 403 },
  );
}

/**
 * Genera un token CSRF cripto-aleatorio (32 bytes hex = 64 chars).
 * Mismo formato que `lib/csrf.ts::generateCsrfToken` para coherencia.
 */
export function generateCsrfToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Configuración estándar de la cookie CSRF (httpOnly:false, SameSite:strict). */
export const CSRF_COOKIE_OPTIONS = {
  name: CSRF_COOKIE_NAME,
  httpOnly: false as const,
  sameSite: "strict" as const,
  path: "/",
  maxAge: 60 * 60 * 24, // 24h
} as const;
