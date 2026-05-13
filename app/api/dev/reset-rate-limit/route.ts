/**
 * POST /api/dev/reset-rate-limit
 *
 * DEV-ONLY: Resetea el rate-limit in-memory + el lockout de login-attempts
 * para destrabar al desarrollador cuando recibe 429 en /api/auth/login.
 *
 * Bloquea cualquier llamada en producción (NODE_ENV === "production").
 *
 * Uso:
 *   curl -X POST http://localhost:3000/api/dev/reset-rate-limit
 *   curl -X POST "http://localhost:3000/api/dev/reset-rate-limit?prefix=auth:login"
 */

import { NextRequest, NextResponse } from "next/server";
import { __resetInMemoryStores } from "@/lib/rate-limit";
import { invalidateByPrefix } from "@/lib/cache";

async function handleReset(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Endpoint deshabilitado en producción" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const prefix = searchParams.get("prefix") ?? undefined;

  const result = __resetInMemoryStores(prefix);

  // Limpia también los lockouts de login (cacheStore keys "loginAttempts:*")
  invalidateByPrefix("loginAttempts:");

  return NextResponse.json({
    ok: true,
    message: prefix
      ? `Rate-limit + login-lockout limpios para keys con prefijo "${prefix}"`
      : "Rate-limit + login-lockout completamente reseteados",
    cleared: result,
  });
}

// GET y POST aceptados para que basta `curl http://localhost:3000/...`
export const GET = handleReset;
export const POST = handleReset;
