import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { responderVideoNube } from "@/lib/camaras/servir-video-nube.server";
import { camaraNoPermitida, exigirPantallaTv, quienEsTv } from "@/lib/camaras/tv-auth.server";
import { camaraVisibleParaTv, nubePermitidaParaTv } from "@/lib/camaras/tv-camaras.server";

/**
 * Espejo del Modo TV (ADR-473) de `POST /api/admin/camaras/[id]/en-vivo-nube`:
 * mismo cuerpo y misma respuesta (`servir-video-nube.server.ts`), con la cookie
 * `buleje-tv`. La mirada queda en el registro como «Pantalla <nombre>» (rol
 * `tv`).
 *
 * Más estricto que el panel (security 07-10): el `appToken` de EZVIZ vale para
 * toda la cuenta, así que el TV
 *  · sólo pide **vivo** (`tipo: "grabacion"` → 400: un TV no revisa grabaciones);
 *  · recibe la nube sólo si la pantalla tiene «todas» o TODAS las cámaras
 *    enlazadas a Hik-Connect; si no, 409 `{ error: "nube_no_permitida", motivo }`
 *    y el visor usa el HLS o el cuadro si los hay.
 */
const soloVivo = z.object({ tipo: z.literal("vivo").optional() });
const pedidosDeVideo = createRateLimiter({ maxRequests: 30, windowMs: 60_000 });

export const POST = withApiHandler(
  "tv-camaras-vivo-nube",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const tv = await exigirPantallaTv(req);
    if (tv instanceof NextResponse) return tv;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const rl = applyRateLimit(req, pedidosDeVideo);
    if (rl) return rl;

    const { id } = await ctx.params;
    const camara = await camaraVisibleParaTv(tv.tenantId, tv.pantalla, id);
    if (!camara) return camaraNoPermitida();
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      raw = {};
    }
    if (!soloVivo.safeParse(raw ?? {}).success) {
      return NextResponse.json(
        { error: "validation_error", message: "En el televisor sólo se ve en vivo." },
        { status: 400 },
      );
    }
    const nube = await nubePermitidaParaTv(tv.tenantId, tv.pantalla);
    if (!nube.ok) {
      return NextResponse.json(
        { error: "nube_no_permitida", motivo: nube.motivo, message: nube.motivo },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    return responderVideoNube(tv.tenantId, id, raw, quienEsTv(tv.pantalla));
  },
);
