import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { createDistributedRateLimiter } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ID_ALARMA } from "@/lib/camaras/alarmas-hik";
import { fotoDeMovimiento, registrarFotoVista } from "@/lib/camaras/movimientos-nube.server";
import { ORIGENES_FOTO } from "@/lib/camaras/vigia-movimientos";

/**
 * GET /api/admin/camaras/movimientos/foto?id=<guid>[&origen=aviso]
 *
 * La foto que la cámara sacó en ese movimiento, bajada por el servidor (la URL
 * firmada de la nube nunca llega al navegador). Sólo de los movimientos de
 * ESTE negocio en las últimas 24 h: el id de otro negocio da 404.
 * Mismos roles que el vivo; errores de la nube → 502, nunca 401/403.
 * Quién la vio queda en el registro de actividad (Ley 29733), con `origen`:
 * `aviso` = la bajó el service worker para el aviso del celular bloqueado.
 */

const ROLES_VEN = ["admin", "owner", "almacenero"] as const;

const cupo = createDistributedRateLimiter({
  key: "camaras:movimientos:foto",
  maxRequests: 30,
  windowMs: 60_000,
});

const consultaSchema = z.object({
  id: z.string().regex(ID_ALARMA),
  origen: z.enum(ORIGENES_FOTO).default("panel"),
});

export const GET = withApiHandler("camaras-movimientos-foto", async (req: NextRequest) => {
  const auth = await requireAdmin(req, [...ROLES_VEN]);
  if (auth instanceof NextResponse) return auth;
  if (!(await cupo.check(`${auth.tenantId}:${auth.username}`)))
    return NextResponse.json(
      { error: "rate_limited", message: "Muchas fotos seguidas. Espera un minuto." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  const q = consultaSchema.safeParse({
    id: req.nextUrl.searchParams.get("id") ?? "",
    origen: req.nextUrl.searchParams.get("origen") ?? undefined,
  });
  if (!q.success)
    return NextResponse.json({ error: "validation_error", message: "Falta el movimiento." }, { status: 400 });

  const r = await fotoDeMovimiento(auth.tenantId, q.data.id);
  if (!r.ok) return NextResponse.json({ error: "sin_foto", message: r.error }, { status: r.status });
  const quien = { usuario: auth.username, rol: auth.role };
  const origen = q.data.origen;
  after(() => registrarFotoVista(auth.tenantId, quien, r.movimiento, origen));
  return new NextResponse(new Uint8Array(r.valor), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
