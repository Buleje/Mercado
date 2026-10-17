import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { logger } from "@/lib/logger";
import { PlantasForestalesDB } from "@/lib/db/plantas-forestales.db";
import { jsonConTope } from "@/lib/cuerpo-con-tope";
import {
  editarInspeccionSchema,
  MAX_BYTES_PATCH_INSPECCION,
  tenantIdSchema,
} from "@/lib/superadmin/plantas-forestales/schemas";
import {
  editarInspeccion,
  errorDeInspeccion,
  obtenerParaPantalla,
  type AccionDeEdicion,
} from "@/lib/superadmin/plantas-forestales/inspeccion.server";

/**
 * UNA inspección de planta (ADR-498).
 *
 *  · GET → la inspección plana: resumen + `libro` congelado + `hallazgos`,
 *    `aserrada`, `conteoPatio` (el conteo guardado, para retomarlo e imprimir),
 *    `planta: { nombre, slug }`.
 *  · PATCH → sólo los campos que cambian (la pantalla autoguarda): `hallazgos`,
 *    `aserrada`, `conteoPatio`, `conclusion`, `responsablePlanta`; `cerrar: true`
 *    (puede venir con los últimos cambios) o `anular: "<motivo>"` (va solo).
 *    Cerrada o anulada = 409 `{ error, estado }`. Los totales de trozas los
 *    arma el servidor con el conteo clavado al libro congelado. Cada acción
 *    queda en la auditoría (`inspeccion.editar|cerrar|anular`). Responde la
 *    inspección LIVIANA (sin `libro` ni `conteoPatio`: la pantalla ya los
 *    tiene). Cuerpo de más de 2 MB → 413 sin leer el resto (security 17-10).
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;
const NO_ENCONTRADA = { error: "Inspección no encontrada" } as const;
const ID_INSPECCION = /^[A-Za-z0-9_-]{1,40}$/;

type Params = { params: Promise<{ tenantId: string; id: string }> };

async function plantaEId(ctx: Params) {
  const p = await ctx.params;
  const tid = tenantIdSchema.safeParse(p.tenantId);
  if (!tid.success || !ID_INSPECCION.test(p.id)) return null;
  const planta = await PlantasForestalesDB.obtener(tid.data);
  return planta ? { planta, id: p.id } : null;
}

export async function GET(req: NextRequest, ctx: Params) {
  const limitado = applyRateLimit(req, "GENEROUS", "superadmin:plantas:inspecciones:ver");
  if (limitado) return limitado;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const r = await plantaEId(ctx);
    if (!r) return NextResponse.json(NO_ENCONTRADA, { status: 404 });
    const inspeccion = await obtenerParaPantalla(r.planta, r.id);
    if (!inspeccion) return NextResponse.json(NO_ENCONTRADA, { status: 404 });
    return NextResponse.json(inspeccion, { headers: NO_STORE });
  } catch (err) {
    logger.error("[superadmin/plantas/:id/inspecciones/:id] GET", { error: String(err) });
    return NextResponse.json({ error: "No se pudo leer la inspección" }, { status: 500 });
  }
}

const QUE_HIZO: Record<AccionDeEdicion, string> = {
  editar: "Editó",
  cerrar: "Cerró",
  anular: "Anuló",
};

export async function PATCH(req: NextRequest, ctx: Params) {
  /* GENEROUS y su propio balde: la pantalla autoguarda cada ~1,2 s mientras se cuenta. */
  const limitado = applyRateLimit(req, "GENEROUS", "superadmin:plantas:inspecciones:editar");
  if (limitado) return limitado;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;

  const leido = await jsonConTope(req, MAX_BYTES_PATCH_INSPECCION);
  if (leido.grande) {
    return NextResponse.json({ error: "Lo que mandaste pesa más de 2 MB: guarda por partes." }, { status: 413 });
  }
  const body = editarInspeccionSchema.safeParse(leido.valor);
  if (!body.success) {
    /* El único mensaje propio es el de la foto; el resto, genérico (no se filtra el schema). */
    const propio = body.error.issues.find((i) => i.code === "custom")?.message;
    return NextResponse.json({ error: propio ?? "Datos inválidos" }, { status: 400 });
  }

  try {
    const r = await plantaEId(ctx);
    if (!r) return NextResponse.json(NO_ENCONTRADA, { status: 404 });
    const hecho = await editarInspeccion(r.planta, r.id, body.data, auth.username);
    if (!hecho) return NextResponse.json(NO_ENCONTRADA, { status: 404 });
    const { inspeccion, acciones } = hecho;
    for (const accion of acciones) {
      logSuperadminAction(
        `inspeccion.${accion}`,
        `${QUE_HIZO[accion]} la inspección del ${inspeccion.fecha} de la planta ${r.planta.nombre}`,
        {
          tenantId: r.planta.tenantId,
          inspeccionId: inspeccion.id,
          ...(accion === "editar" ? { campos: Object.keys(body.data).filter((k) => k !== "cerrar") } : {}),
          ...(accion === "anular" ? { motivo: body.data.anular } : {}),
        },
        auth.username,
      ).catch((err) => logger.error(`[superadmin/plantas] auditoría inspeccion.${accion} falló`, { error: String(err) }));
    }
    return NextResponse.json(inspeccion, { headers: NO_STORE });
  } catch (err) {
    const e = errorDeInspeccion(err);
    if (e) return NextResponse.json(e.cuerpo, { status: e.status });
    logger.error("[superadmin/plantas/:id/inspecciones/:id] PATCH", { error: String(err) });
    return NextResponse.json({ error: "No se pudo guardar la inspección" }, { status: 500 });
  }
}
