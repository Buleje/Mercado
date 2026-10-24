import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { responderCuadro } from "@/lib/camaras/servir-cuadro.server";

/**
 * GET /api/admin/camaras/[id]/cuadro — el último cuadro del puente de pantalla
 * (ADR-466).
 *
 * La PC que tiene Hik-Connect abierto manda ~1 cuadro/s por la entrada de
 * siempre (`?modo=vivo`); el último vive 60 s en Redis y esta ruta lo sirve.
 * La pantalla lo vuelve a pedir cada segundo o dos: «casi en vivo», sin video.
 * Respuestas (200 webp · 204 · 404) en `lib/camaras/servir-cuadro.server.ts`,
 * compartida con el espejo del Modo TV (ADR-473).
 *
 * Mirar es de admin, owner y almacenero (como el resto de Cámaras).
 */

/** Varias cámaras a 1/s desde la misma pantalla caben; un bucle desbocado no. */
const POR_USUARIO = { max: 300, ventanaSeg: 60 };

export const GET = withApiHandler(
  "camaras-cuadro",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    /* En memoria y por negocio + IP: no gasta comandos de Upstash por cuadro. */
    const rl = rateLimit(`camara-cuadro:${auth.tenantId}:${getClientIp(req)}`, POR_USUARIO.max, POR_USUARIO.ventanaSeg);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) } },
      );
    }
    return responderCuadro(auth.tenantId, (await ctx.params).id);
  },
);
