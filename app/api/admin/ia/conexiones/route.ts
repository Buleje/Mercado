import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { respuestaInvalida } from "@/lib/admin/sin-claves";
import { logActivity } from "@/lib/activity-logger";
import { AsistenteConexionesDB, MAX_CONEXIONES_POR_NEGOCIO } from "@/lib/db/asistente-conexiones.db";
import { crearSchema, ROLES_CONEXIONES, soloDuenoOAdmin, urlMcp } from "./_comun";

/**
 * /api/admin/ia/conexiones — las conexiones MCP del negocio (Buleje IA, ADR-528).
 * Solo admin/owner.
 *
 * GET  → { items: ConexionMcp[], urlMcp }
 * POST { nombre, permiteEscribir? } → 201 { conexion, token }
 *      El token entero vuelve UNA vez; la base guarda solo su hash.
 */

export const GET = withApiHandler("admin-ia-conexiones-get", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "GENEROUS", "admin-ia-conexiones");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES_CONEXIONES);
  if (auth instanceof NextResponse) return auth;
  const rol = soloDuenoOAdmin(auth);
  if (rol) return rol;
  try {
    const items = await AsistenteConexionesDB.listar(auth.tenantId);
    return NextResponse.json({ items, urlMcp: urlMcp() });
  } catch (err) {
    logger.error("[ia-conexiones.GET] falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("admin-ia-conexiones-post", async (req: NextRequest) => {
  const rl = await applyRateLimit(req, "MODERATE", "admin-ia-conexiones-alta");
  if (rl) return rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ROLES_CONEXIONES);
  if (auth instanceof NextResponse) return auth;
  const rol = soloDuenoOAdmin(auth);
  if (rol) return rol;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body", message: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = crearSchema.safeParse(body);
  if (!parsed.success) {
    const r = respuestaInvalida(parsed.error);
    return NextResponse.json(r.body, { status: r.status });
  }

  try {
    if ((await AsistenteConexionesDB.contarVivas(auth.tenantId)) >= MAX_CONEXIONES_POR_NEGOCIO) {
      return NextResponse.json(
        {
          error: "tope",
          message: `Ya hay ${MAX_CONEXIONES_POR_NEGOCIO} conexiones. Revoca una que no uses antes de crear otra.`,
        },
        { status: 409 },
      );
    }
    const { conexion, token } = await AsistenteConexionesDB.crear(auth.tenantId, {
      nombre: parsed.data.nombre,
      usuario: auth.username,
      rol: auth.role,
      permiteEscribir: parsed.data.permiteEscribir ?? false,
      creadoPor: auth.username,
    });
    logActivity(
      "crear",
      "asistente_conexion",
      `Conexión de IA «${conexion.nombre}» (${conexion.tokenPrefijo}…), ${conexion.permiteEscribir ? "puede anotar" : "solo consulta"}`,
      conexion.id,
      auth.username,
      undefined,
      auth.tenantId,
    ).catch((err) => logger.error("[ia-conexiones.POST] auditoría falló", { error: String(err) }));
    return NextResponse.json({ conexion, token }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("[ia-conexiones.POST] falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
