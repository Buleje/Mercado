import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { responderSnapshot } from "@/lib/camaras/servir-snapshot.server";
import { anotarMiradaTv, camaraNoPermitida, exigirPantallaTv, quienEsTv } from "@/lib/camaras/tv-auth.server";
import { camaraVisibleParaTv } from "@/lib/camaras/tv-camaras.server";

/**
 * Espejo del Modo TV (ADR-473) de `GET /api/admin/camaras/[id]/snapshot`: la
 * foto de ahora por ISAPI, mismas respuestas (`servir-snapshot.server.ts`), con
 * la cookie `buleje-tv`. Cámara fuera de la lista de la pantalla → 404.
 */
export const GET = withApiHandler(
  "tv-camaras-snapshot",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const tv = await exigirPantallaTv(req);
    if (tv instanceof NextResponse) return tv;
    const rl = applyRateLimit(req, "GENEROUS", "tv-camaras-snapshot");
    if (rl) return rl;

    const { id } = await ctx.params;
    const camara = await camaraVisibleParaTv(tv.tenantId, tv.pantalla, id);
    if (!camara) return camaraNoPermitida();
    anotarMiradaTv(tv, camara);
    return responderSnapshot(tv.tenantId, id, quienEsTv(tv.pantalla).usuario);
  },
);
