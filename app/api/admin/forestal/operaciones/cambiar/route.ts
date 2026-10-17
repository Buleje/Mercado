/**
 * POST /api/admin/forestal/operaciones/cambiar { slug } — pasar al libro hermano (ADR-395).
 *
 * Es un login sin contraseña, y por eso está acotado a lo que ya se probó al
 * entrar: la sesión actual es válida, el destino está en el MISMO grupo de
 * operaciones, está activo, tiene el libro CTP y el usuario tiene cuenta ACTIVA
 * con el MISMO username allí. Se emiten sesión y refresh del destino con las
 * mismas opciones de cookie que el login, y se audita en los dos libros.
 *
 * Rate limit STRICT: cambiar de libro no es algo que se haga diez veces por minuto.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import {
  createSessionToken,
  createRefreshToken,
  SESSION,
  REFRESH,
  type AdminRole,
} from "@/lib/session";
import { ForestCtpOperacionesDB } from "@/lib/db/forest-ctp-operaciones.db";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { logger } from "@/lib/logger";

const schema = z.object({ slug: z.string().trim().min(1).max(80) });

/* Las mismas opciones que el login: una sesión de operación hermana no puede
   ser ni más laxa ni más estricta que la que se obtuvo con contraseña. */
function makeAccessCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: SESSION.MAX_AGE,
    path: "/",
  };
}
function makeRefreshCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: REFRESH.MAX_AGE,
    path: "/",
  };
}

export const POST = withApiHandler("forestal-operaciones-cambiar", async (req: NextRequest) => {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "STRICT", "ctp-operaciones-cambiar");
  if (rl) return rl;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error" }, { status: 400 });
  const username = auth.username ?? "unknown";
  try {
    const destino = await ForestCtpOperacionesDB.destinoDeCambio(
      auth.tenantId,
      username,
      parsed.data.slug,
    );
    const role = destino.role as AdminRole;
    const [token, refresh] = await Promise.all([
      createSessionToken(role, username, destino.tenantId, destino.name),
      createRefreshToken(role, username, destino.tenantId, destino.name),
    ]);
    const detail = `Cambió de operación: ${auth.tenantId} → «${destino.nombre}» (${destino.slug}), como ${role}`;
    auditCtp({
      tenantId: auth.tenantId,
      action: "ctp_operacion_cambiar",
      entity: "Tenant",
      entityId: destino.tenantId,
      detail,
      user: username,
    });
    auditCtp({
      tenantId: destino.tenantId,
      action: "ctp_operacion_cambiar",
      entity: "Tenant",
      entityId: auth.tenantId,
      detail,
      user: username,
    });
    logger.info("[ctp-operaciones] cambio de libro", {
      de: auth.tenantId,
      a: destino.tenantId,
      username,
    });

    const res = NextResponse.json({ ok: true, slug: destino.slug, nombre: destino.nombre, role });
    res.cookies.set(SESSION.COOKIE_NAME, token, makeAccessCookie());
    res.cookies.set(REFRESH.COOKIE_NAME, refresh, makeRefreshCookie());
    res.cookies.set("active-tenant", destino.tenantId, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
      httpOnly: false,
    });
    res.cookies.set("active-tenant-slug", destino.slug, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      sameSite: "lax",
      httpOnly: false,
    });
    return res;
  } catch (err) {
    return ctpErrorResponse(err, "operaciones.cambiar", auth.tenantId);
  }
});
