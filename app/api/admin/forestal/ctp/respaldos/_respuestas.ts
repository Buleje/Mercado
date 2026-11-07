import { NextResponse } from "next/server";
import { isSpecializationEnabled } from "@/lib/specializations";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { ESTADO_HTTP_RESPALDO, RespaldoError } from "@/lib/db/forest-ctp-respaldo.db";
import { createDistributedRateLimiter } from "@/lib/rate-limit";

/** Respuestas compartidas de las rutas de respaldos del libro (ADR-530). */

export async function moduloApagado(tenantId: string): Promise<NextResponse | null> {
  if (await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro")) return null;
  return NextResponse.json(
    { error: "specialization_disabled", message: "El módulo CTP no está habilitado para este tenant." },
    { status: 403 },
  );
}

/** `RespaldoError` → `{ error: <código>, message }` con su estado; el resto, como el libro. */
export function respuestaDeError(err: unknown, ctx: string, tenantId: string): NextResponse {
  if (err instanceof RespaldoError) {
    return NextResponse.json({ error: err.code, code: err.code, message: err.message }, { status: ESTADO_HTTP_RESPALDO[err.code] });
  }
  return ctpErrorResponse(err, ctx, tenantId);
}

export const jsonInvalido = () => NextResponse.json({ error: "invalid_json", message: "El pedido no es JSON." }, { status: 400 });

/* Comparar y recuperar leen el libro entero (y recuperar escribe en lote):
   cupo propio por usuario, entre instancias, aparte del cupo del libro. */
const cupos = {
  comparar: createDistributedRateLimiter({ key: "ctp-respaldo:comparar", maxRequests: 10, windowMs: 60_000 }),
  recuperar: createDistributedRateLimiter({ key: "ctp-respaldo:recuperar", maxRequests: 10, windowMs: 60_000 }),
};

export async function sinCupo(
  que: keyof typeof cupos,
  auth: { tenantId: string; username: string },
): Promise<NextResponse | null> {
  if (await cupos[que].check(`${auth.tenantId}:${auth.username}`)) return null;
  return NextResponse.json(
    { error: "rate_limited", message: "Demasiados pedidos seguidos con el libro entero. Espera un minuto." },
    { status: 429, headers: { "Retry-After": "60" } },
  );
}
