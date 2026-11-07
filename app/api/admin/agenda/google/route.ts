import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { ROLES_CONECTAR_AGENDA, puedeConectarAgenda, puedeAdministrarConexiones } from "@/lib/admin/agenda-acceso";
import { AgendaConexionesDB, aConexionDTO } from "@/lib/db/agenda-conexiones.db";
import { credencialesGoogle, olvidarTokenDeAcceso, revocarEnGoogle } from "@/lib/agenda/google/oauth";

/**
 * GET    /api/admin/agenda/google — la conexión con Google de quien mira (`ConexionGoogleDTO | null`).
 *        Con `?todas=1` (sólo dueño/admin) → `{ conexiones: ConexionAdminDTO[] }` de TODO el negocio.
 * DELETE /api/admin/agenda/google — la revoca en Google y borra el permiso guardado.
 *        Con `?id=<conexionId>` (sólo dueño/admin) revoca la de cualquier usuario del negocio.
 *        El calendario «Buleje · Administración» queda en su cuenta (lo borra él si quiere).
 *
 * Una conexión por usuario del panel (`adminUserId` = usuario de la sesión).
 * Sin GOOGLE_CLIENT_ID/SECRET → 503 «no configurado», nunca 500.
 */

const SIN_PERMISO = { error: "Sólo el administrador o el dueño puede conectar Google" };
const SOLO_DUENO = { error: "Sólo el dueño o el administrador puede ver o revocar las conexiones de otros" };
const NO_CONFIGURADO = {
  error: "Google no está configurado en este servidor: falta la clave de Google (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).",
  configurado: false,
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_CONECTAR_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeConectarAgenda(auth.role)) return NextResponse.json(SIN_PERMISO, { status: 403 });
  if (!credencialesGoogle()) return NextResponse.json(NO_CONFIGURADO, { status: 503 });

  const todas = req.nextUrl.searchParams.get("todas") === "1";
  if (todas && !puedeAdministrarConexiones(auth.role)) return NextResponse.json(SOLO_DUENO, { status: 403 });

  try {
    if (todas) {
      const conexiones = await AgendaConexionesDB.listarConexiones(auth.tenantId);
      return NextResponse.json({ conexiones }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const fila = await AgendaConexionesDB.conexionGoogle(auth.tenantId, auth.username);
    return NextResponse.json(fila ? aConexionDTO(fila) : null, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[agenda/google] GET error", { tenantId: auth.tenantId, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo leer la conexión con Google" }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES_CONECTAR_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeConectarAgenda(auth.role)) return NextResponse.json(SIN_PERMISO, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (id && !puedeAdministrarConexiones(auth.role)) return NextResponse.json(SOLO_DUENO, { status: 403 });

  try {
    const fila = id
      ? await AgendaConexionesDB.revocarConexionGooglePorId(auth.tenantId, id, auth.username)
      : await AgendaConexionesDB.revocarConexionGoogle(auth.tenantId, auth.username);
    if (!fila) return NextResponse.json({ error: "No hay una cuenta de Google conectada" }, { status: 404 });
    olvidarTokenDeAcceso(fila.id);
    // Best effort: si Google no contesta, el permiso igual ya no está en Buleje.
    const revocado = await revocarEnGoogle(fila.refreshTokenCifrado).catch((err: unknown) => {
      logger.warn("[agenda/google] Google no confirmó la revocación", { tenantId: auth.tenantId, error: String(err) });
      return false;
    });
    return NextResponse.json({ ok: true, revocadoEnGoogle: revocado });
  } catch (e) {
    logger.error("[agenda/google] DELETE error", { tenantId: auth.tenantId, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudo desconectar Google" }, { status: 503 });
  }
}
