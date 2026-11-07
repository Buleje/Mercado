import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { AvisosCorreoDB } from "@/lib/db/avisos-correo.db";
import { AvisosCorreoPatchSchema, avisosParaLaTienda, guardarAvisosCorreo, porDeLaTienda } from "@/lib/avisos-correo";
import { AVISO_CORREO_INFO } from "@/lib/avisos-correo-tipos";
import { esSuplantacion } from "@/lib/auth/suplantacion";

/**
 * GET   /api/admin/avisos-correo → { ok, avisos: AvisosCorreoDeLaTienda }
 * PATCH /api/admin/avisos-correo → body AvisosCorreoPatch (CSRF) → lo mismo
 *
 * El dueño prende y apaga desde su panel los correos automáticos que le llegan
 * (24-10), con el mismo estado que el superadmin (PlatformSetting
 * `avisos-correo:<tenantId>`, ver lib/avisos-correo.ts). La tienda es SIEMPRE la
 * de la sesión (`auth.tenantId` del JWT): ni el body (`.strict()` rechaza claves
 * de más) ni la query eligen otra.
 *
 * Roles: `RUTAS_PANEL["/api/admin/avisos-correo"]` (dueño y admin); el encargado
 * entra por el management-tier y sólo lee; el PATCH es de dueño y admin.
 */
const RATE_PREFIX = "admin-avisos-correo";

function puedeCambiar(role: string): boolean {
  return soloAdminODueno(role) === null;
}

export async function GET(req: NextRequest) {
  // Cada lectura son 4 consultas: mismo tope que las rutas vecinas (semáforo).
  const rateLimited = applyRateLimit(req, "MODERATE", `${RATE_PREFIX}:leer`);
  if (rateLimited) return rateLimited;

  const auth = await requireAdmin(req, RUTAS_PANEL["/api/admin/avisos-correo"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const tienda = await AvisosCorreoDB.tiendaPorId(auth.tenantId);
    if (!tienda) return NextResponse.json({ error: "No se encontró tu negocio" }, { status: 404 });
    return NextResponse.json({ ok: true, avisos: await avisosParaLaTienda(tienda, puedeCambiar(auth.role)) });
  } catch (err) {
    logger.error("[admin/avisos-correo] GET falló", { tenantId: auth.tenantId, error: String(err).slice(0, 300) });
    return NextResponse.json({ error: "No se pudo leer los avisos por correo" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "MODERATE", RATE_PREFIX);
  if (rateLimited) return rateLimited;

  const auth = await requireAdmin(req, RUTAS_PANEL["/api/admin/avisos-correo"]);
  if (auth instanceof NextResponse) return auth;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const sinPermiso = soloAdminODueno(auth.role, "cambiar los avisos por correo");
  if (sinPermiso) return sinPermiso;

  const parsed = AvisosCorreoPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const tienda = await AvisosCorreoDB.tiendaPorId(auth.tenantId);
    if (!tienda) return NextResponse.json({ error: "No se encontró tu negocio" }, { status: 404 });

    const cambio = parsed.data;
    // guardarAvisosCorreo escribe bajo el candado de la clave e invalida la caché de 5 min
    // de esta instancia (PlatformSettingsDB.actualizar); las demás la ven en ≤5 min.
    // El superadmin suplantando queda como «la plataforma» para el dueño (sin su usuario).
    const por = esSuplantacion(auth.username) ? auth.username : porDeLaTienda(auth.username);
    const guardado = await guardarAvisosCorreo(tienda.id, cambio, por);
    const detalle =
      "pausado" in cambio
        ? `Avisos por correo ${cambio.pausado ? "PAUSADOS" : "reanudados"}`
        : `Aviso por correo «${AVISO_CORREO_INFO[cambio.tipo].nombre}» ${cambio.activo ? "encendido" : "APAGADO"}`;
    // logActivity nunca tira: un renglón de auditoría que falla no deshace el cambio.
    await logActivity(
      "avisos_correo_cambio",
      "avisos-correo",
      `${detalle} · queda: ${JSON.stringify(guardado)}`,
      tienda.id,
      auth.username,
      undefined,
      tienda.id,
    );
    return NextResponse.json({ ok: true, avisos: await avisosParaLaTienda(tienda, true) });
  } catch (err) {
    logger.error("[admin/avisos-correo] PATCH falló", { tenantId: auth.tenantId, error: String(err).slice(0, 300) });
    return NextResponse.json({ error: "No se pudo guardar el cambio" }, { status: 500 });
  }
}
