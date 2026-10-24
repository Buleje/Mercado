import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { applyRateLimit } from "@/lib/rate-limit";
import { exigirPantallaTv } from "@/lib/camaras/tv-auth.server";
import { camarasParaTv } from "@/lib/camaras/tv-camaras.server";

/**
 * GET /api/tv/camaras — con la cookie `buleje-tv` (ADR-473). Respuesta
 * `TvCamarasRespuesta` `{ pantalla, camaras }`: sólo las cámaras que el dueño
 * eligió para esta pantalla, con la forma de `GET /api/admin/camaras` y sin
 * secretos (`lib/camaras/tv-camaras.server.ts`). 401 si la pantalla se
 * desconectó o venció.
 */
export const GET = withApiHandler("tv-camaras", async (req: NextRequest) => {
  const tv = await exigirPantallaTv(req);
  if (tv instanceof NextResponse) return tv;
  const rl = applyRateLimit(req, "GENEROUS", "tv-camaras");
  if (rl) return rl;
  return NextResponse.json(await camarasParaTv(tv.tenantId, tv.pantalla), {
    headers: { "Cache-Control": "no-store" },
  });
});
