import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { responderVivo } from "@/lib/camaras/servir-vivo.server";
import { anotarMiradaTv, camaraNoPermitida, exigirPantallaTv } from "@/lib/camaras/tv-auth.server";
import { camaraVisibleParaTv } from "@/lib/camaras/tv-camaras.server";
import { TV_API_TV } from "@/lib/camaras/pantallas-tv";

/**
 * Espejo del Modo TV (ADR-473) de `GET /api/admin/camaras/[id]/vivo[/archivo]`:
 * misma lógica (`servir-vivo.server.ts`) y mismas respuestas, con la cookie
 * `buleje-tv` en vez de la sesión del panel. Cámara fuera de la lista de la
 * pantalla → 404. La lista devuelta apunta a `/api/tv/camaras/<id>/vivo/vivo.m3u8`.
 */

/** Mismo cupo que el panel: lista + segmento cada 2 s por cámara. */
const lecturasDelVideo = createRateLimiter({ maxRequests: 600, windowMs: 60_000 });

export const GET = withApiHandler(
  "tv-camaras-vivo",
  async (req: NextRequest, ctx: { params: Promise<{ id: string; archivo?: string[] }> }) => {
    const tv = await exigirPantallaTv(req);
    if (tv instanceof NextResponse) return tv;

    const { id, archivo } = await ctx.params;
    const nombre = archivo?.[0];
    const rl = nombre ? applyRateLimit(req, lecturasDelVideo) : applyRateLimit(req, "GENEROUS", "tv-camaras-vivo");
    if (rl) return rl;

    const camara = await camaraVisibleParaTv(tv.tenantId, tv.pantalla, id);
    if (!camara) return camaraNoPermitida();
    anotarMiradaTv(tv, camara);
    return responderVivo(tv.tenantId, id, nombre, TV_API_TV);
  },
);
