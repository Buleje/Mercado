import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { ROLES_CONECTAR_AGENDA, puedeConectarAgenda } from "@/lib/admin/agenda-acceso";
import { AgendaConexionesDB } from "@/lib/db/agenda-conexiones.db";
import { credencialesGoogle, origenActual } from "@/lib/agenda/google/oauth";
import { sincronizarTenant } from "@/lib/agenda/google/sync";

/**
 * POST /api/admin/agenda/google/sincronizar — «Sincronizar ahora»: manda a Google
 * todo lo de la conexión de quien lo pide (actividades con canal Google, y tareas y
 * notas con fecha si dio permiso de Tasks). Lo que no cambió no se reenvía (huella).
 * Responde `{ enviados, sinCambios, fallidos }`.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_CONECTAR_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeConectarAgenda(auth.role)) {
    return NextResponse.json({ error: "Sólo el administrador o el dueño puede sincronizar con Google" }, { status: 403 });
  }
  if (!credencialesGoogle()) {
    return NextResponse.json({ error: "Google no está configurado en este servidor", configurado: false }, { status: 503 });
  }

  try {
    const conexion = await AgendaConexionesDB.conexionGoogle(auth.tenantId, auth.username);
    if (!conexion) return NextResponse.json({ error: "Todavía no conectaste tu cuenta de Google" }, { status: 404 });
    if (conexion.estado !== "activa") {
      return NextResponse.json(
        { error: conexion.ultimoError ?? "Google quitó el permiso: vuelve a conectar la cuenta" },
        { status: 409 },
      );
    }
    const resumen = await sincronizarTenant(auth.tenantId, { adminUserId: auth.username, origen: await origenActual() });
    return NextResponse.json(resumen, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[agenda/google] sincronizar error", { tenantId: auth.tenantId, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo sincronizar con Google" }, { status: 503 });
  }
}
