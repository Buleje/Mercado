import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/activity-logger";
import { SettingsDB } from "@/lib/db/settings.db";
import { AjusteAsistenteSchema, CLAVE_ASISTENTE, leerAjusteAsistente } from "@/lib/whatsapp/asistente-negocio";

/**
 * GET/PUT /api/admin/whatsapp/asistente — la asistente de WhatsApp del negocio
 * (Settings › whatsappAsistente): tono, preguntas frecuentes, guía de asesoría,
 * a quién se traspasa y si puede ofrecer productos de otras tiendas. Mismos
 * roles que el aviso de «estamos cerrados». El negocio sale de la sesión.
 */

const ROLES = ["admin", "owner", "tienda_owner"] as const;

async function leer(tenantId: string) {
  const flags = await SettingsDB.getFeatureFlags(tenantId);
  const guardado = AjusteAsistenteSchema.safeParse(flags[CLAVE_ASISTENTE]);
  const lectura = leerAjusteAsistente(flags);
  return {
    /** Lo guardado, para editarlo; null si nunca se configuró o no valida. */
    ajuste: guardado.success ? guardado.data : null,
    /** Lo que el bot usa hoy. */
    enUso: { activo: lectura.activo, cruzarTiendas: lectura.cruzarTiendas },
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await leer(auth.tenantId));
  } catch (err) {
    logger.error("[whatsapp/asistente] GET", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo leer la asistente." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "whatsapp-asistente");
  if (rl) return rl;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const parsed = AjusteAsistenteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const campo = parsed.error.issues[0]?.path.join(".") || "ajuste";
    return NextResponse.json({ error: `Revisa «${campo}»: falta o es muy largo.` }, { status: 400 });
  }
  try {
    const antes = (await leer(auth.tenantId)).ajuste;
    await SettingsDB.pisarClavesFlags(auth.tenantId, { [CLAVE_ASISTENTE]: parsed.data });
    // Queda registrado qué cambió: el tono o cruzarTiendas cambian lo que el bot
    // les dice a las clientas.
    const nuevo = parsed.data as Record<string, unknown>;
    const previo = (antes ?? {}) as Record<string, unknown>;
    const cambios = Object.keys(nuevo).filter((k) => JSON.stringify(nuevo[k]) !== JSON.stringify(previo[k]));
    logActivity(
      "whatsapp.asistente.update",
      "WhatsAppAsistente",
      JSON.stringify({
        cambios,
        activo: parsed.data.activo,
        cruzarTiendas: parsed.data.cruzarTiendas,
        ...(cambios.includes("cruzarTiendas") && { cruzarTiendasAntes: previo.cruzarTiendas ?? false }),
      }).slice(0, 500),
      undefined,
      auth.username,
      req.headers.get("x-request-id") ?? undefined,
      auth.tenantId,
    ).catch((err) => logger.error("[whatsapp/asistente] logActivity", { error: String(err) }));
    return NextResponse.json(await leer(auth.tenantId));
  } catch (err) {
    logger.error("[whatsapp/asistente] PUT", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo guardar la asistente." }, { status: 500 });
  }
}
