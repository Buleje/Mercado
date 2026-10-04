import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { CamarasDB } from "@/lib/db/camaras.db";
import { ultimoCuadro } from "@/lib/camaras/cuadro-vivo.server";

/**
 * GET /api/admin/camaras/[id]/cuadro — el último cuadro del puente de pantalla
 * (ADR-466).
 *
 * La PC que tiene Hik-Connect abierto manda ~1 cuadro/s por la entrada de
 * siempre (`?modo=vivo`); el último vive 60 s en Redis y esta ruta lo sirve.
 * La pantalla lo vuelve a pedir cada segundo o dos: «casi en vivo», sin video.
 *
 *  · 200 `image/webp` + `X-Cuadro-Ts` (ISO 8601 de cuando llegó) + `no-store`.
 *  · 204 si no llegó nada en los últimos 60 s (la PC está apagada o sin red).
 *  · 404 si la cámara no es de este negocio: el `tenantId` sale de la sesión y
 *    va en la clave de Redis, así que la de otro no se puede leer ni por id.
 *
 * Mirar es de admin, owner y almacenero (como el resto de Cámaras).
 */

/** Varias cámaras a 1/s desde la misma pantalla caben; un bucle desbocado no. */
const POR_USUARIO = { max: 300, ventanaSeg: 60 };

const idSchema = z.string().trim().min(1).max(64);

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

    const id = idSchema.safeParse((await ctx.params).id);
    if (!id.success) return NextResponse.json({ error: "no_encontrada" }, { status: 404 });
    const camara = (await CamarasDB.list(auth.tenantId)).find((c) => c.id === id.data);
    if (!camara) return NextResponse.json({ error: "no_encontrada" }, { status: 404 });

    const cuadro = await ultimoCuadro(auth.tenantId, camara.id);
    if (!cuadro) return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    return new NextResponse(new Uint8Array(cuadro.imagen), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store",
        "X-Cuadro-Ts": new Date(cuadro.ts).toISOString(),
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
