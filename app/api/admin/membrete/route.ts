import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { MembreteDB } from "@/lib/db/membrete.db";

/**
 * GET /api/admin/membrete — nombre, logo y contacto del negocio de la sesión,
 * para los PDF del panel (hoja semanal, fotocheck). Si el nombre configurado
 * está vacío va el registrado (ver `lib/admin/membrete.ts`).
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "membrete");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const membrete = await MembreteDB.del(auth.tenantId);
    return NextResponse.json(membrete, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[admin/membrete] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer el nombre del negocio" }, { status: 503 });
  }
}
