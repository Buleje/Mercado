import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { AgendaDB } from "@/lib/db/agenda.db";
import { ROLES_LEER_AGENDA, puedeLeerAgenda } from "@/lib/admin/agenda-acceso";

/**
 * GET /api/admin/agenda/hoy (ADR-501 §7) → `ResumenAgendaHoy`: lo de hoy (día de Lima),
 * las atrasadas de los últimos 7 días, las alertas de la campana y a quién
 * escribirle hoy (seguimiento a clientes, ADR-508; sólo roles que ven clientes).
 * `?fresco=1` vuelve a leer actividades, marcas y fuentes (botón «Actualizar»).
 * Está en RUTAS_PANEL: la campana sólo la pide con un rol que la puede leer.
 */
export async function GET(req: NextRequest) {
  const fresco = req.nextUrl.searchParams.get("fresco") === "1";
  if (fresco) {
    const rl = applyRateLimit(req, "GENEROUS", "agenda-fresco");
    if (rl) return rl;
  }
  const auth = await requireAdmin(req, ROLES_LEER_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeLeerAgenda(auth.role)) return NextResponse.json({ error: "No tienes acceso a la agenda" }, { status: 403 });

  try {
    if (fresco) AgendaDB.olvidar(auth.tenantId);
    return NextResponse.json(await AgendaDB.resumenHoy(auth.tenantId, auth.role, new Date(), { conSeguimientos: true }));
  } catch (err) {
    logger.error("[agenda] resumen de hoy falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo leer la agenda. Reintenta." }, { status: 503 });
  }
}
