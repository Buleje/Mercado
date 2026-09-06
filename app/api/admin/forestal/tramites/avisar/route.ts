import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { sendWhatsAppQueued } from "@/lib/whatsapp";

/**
 * /api/admin/forestal/tramites/avisar — POST
 *
 * Manda por WhatsApp el aviso de trámites que vencen pronto (el mismo banner
 * que ya se ve en el catálogo, ADR-364 rondas de plazo): el mensaje lo arma
 * el CLIENTE a partir de `tramitesPorVencer` — el mismo dato que ya está en
 * pantalla, no uno recalculado aparte que pudiera decir otra cosa — y este
 * endpoint es sólo el relay autenticado hacia `sendWhatsAppQueued`.
 *
 * Guard: requireAdmin → CSRF → rate limit STRICT (manda un mensaje real, no
 * es una lectura) → `spec:forestal:tramites` (la misma spec que el tab).
 */

const bodySchema = z.object({
  telefono: z.string().trim().min(6).max(20),
  mensaje: z.string().trim().min(1).max(1600), // tope real de un mensaje de WhatsApp
});

export const POST = withApiHandler("forestal-tramites-avisar-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "STRICT", "tramites-avisar");
  if (rl) return rl;

  const enabled = await isSpecializationEnabled(auth.tenantId, "spec:forestal:tramites");
  if (!enabled) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El módulo Trámites y Oficios no está habilitado para esta tienda." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }

  try {
    // `queued:true` = en la cola (durable); `queued:false` con jobId="direct"
    // = se mandó igual por la vía directa. Sólo `queued:false` SIN jobId es
    // una falla real (sin configurar, o circuito abierto).
    const { queued, jobId } = await sendWhatsAppQueued(parsed.data.telefono, parsed.data.mensaje, {
      tenantId: auth.tenantId,
      context: "tramites-vencimiento",
    });
    if (!queued && !jobId) {
      return NextResponse.json(
        { error: "whatsapp_no_disponible", message: "El WhatsApp del negocio no está configurado o no respondió. Probá de nuevo en un rato." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[tramites.avisar.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
