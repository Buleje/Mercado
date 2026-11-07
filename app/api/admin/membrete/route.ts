import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { MembreteDB } from "@/lib/db/membrete.db";
import { ROLES_MEMBRETE } from "@/lib/admin/membrete";

/**
 * GET /api/admin/membrete — nombre, logo y contacto del negocio de la sesión,
 * para los papeles del panel (ADR-514). Manda Ajustes › Datos del negocio; si
 * un dato está vacío va el registrado (ver `lib/admin/membrete.ts`). Trae
 * `logoPngUrl`: el mismo logo en PNG desde `/api/admin/membrete/logo`.
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "membrete");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, ROLES_MEMBRETE);
  if (auth instanceof NextResponse) return auth;

  try {
    const membrete = await MembreteDB.del(auth.tenantId);
    return NextResponse.json(membrete, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[admin/membrete] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer el nombre del negocio" }, { status: 503 });
  }
}
