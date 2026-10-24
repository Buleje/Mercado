import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { createDistributedRateLimiter } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { paraCliente } from "@/lib/camaras/alarmas-hik";
import type { RespuestaMovimientos } from "@/lib/camaras/movimientos-nube";
import { deteccionDe, fuenteDeMovimientos, movimientosRecientes } from "@/lib/camaras/movimientos-nube.server";
import { celularParaCabecera } from "@/lib/camaras/vigia-movimientos.server";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/camaras/movimientos?desde=<epoch ms>
 *
 * Los movimientos que vieron las cámaras de Hik-Connect (la cola de alarmas de
 * la nube), para avisar en la cabecera SIN tener la cámara abierta. Responde
 * `RespuestaMovimientos` (`lib/camaras/movimientos-nube.ts`): eventos después
 * de `desde` (como mucho 50, del más nuevo), detección armada por cámara y si
 * quien pregunta puede prenderla. La foto de cada uno: `./foto?id=`.
 *
 * Roles = quien ve el vivo (admin, dueño, almacenero). Sin cuenta o sin
 * cámaras enlazadas → `vinculado: false` (200). Errores de Hikvision → lo
 * guardado + `aviso` (200): nunca 401/403, que sacarían del panel.
 */

const ROLES_VEN = ["admin", "owner", "almacenero"] as const;
const TOPE_RESPUESTA = 50;

/* La cabecera pregunta cada 45 s: 20/min por persona deja abrir varias pestañas. */
const cupo = createDistributedRateLimiter({
  key: "camaras:movimientos",
  maxRequests: 20,
  windowMs: 60_000,
});

const consultaSchema = z.object({
  desde: z.coerce.number().int().min(0).optional(),
});

const sinCamaras = (aviso: string | null, puedeConfigurar: boolean): RespuestaMovimientos => ({
  vinculado: false,
  eventos: [],
  deteccion: [],
  puedeConfigurar,
  consultadoAt: 0,
  aviso,
});

const SIN_CACHE = { "Cache-Control": "no-store" };

export const GET = withApiHandler("camaras-movimientos", async (req: NextRequest) => {
  const auth = await requireAdmin(req, [...ROLES_VEN]);
  if (auth instanceof NextResponse) return auth;
  if (!(await cupo.check(`${auth.tenantId}:${auth.username}`)))
    return NextResponse.json(
      { error: "rate_limited", message: "Demasiadas consultas. Espera un minuto." },
      { status: 429, headers: { "Retry-After": "60" } },
    );

  const q = consultaSchema.safeParse({
    desde: req.nextUrl.searchParams.get("desde") ?? undefined,
  });
  if (!q.success)
    return NextResponse.json(
      { error: "validation_error", message: "`desde` tiene que ser una hora en milisegundos." },
      { status: 400 },
    );
  const puedeConfigurar = soloAdminODueno(auth.role) === null;

  const fuente = await fuenteDeMovimientos(auth.tenantId);
  if (!fuente.ok)
    return NextResponse.json(sinCamaras(fuente.motivo, puedeConfigurar), { headers: SIN_CACHE });

  const [recientes, deteccion, celular] = await Promise.all([
    movimientosRecientes(auth.tenantId, fuente.cred, fuente.camaras),
    deteccionDe(auth.tenantId, fuente.cred, fuente.camaras),
    /* Lo del celular no tumba la cabecera: sin esto, igual van los movimientos. */
    celularParaCabecera(
      auth.tenantId,
      auth.username,
      fuente.camaras.map((c) => c.id),
    ).catch((err: unknown) => {
      logger.warn("[camaras.movimientos] no se pudo leer el aviso al celular", { error: String(err) });
      return null;
    }),
  ]);
  const desde = q.data.desde ?? 0;
  const cuerpo: RespuestaMovimientos = {
    vinculado: true,
    eventos: recientes.movimientos
      .filter((m) => m.at > desde)
      .slice(0, TOPE_RESPUESTA)
      .map(paraCliente),
    deteccion,
    puedeConfigurar,
    consultadoAt: recientes.consultadoAt,
    aviso: recientes.aviso,
    celular,
  };
  return NextResponse.json(cuerpo, { headers: SIN_CACHE });
});
