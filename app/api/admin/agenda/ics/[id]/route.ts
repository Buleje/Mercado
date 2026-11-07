import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { ROLES_CONECTAR_AGENDA, puedeConectarAgenda } from "@/lib/admin/agenda-acceso";
import { AgendaConexionesDB } from "@/lib/db/agenda-conexiones.db";

/**
 * DELETE /api/admin/agenda/ics/[id] — revoca un calendario publicado: desde ese momento
 * su URL responde 404 (quien lo tenga suscrito deja de recibir cambios).
 * Ajeno, inexistente o ya revocado → 404 (el WHERE lleva el tenantId).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ROLES_CONECTAR_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeConectarAgenda(auth.role)) {
    return NextResponse.json({ error: "Sólo el administrador o el dueño puede revocar el calendario" }, { status: 403 });
  }

  const { id } = await params;
  if (!id || id.length > 64) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  try {
    const revocado = await AgendaConexionesDB.revocarFeed(auth.tenantId, id, auth.username);
    if (!revocado) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[agenda/ics] DELETE error", { tenantId: auth.tenantId, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo revocar el calendario" }, { status: 503 });
  }
}
