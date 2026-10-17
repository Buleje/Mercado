import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { responderCuadro } from "@/lib/camaras/servir-cuadro.server";
import { anotarMiradaTv, camaraNoPermitida, exigirPantallaTv } from "@/lib/camaras/tv-auth.server";
import { camaraVisibleParaTv } from "@/lib/camaras/tv-camaras.server";

/**
 * Espejo del Modo TV (ADR-473) de `GET /api/admin/camaras/[id]/cuadro`: el
 * último cuadro del puente de pantalla (200 webp · 204 · 404), con la cookie
 * `buleje-tv`. Cámara fuera de la lista de la pantalla → 404.
 */
const POR_PANTALLA = { max: 300, ventanaSeg: 60 };

export const GET = withApiHandler(
  "tv-camaras-cuadro",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const tv = await exigirPantallaTv(req);
    if (tv instanceof NextResponse) return tv;
    const rl = rateLimit(`tv-cuadro:${tv.tenantId}:${getClientIp(req)}`, POR_PANTALLA.max, POR_PANTALLA.ventanaSeg);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) } },
      );
    }
    const { id } = await ctx.params;
    const camara = await camaraVisibleParaTv(tv.tenantId, tv.pantalla, id);
    if (!camara) return camaraNoPermitida();
    anotarMiradaTv(tv, camara);
    return responderCuadro(tv.tenantId, id);
  },
);
