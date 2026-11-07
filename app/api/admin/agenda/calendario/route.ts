import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { AgendaDB } from "@/lib/db/agenda.db";
import { RangoSchema, primerMensaje } from "@/lib/agenda/schemas";
import { ROLES_LEER_AGENDA, puedeLeerAgenda } from "@/lib/admin/agenda-acceso";

/**
 * GET /api/admin/agenda/calendario?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (ADR-501 §7)
 * → `{ dias: DiaAgenda[] }`, un día por fecha del rango (hasta 62), con actividades,
 * notas, tareas y vencimientos. Cada fuente es UNA consulta para todo el rango.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_LEER_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeLeerAgenda(auth.role)) return NextResponse.json({ error: "No tienes acceso a la agenda" }, { status: 403 });

  const q = req.nextUrl.searchParams;
  const parsed = RangoSchema.safeParse({ desde: q.get("desde") ?? "", hasta: q.get("hasta") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: primerMensaje(parsed.error) }, { status: 400 });

  try {
    const dias = await AgendaDB.calendario(auth.tenantId, auth.role, parsed.data.desde, parsed.data.hasta);
    return NextResponse.json({ dias });
  } catch (err) {
    logger.error("[agenda] calendario falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo leer la agenda. Reintenta." }, { status: 503 });
  }
}
