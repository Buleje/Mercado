import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { responderVivo } from "@/lib/camaras/servir-vivo.server";
import { TV_API_ADMIN } from "@/lib/camaras/pantallas-tv";

/**
 * Video en vivo de una cámara (ADR-470). La lógica (lista, segmentos y
 * arranque del ffmpeg) vive en `lib/camaras/servir-vivo.server.ts`, compartida
 * con el espejo del Modo TV (ADR-473); acá sólo la sesión y el cupo.
 *
 *  · `GET .../vivo`            → dice si esta instalación puede dar video y arranca el stream.
 *  · `GET .../vivo/vivo.m3u8`  → la lista de reproducción.
 *  · `GET .../vivo/s001.ts`    → cada pedazo de video.
 */

/**
 * Cupo aparte para la lista y los segmentos (05-10).
 *
 * Un reproductor HLS pide la lista y un segmento cada 2 s: ~60 pedidos por
 * minuto por pestaña. Con el `GENEROUS` de antes (100/min por IP) bastaban
 * DOS pestañas —o dos cámaras— para que el pedido 101 diera 429 y el video se
 * cortara (medido: 130 pedidos en 57 s → 100 pasan, 30 rebotan). 600/min da
 * para las 4 cámaras del tope × 2 pantallas, con margen. Leer un segmento es
 * leer un archivo chico ya validado por nombre: no hay nada caro que proteger.
 * El arranque (que sí levanta un ffmpeg) sigue con su cupo chico.
 */
const lecturasDelVideo = createRateLimiter({ maxRequests: 600, windowMs: 60_000 });

export const GET = withApiHandler(
  "camaras-vivo",
  async (req: NextRequest, ctx: { params: Promise<{ id: string; archivo?: string[] }> }) => {
    const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
    if (auth instanceof NextResponse) return auth;

    const { id, archivo } = await ctx.params;
    const nombre = archivo?.[0];

    const rl = nombre ? applyRateLimit(req, lecturasDelVideo) : applyRateLimit(req, "GENEROUS", "camaras-vivo");
    if (rl) return rl;

    return responderVivo(auth.tenantId, id, nombre, TV_API_ADMIN);
  },
);
