import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { SuperadminTotpDB } from "@/lib/db/admin-totp.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/superadmin/totp/status
 *
 * Estado de los 2 pasos (TOTP) del superadmin con sesión, para la pantalla
 * Seguridad › Dos pasos. Nunca devuelve el secret.
 *
 * Auth: cookie PLATFORM_SESSION (igual que enroll/verify). Sin sesión → 401.
 * Respuesta 200: { usuario, activo, desde, pendiente }
 *   - activo: totpEnabledAt != null (las operaciones con step-up ya lo piden)
 *   - pendiente: hay secret guardado pero nunca se verificó un código
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  const session = token ? await getPlatformSession(token) : null;
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const row = await SuperadminTotpDB.getByUsername(session.username);
    if (!row) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }
    return NextResponse.json({
      usuario: session.username,
      activo: row.totpEnabledAt !== null,
      desde: row.totpEnabledAt ? new Date(row.totpEnabledAt).toISOString() : null,
      pendiente: row.totpEnabledAt === null && row.totpSecret !== null,
    });
  } catch (err) {
    logger.error("[superadmin/totp/status] Error leyendo estado", {
      username: session.username,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
