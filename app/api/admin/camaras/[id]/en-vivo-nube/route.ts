import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit, createRateLimiter } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { CamarasDB } from "@/lib/db/camaras.db";
import { CamarasHikConnectDB } from "@/lib/db/camaras-hik-connect.db";
import { FECHA_HIK, conCodigo } from "@/lib/camaras/hik-connect-api";
import { direccionDeVideo } from "@/lib/camaras/hik-connect-api.server";

/**
 * POST /api/admin/camaras/[id]/en-vivo-nube — lo que EZUIKit necesita para
 * mostrar el video de una cámara enlazada con Hik-Connect for Teams (ADR-471).
 *
 * Cuerpo: `{ tipo: "vivo" | "grabacion", calidad: "hd" | "sd", desde?, hasta? }`
 * (`desde`/`hasta` «YYYY-MM-DD HH:MM:SS», hora de la cámara, mismo día).
 * Respuesta: `{ url, accessToken, dominio, tipo, calidad, desde?, hasta? }`.
 *
 * POST y no GET: la respuesta trae un permiso de video y la URL con el código
 * de verificación — no debe quedar en historial, caché ni logs de proxy. El
 * permiso (`appToken` de EZVIZ) es de vida corta y es por fuerza visible en el
 * navegador: el reproductor descifra el video ahí (riesgo anotado en el ADR).
 *
 * Lo pueden pedir los mismos roles que ven las cámaras (admin, dueño, almacenero).
 */

const cuerpoSchema = z
  .object({
    tipo: z.enum(["vivo", "grabacion"]).default("vivo"),
    calidad: z.enum(["hd", "sd"]).default("sd"),
    desde: z.string().regex(FECHA_HIK).optional(),
    hasta: z.string().regex(FECHA_HIK).optional(),
  })
  .refine((b) => b.tipo === "vivo" || (b.desde && b.hasta), {
    message: "Falta el rango de la grabación.",
  });

/**
 * Cupo propio: cambiar HD/SD o la hora de la grabación es un pedido nuevo, y
 * Hikvision corta a 5 por segundo por cuenta. 30 por minuto por IP da para
 * jugar con los controles sin martillar su API.
 */
const pedidosDeVideo = createRateLimiter({ maxRequests: 30, windowMs: 60_000 });

export const POST = withApiHandler(
  "camaras-vivo-nube",
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const auth = await requireAdmin(req, ["admin", "owner", "almacenero"]);
    if (auth instanceof NextResponse) return auth;
    const csrf = assertCsrf(req);
    if (csrf) return csrf;
    const rl = applyRateLimit(req, pedidosDeVideo);
    if (rl) return rl;

    const { id } = await ctx.params;
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      raw = {};
    }
    const parsed = cuerpoSchema.safeParse(raw);
    if (!parsed.success)
      return NextResponse.json(
        { error: "validation_error", message: "Elige fecha y hora de la grabación." },
        { status: 400 },
      );

    if (!(await CamarasDB.list(auth.tenantId)).some((c) => c.id === id))
      return NextResponse.json(
        { error: "not_found", message: "Esa cámara no existe." },
        { status: 404 },
      );
    const enlace = await CamarasHikConnectDB.enlaceParaVideo(auth.tenantId, id);
    if (!enlace)
      return NextResponse.json(
        {
          error: "sin_enlace",
          message: "Esta cámara no está enlazada con Hik-Connect. Enlázala en la vista Cámaras.",
        },
        { status: 409 },
      );
    const cred = await CamarasHikConnectDB.credenciales(auth.tenantId);
    if (!cred.ok)
      return NextResponse.json({ error: "sin_cuenta", message: cred.motivo }, { status: 409 });

    const p = parsed.data;
    const r = await direccionDeVideo(auth.tenantId, cred.valor, {
      resourceId: enlace.resourceId,
      deviceSerial: enlace.deviceSerial,
      tipo: p.tipo,
      calidad: p.calidad,
      desde: p.desde,
      hasta: p.hasta,
      codigo: enlace.codigo,
    });
    if (!r.ok) {
      logger.info("[hik-connect] video rechazado", {
        tenantId: auth.tenantId,
        camaraId: id,
        codigo: r.error.codigo,
      });
      const status = r.error.tipo === "red" ? 502 : r.error.tipo === "limite" ? 429 : 422;
      return NextResponse.json(
        { error: "hikvision", codigo: r.error.codigo, message: r.error.mensaje },
        { status },
      );
    }
    return NextResponse.json(
      {
        url: conCodigo(r.valor.url, enlace.codigo),
        accessToken: r.valor.appToken,
        dominio: r.valor.dominioVideo,
        tipo: p.tipo,
        calidad: p.calidad,
        ...(p.tipo === "grabacion" && { desde: p.desde, hasta: p.hasta }),
        conCodigo: !!enlace.codigo,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);
