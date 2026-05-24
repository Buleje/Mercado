/**
 * lib/superadmin-response.ts
 *
 * Helper único para construir respuestas JSON desde endpoints `/api/superadmin/*`
 * con headers de seguridad consistentes.
 *
 * El audit de seguridad 2026-05-24 detectó 73/91 endpoints sin
 * `Cache-Control: no-store` ni `X-Content-Type-Options: nosniff`. Sin esos
 * headers, un proxy/CDN podría cachear respuestas con datos cross-tenant
 * (impersonate, tenant listings, payment-proofs) y servirlas a otra sesión.
 *
 * Uso:
 *   import { secureJson, secureError } from "@/lib/superadmin-response";
 *
 *   return secureJson({ ok: true, data: rows });            // 200
 *   return secureError("CSRF inválido", 403);               // status custom
 *   return secureJson(payload, 200, { "ETag": "..." });      // extra headers
 *
 * Lo que aplica siempre:
 *   - `Cache-Control: no-store, max-age=0`
 *   - `X-Content-Type-Options: nosniff`
 *
 * Si tu endpoint necesita habilitar cache (raro en superadmin), usá
 * `NextResponse.json` directo.
 */

import { NextResponse } from "next/server";

const SECURE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function secureJson<T>(
  data: T,
  status = 200,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { ...SECURE_HEADERS, ...extraHeaders },
  });
}

export function secureError(
  message: string,
  status: number,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { ...SECURE_HEADERS, ...extraHeaders } },
  );
}

/** Si necesitás los headers como objeto plano para pasarlos manualmente. */
export const SECURE_HEADERS_OBJECT = SECURE_HEADERS;
