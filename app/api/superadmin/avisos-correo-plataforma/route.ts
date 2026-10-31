import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import {
  CorreosPlataformaPatchSchema,
  detalleCorreosPlataforma,
  guardarCorreosPlataforma,
} from "@/lib/avisos-correo-plataforma";
import { CORREO_PLATAFORMA_INFO } from "@/lib/avisos-correo-plataforma-tipos";

/**
 * GET   /api/superadmin/avisos-correo-plataforma?correo=x@y.com → { ok, ...CorreosPlataformaDetalle }
 * PATCH /api/superadmin/avisos-correo-plataforma → body CorreosPlataformaPatch (CSRF)
 *
 * Los correos que salen a la PLATAFORMA (no al dueño de una tienda) y su interruptor (23-10).
 * `correo` = «¿qué le llega a este correo?»: los tipos de la plataforma que van ahí y las
 * tiendas cuyo ownerEmail coincide. Sin `correo`, el de la plataforma. Estado en
 * PlatformSetting `avisos-correo:plataforma` (ver lib/avisos-correo-plataforma.ts).
 */
const ConsultaSchema = z.object({ correo: z.string().trim().max(200).optional() });

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = ConsultaSchema.safeParse({ correo: req.nextUrl.searchParams.get("correo") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Correo inválido" }, { status: 400 });

  try {
    return NextResponse.json({ ok: true, ...(await detalleCorreosPlataforma(parsed.data.correo)) });
  } catch (err) {
    logger.error("[superadmin/avisos-correo-plataforma] GET falló", { error: String(err).slice(0, 300) });
    return NextResponse.json({ error: "No se pudo leer los correos de la plataforma" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "MODERATE", "sa-avisos-correo-plataforma");
  if (rateLimited) return rateLimited;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;

  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = CorreosPlataformaPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const cambio = parsed.data;
    const guardado = await guardarCorreosPlataforma(cambio, auth.username);
    const detalle =
      "pausado" in cambio
        ? `Correos de la plataforma ${cambio.pausado ? "PAUSADOS" : "reanudados"}`
        : `Correo de la plataforma «${CORREO_PLATAFORMA_INFO[cambio.tipo].nombre}» ${cambio.activo ? "encendido" : "APAGADO"}`;
    await logSuperadminAction("avisos_correo_plataforma_cambio", detalle, { cambio, estado: guardado }, auth.username);
    const correo = req.nextUrl.searchParams.get("correo")?.trim() || undefined;
    return NextResponse.json({ ok: true, ...(await detalleCorreosPlataforma(correo)) });
  } catch (err) {
    logger.error("[superadmin/avisos-correo-plataforma] PATCH falló", { error: String(err).slice(0, 300) });
    return NextResponse.json({ error: "No se pudo guardar el cambio" }, { status: 500 });
  }
}
