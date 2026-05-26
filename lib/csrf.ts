/**
 * lib/csrf.ts — CSRF Double-Submit Cookie Protection
 *
 * Implements the double-submit cookie pattern:
 * 1. A random CSRF token is set as a cookie (httpOnly: false, sameSite: strict)
 * 2. The client reads the cookie and sends it back as X-CSRF-Token header
 * 3. The server validates that the header matches the cookie
 *
 * Only applies to mutation methods (POST, PATCH, PUT, DELETE) on /api/* routes.
 *
 * Usage in middleware (proxy.ts):
 *   import { ensureCsrfCookie, validateCsrfToken } from "@/lib/csrf";
 *   // On every response: ensureCsrfCookie(response)
 *   // On mutations:     validateCsrfToken(request) → true/false
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";
const TOKEN_LENGTH = 32; // 32 bytes = 256 bits entropy

/** HTTP methods that require CSRF validation */
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Generate a cryptographically random CSRF token (hex string).
 */
export function generateCsrfToken(): string {
  const buf = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Set the CSRF token cookie on a response if it doesn't already exist
 * in the incoming request. The cookie is:
 * - httpOnly: false (client JS needs to read it for the header)
 * - sameSite: strict (prevents cross-site sends)
 * - secure: true in production
 * - path: / (available across the app)
 */
export function ensureCsrfCookie(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const existingToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (existingToken && existingToken.length === TOKEN_LENGTH * 2) {
    // Token already exists and has correct length
    return response;
  }

  const token = generateCsrfToken();
  const isProduction = process.env.NODE_ENV === "production";

  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Client JS must read this to set the header
    sameSite: "strict",
    secure: isProduction,
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
}

/**
 * Validate the CSRF token on mutation requests.
 *
 * Returns true if:
 * - The request method is not a mutation (GET, HEAD, OPTIONS)
 * - The route is not under /api/
 * - The X-CSRF-Token header matches the csrf-token cookie
 *
 * Returns false if:
 * - The request is a mutation on /api/*
 * - AND the header is missing or doesn't match the cookie
 */
export function validateCsrfToken(request: NextRequest): boolean {
  // Only validate mutation methods
  if (!MUTATION_METHODS.has(request.method)) {
    return true;
  }

  // Only validate /api/* routes
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return true;
  }

  // Skip CSRF for API key authenticated requests (Bearer sk_...)
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer sk_")) {
    return true;
  }

  // Skip CSRF for superadmin APIs (uses its own platform-session cookie auth,
  // and the CSRF cookie is never set on superadmin pages because they return
  // early in the middleware pipeline before ensureCsrfCookie runs)
  if (pathname.startsWith("/api/superadmin/")) {
    return true;
  }

  // Skip CSRF for auth endpoints (login, token refresh — no session to protect yet
  // or refresh rotates existing httpOnly cookie-based tokens automatically)
  // y endpoints webhook que reciben callbacks externos.
  //
  // `/api/auth/otp/send` + `/api/auth/otp/verify` están exentos porque son
  // parte del flujo de login inicial (sin sesión previa). El OTP funciona
  // como "algo que tenés" (SMS/WhatsApp) — el CSRF token no agrega
  // protección real acá, y el AuthModal no tiene fácil el csrf-cookie.
  const webhookPaths = [
    "/api/auth/login",
    "/api/auth/bypass",
    "/api/auth/refresh",
    "/api/auth/otp/",
    "/api/auth/customer/test-session",
    "/api/auth/customer-lookup",
    "/api/webhooks/",
    "/api/stripe/webhook",
    "/api/billing/webhook",
    "/api/billing/mp-webhook",
    "/api/cron/",
    "/api/health",
    // WhatsApp endpoints: protegidos por X-Hub-Signature-256 (HMAC) en /webhook
    // y /concierge; el subpath /test sólo responde en NODE_ENV != production.
    "/api/whatsapp/",
    "/api/admin/log-error", // error boundary, dispara antes del login
    // Beacon público de pageview de la tienda individual: navigator.sendBeacon
    // no permite headers custom — no puede enviar X-CSRF-Token. El endpoint
    // valida slug + ipHash y nunca devuelve datos sensibles.
    "/api/store-page/visits",
    // CSP violation reports — browser envía POST automaticamente cuando viola
    // CSP, sin cookies de sesión ni X-CSRF-Token. El endpoint rate-limit
    // STRICT + dedupe in-memory + solo loggea (no persiste a DB).
    "/api/csp-report",
    // Lead capture público desde /demo landing — prospect anónimo sin sesión.
    // El endpoint usa rate-limit MODERATE + Zod safeParse + WhatsApp regex.
    "/api/lead/capture",
    // Beacon de analítica de banners (impresiones/clicks): navigator.sendBeacon
    // no permite headers custom → no envía X-CSRF-Token. El endpoint valida
    // IDs con regex, rate-limit GENEROUS y solo incrementa contadores (sin
    // datos sensibles ni mutación de estado de usuario).
    "/api/marketplace/promo-banners/track",
  ];
  if (webhookPaths.some((p) => pathname.startsWith(p) || pathname === p)) {
    return true;
  }

  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  if (cookieToken.length !== headerToken.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }

  return result === 0;
}

/**
 * validateSuperadminCsrf — validación estricta SIN el bypass
 * `pathname.startsWith("/api/superadmin/")` de `validateCsrfToken`.
 *
 * Brandon 2026-05-24: el bypass histórico era porque las páginas
 * superadmin no seteaban `csrf-token` cookie (middleware retornaba
 * early). Ya no es cierto: la cookie está presente en el browser. Para
 * endpoints destructivos (purge, impersonate, repartidores/impersonate)
 * queremos defense-in-depth: cookie present + header match.
 *
 * NO leerse desde `validateCsrfToken` — este helper se invoca solo en
 * endpoints donde explícitamente queremos el chequeo (caller decide).
 *
 * Returns true si:
 *   - Método NO es mutación (GET/HEAD/OPTIONS)
 *   - Auth Bearer sk_… (API key)
 *   - Cookie csrf-token y header X-CSRF-Token presentes y matchean (constant-time)
 */
export function validateSuperadminCsrf(request: NextRequest): boolean {
  if (!MUTATION_METHODS.has(request.method)) return true;

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer sk_")) return true;

  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;

  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Create a 403 Forbidden response for CSRF validation failures.
 */
export function csrfForbiddenResponse(): NextResponse {
  return NextResponse.json(
    { error: "CSRF token invalido o ausente. Recarga la pagina e intenta de nuevo." },
    { status: 403 },
  );
}
