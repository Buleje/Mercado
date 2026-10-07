import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { responderVideoNube } from "@/lib/camaras/servir-video-nube.server";

/**
 * POST /api/admin/camaras/[id]/en-vivo-nube — lo que EZUIKit necesita para
 * mostrar el video de una cámara enlazada con Hik-Connect for Teams (ADR-471).
 * Cuerpo y respuesta en `lib/camaras/servir-video-nube.server.ts`, compartida
 * con el espejo del Modo TV (ADR-473).
 *
 * POST y no GET: la respuesta trae un permiso de video y la URL con el código
 * de verificación — no debe quedar en historial, caché ni logs de proxy. El
 * permiso (`appToken` de EZVIZ) es de vida corta y es por fuerza visible en el
 * navegador: el reproductor descifra el video ahí (riesgo anotado en el ADR).
 *
 * Lo pueden pedir los mismos roles que ven las cámaras (admin, dueño, almacenero).
 */

/**
 * Cupo propio: cambiar HD/SD o la hora de la grabación es un pedido nuevo, y
 * Hikvision corta a 5 por segundo por cuenta. 30 por minuto por IP da para
 * jugar con los controles sin martillar su API.
 */
const pedidosDeVideo = createRateLimiter({ maxRequests: 30, windowMs: 60_000 });

export const POST = withApiHandler(
  "camaras-vivo-nube",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const rl = applyRateLimit(req, pedidosDeVideo);
    if (rl) return rl;

    const { id } = await ctx.params;
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      raw = {};
    }
    return responderVideoNube(auth.tenantId, id, raw, { usuario: auth.username, rol: auth.role });
  },
);
