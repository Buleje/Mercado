import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { respuestaInvalida } from "@/lib/admin/sin-claves";
import { logActivity } from "@/lib/activity-logger";
import { AsistenteConexionesDB } from "@/lib/db/asistente-conexiones.db";
import { editarSchema, idValido, noExiste, ROLES_CONEXIONES, soloDuenoOAdmin } from "../_comun";

/**
 * /api/admin/ia/conexiones/[id] (Buleje IA, ADR-528) — admin/owner.
 * PATCH { nombre?, permiteEscribir?, activo? } → { conexion }
 * DELETE → { ok: true } (revoca para siempre: la clave deja de servir en la llamada siguiente).
 * Un id de otro negocio o ya revocado = 404 (el tenantId va en el WHERE).
 */

type Ctx = { params: Promise<{ id: string }> };

function auditar(tenantId: string, usuario: string, id: string, detalle: string, accion: string): void {
  logActivity(accion, "asistente_conexion", detalle, id, usuario, undefined, tenantId).catch((err) =>
    logger.error("[ia-conexiones] auditoría falló", { error: String(err) }),
  );
}

export const PATCH = withApiHandler("admin-ia-conexion-patch", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "MODERATE", "admin-ia-conexiones-alta");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_CONEXIONES);
  if (auth instanceof NextResponse) return auth;
  const rol = soloDuenoOAdmin(auth);
  if (rol) return rol;
  const id = idValido((await ctx.params).id);
  if (!id) return noExiste();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = editarSchema.safeParse(body);
  if (!parsed.success) {
    const r = respuestaInvalida(parsed.error);
    return NextResponse.json(r.body, { status: r.status });
  }

  try {
    const conexion = await AsistenteConexionesDB.actualizar(auth.tenantId, id, parsed.data);
    if (!conexion) return noExiste();
    const cambios = Object.entries(parsed.data)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(", ");
    auditar(auth.tenantId, auth.username, id, `Conexión de IA «${conexion.nombre}»: ${cambios}`, "editar");
    return NextResponse.json({ conexion });
  } catch (err) {
    logger.error("[ia-conexiones.PATCH] falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("admin-ia-conexion-delete", async (req: NextRequest, ctx: Ctx) => {
  const rl = await applyRateLimit(req, "MODERATE", "admin-ia-conexiones-alta");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_CONEXIONES);
  if (auth instanceof NextResponse) return auth;
  const rol = soloDuenoOAdmin(auth);
  if (rol) return rol;
  const id = idValido((await ctx.params).id);
  if (!id) return noExiste();

  try {
    if (!(await AsistenteConexionesDB.revocar(auth.tenantId, id))) return noExiste();
    auditar(auth.tenantId, auth.username, id, "Conexión de IA revocada", "revocar");
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[ia-conexiones.DELETE] falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
