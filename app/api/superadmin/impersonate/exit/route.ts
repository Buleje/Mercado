import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getSessionPayload, SESSION } from "@/lib/session";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { logger } from "@/lib/logger";

/**
 * POST /api/superadmin/impersonate/exit
 *
 * Termina una sesion de impersonacion. El titular de la cookie (token con
 * username que empieza con "impersonated-by:") es el unico que puede llamar
 * este endpoint — sin requerir sesion superadmin activa porque el superadmin
 * ya no tiene esa cookie en su browser: la tiene el tab impersonado.
 *
 * Flujo:
 *   1. Lee y verifica la cookie de sesion admin actual.
 *   2. Verifica que sea una sesion impersonada (username "impersonated-by:*").
 *   3. Registra audit log (fire-and-forget).
 *   4. Elimina la cookie de sesion + cookies de contexto de tenant.
 */
export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get(SESSION.COOKIE_NAME);
  if (!sessionCookie?.value) {
    return NextResponse.json({ error: "Sin sesion activa" }, { status: 401 });
  }

  // Verificar y decodificar el token con firma — usa el mismo helper que el middleware
  const payload = await getSessionPayload(sessionCookie.value);
  if (!payload) {
    return NextResponse.json({ error: "Token invalido o expirado" }, { status: 401 });
  }

  // Solo sesiones impersonadas tienen username con prefijo "impersonated-by:"
  if (!payload.username.startsWith("impersonated-by:")) {
    return NextResponse.json({ error: "Esta sesion no es de impersonacion" }, { status: 400 });
  }

  const impersonator = payload.username.replace("impersonated-by:", "");
  const tenantId = payload.tenantId;

  // Audit trail — fire-and-forget obligatorio (Ley 29733 Art. 16)
  logSuperadminAction(
    "impersonate_exit",
    `SuperAdmin "${impersonator}" salio de impersonacion de tenant "${tenantId}"`,
    {
      impersonator,
      tenantId,
      ip: req.headers.get("x-forwarded-for") ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
      timestamp: new Date().toISOString(),
    },
    impersonator,
  ).catch((err) => logger.warn("[impersonate/exit] audit failed", { err: String(err) }));

  // Limpiar todas las cookies de sesion admin
  const res = NextResponse.json({ ok: true, impersonator });
  res.cookies.delete(SESSION.COOKIE_NAME);
  res.cookies.delete("active-tenant");
  res.cookies.delete("active-tenant-slug");
  return res;
}
