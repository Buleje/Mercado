/**
 * __tests__/test-utils/auth-request.ts
 *
 * Helper compartido para tests de route handlers que requieren CSRF + auth.
 *
 * Background (audit QA 2026-05-12):
 * Después del batch de seguridad CSRF (commits 1dc069c9 + c983e965 + 17
 * endpoints dinero hoy), 65+ tests de route handlers fallaban con 403 porque
 * NO inyectaban el header `x-csrf-token` ni el cookie equivalente.
 *
 * Soluciones:
 *  A) Mockear `assertCsrf` en cada test (frágil — recordar en cada nuevo)
 *  B) Helper centralizado que construye Request con headers correctos
 *
 * Este archivo implementa B. Uso:
 *
 *   import { makeAuthReq } from "@/__tests__/test-utils/auth-request";
 *
 *   const req = makeAuthReq("POST", "http://localhost/api/fiados/cobrar", {
 *     fiadoId: "abc",
 *     monto: 50,
 *   });
 *   const res = await POST(req);
 *
 * El helper inyecta:
 *  - `x-csrf-token`: token válido sincronizado con cookie
 *  - cookie `csrf-token`: mismo valor (assertCsrf compara cookie vs header)
 *  - `content-type: application/json` por defecto
 *  - `x-tenant-id` (opcional, default "main")
 */

import { NextRequest } from "next/server";

const TEST_CSRF_TOKEN = "test-csrf-token-deterministic-for-tests";
const TEST_TENANT_ID = "main";

export interface MakeAuthReqOptions {
  body?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  tenantId?: string;
  /**
   * Si `true`, NO incluye CSRF token (para testear que el endpoint rechaza
   * requests sin CSRF). Default: `false` (incluye CSRF correcto).
   */
  noCsrf?: boolean;
}

/**
 * Construye un NextRequest con headers + cookies CSRF/tenant correctas.
 *
 * Usado por tests que necesitan POST/PUT/PATCH/DELETE en route handlers
 * con `assertCsrf` activo.
 */
export function makeAuthReq(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
  options: Omit<MakeAuthReqOptions, "body"> = {},
): NextRequest {
  const tenantId = options.tenantId ?? TEST_TENANT_ID;
  const cookies = options.cookies ?? {};
  const headers = options.headers ?? {};

  // Construir cookie string con CSRF token
  const cookieEntries: string[] = [];
  if (!options.noCsrf) {
    cookieEntries.push(`csrf-token=${TEST_CSRF_TOKEN}`);
  }
  for (const [key, value] of Object.entries(cookies)) {
    cookieEntries.push(`${key}=${value}`);
  }

  const finalHeaders: Record<string, string> = {
    "content-type": "application/json",
    "x-tenant-id": tenantId,
    ...headers,
  };
  if (!options.noCsrf) {
    finalHeaders["x-csrf-token"] = TEST_CSRF_TOKEN;
  }
  if (cookieEntries.length > 0) {
    finalHeaders.cookie = cookieEntries.join("; ");
  }

  const requestInit: RequestInit = {
    method,
    headers: finalHeaders,
  };

  if (body !== undefined && method !== "GET") {
    requestInit.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  return new NextRequest(url, requestInit);
}

/**
 * Helper alternativo para tests que necesitan POST simple.
 */
export function makePost(url: string, body?: unknown, options: Omit<MakeAuthReqOptions, "body"> = {}) {
  return makeAuthReq("POST", url, body, options);
}

/**
 * Mock helper para `assertCsrf` — devuelve siempre `null` (CSRF OK).
 * Útil cuando NO quieres tocar el formato del request y solo bypassear la
 * verificación.
 *
 * Uso:
 *   vi.mock("@/lib/auth/csrf", () => ({
 *     assertCsrf: createCsrfMock(),
 *   }));
 */
export function createCsrfMock() {
  // Retorna función que siempre devuelve null (CSRF válido)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (() => null) as any;
}

/**
 * Mock helper que rechaza CSRF (para tests negativos).
 */
export function createCsrfRejectMock() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (() => new Response("CSRF invalid", { status: 403 })) as any;
}
