import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { permisoAdelantos } from "@/lib/adelantos/permisos";
import { AdelantosReciboDB } from "@/lib/db/adelantos-recibo.db";

/**
 * GET /api/adelantos/estado-recibos — por adelanto: hora de la última firma y
 * huella, y el último envío del recibo por WhatsApp (23-10). Lo pide la tabla
 * de Adelantos en una sola llamada; los mismos roles que leen adelantos.
 */
export async function GET(req: NextRequest) {
  const rl = await applyRateLimit(req, "MODERATE", "adelantos-estado-recibos"); if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const sinPermiso = permisoAdelantos(auth.role, "read");
  if (sinPermiso) return sinPermiso;
  try {
    const estados = await AdelantosReciboDB.estados(auth.tenantId);
    return NextResponse.json({ estados }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[adelantos/estado-recibos] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer el estado de los recibos." }, { status: 503 });
  }
}
