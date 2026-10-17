import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { getWhatsAppConfig, listWhatsAppConfigs } from "@/lib/db/whatsapp-messages.db";

/**
 * POST /api/admin/whatsapp/test — prueba de conexión con Meta Cloud API.
 *
 * Consulta el Phone Number ID guardado con el token del tenant. Si Meta responde,
 * devolvemos el número real y el nombre verificado — prueba de que las
 * credenciales funcionan sin mandar ningún mensaje.
 */
export async function POST(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "admin-whatsapp-test");
  if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin", "tienda_owner"]);
  if (auth instanceof NextResponse) return auth;

  // Multi-número: ?id= prueba un número específico; sin id = primer activo.
  const id = req.nextUrl.searchParams.get("id");
  const config = id
    ? (await listWhatsAppConfigs(auth.tenantId)).find((c) => c.id === id) ?? null
    : await getWhatsAppConfig(auth.tenantId);
  if (!config) {
    return NextResponse.json(
      { error: "Todavía no guardaste la configuración." },
      { status: 409 },
    );
  }

  const token =
    config.whatsappToken ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    process.env.WHATSAPP_API_TOKEN ||
    "";
  if (!token) {
    return NextResponse.json(
      { error: "Falta el token de WhatsApp. Pégalo y guarda primero." },
      { status: 409 },
    );
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      error?: { code?: number; message?: string };
    };

    if (!res.ok) {
      logger.warn("[admin/whatsapp/test] Meta rechazó la consulta", {
        tenantId: auth.tenantId,
        status: res.status,
        code: data.error?.code,
      });
      const friendly =
        data.error?.code === 190
          ? "El token expiró o no es válido. Genera uno nuevo en Meta."
          : "Meta no reconoce ese Phone Number ID con este token.";
      return NextResponse.json({ ok: false, error: friendly }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      phone: data.display_phone_number ?? null,
      verifiedName: data.verified_name ?? null,
      qualityRating: data.quality_rating ?? null,
    });
  } catch (e) {
    logger.error("[admin/whatsapp/test] fetch a Graph API falló", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "No se pudo contactar a Meta. Revisa tu conexión." },
      { status: 502 },
    );
  }
}
