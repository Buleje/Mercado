import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { AvisosCorreoDB } from "@/lib/db/avisos-correo.db";
import { AvisosCorreoPatchSchema, detalleDeTienda, guardarAvisosCorreo } from "@/lib/avisos-correo";
import { AVISO_CORREO_INFO } from "@/lib/avisos-correo-tipos";

/**
 * GET   /api/superadmin/tenants/[slug]/avisos-correo → { ok, avisos: AvisosCorreoDetalle }
 * PATCH /api/superadmin/tenants/[slug]/avisos-correo → body AvisosCorreoPatch (CSRF)
 *
 * Qué correos automáticos le llegan al dueño de la tienda (Tenant.ownerEmail) y el
 * interruptor del superadmin para pausarlos todos o apagar uno (21-10). Estado en
 * PlatformSetting `avisos-correo:<tenantId>` (ver lib/avisos-correo.ts).
 * `[slug]` acepta slug o id, como el resto de /tenants/[slug]/*.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const { slug } = await params;
  const tienda = await AvisosCorreoDB.tienda(slug);
  if (!tienda) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

  try {
    return NextResponse.json({ ok: true, avisos: await detalleDeTienda(tienda) });
  } catch (err) {
    logger.error("[superadmin/avisos-correo] GET falló", { tenantId: tienda.id, error: String(err).slice(0, 300) });
    return NextResponse.json({ error: "No se pudo leer los avisos por correo" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const rateLimited = applyRateLimit(req, "MODERATE", "sa-avisos-correo");
  if (rateLimited) return rateLimited;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = AvisosCorreoPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const { slug } = await params;
  const tienda = await AvisosCorreoDB.tienda(slug);
  if (!tienda) return NextResponse.json({ error: "Tienda no encontrada" }, { status: 404 });

  try {
    const cambio = parsed.data;
    const guardado = await guardarAvisosCorreo(tienda.id, cambio, auth.username);
    const detalle =
      "pausado" in cambio
        ? `Avisos por correo de "${tienda.slug}" ${cambio.pausado ? "PAUSADOS" : "reanudados"}`
        : `Aviso por correo «${AVISO_CORREO_INFO[cambio.tipo].nombre}» de "${tienda.slug}" ${cambio.activo ? "encendido" : "APAGADO"}`;
    // logSuperadminAction nunca tira (try/catch interno).
    await logSuperadminAction(
      "avisos_correo_cambio",
      detalle,
      { targetTenantId: tienda.id, targetTenantSlug: tienda.slug, cambio, estado: guardado },
      auth.username,
    );
    return NextResponse.json({ ok: true, avisos: await detalleDeTienda(tienda) });
  } catch (err) {
    logger.error("[superadmin/avisos-correo] PATCH falló", { tenantId: tienda.id, error: String(err).slice(0, 300) });
    return NextResponse.json({ error: "No se pudo guardar el cambio" }, { status: 500 });
  }
}
