import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import {
  CubicacionDesactualizadaError,
  CubicacionVinculoError,
  ForestCubicacionesDB,
} from "@/lib/db/forest-cubicaciones.db";
import { corridasDeCubicacion } from "@/lib/forestal/cubicacion-registro";
import { ForestCtpDespachoDB } from "@/lib/db/forest-ctp-despacho.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { ORDEN_TIPO, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import { OBSERVACION_MAX } from "@/lib/forestal/observacion-de-pieza";
import { ANCHO_CAMION_M_MAX, ANCHO_CAMION_M_MIN } from "@/lib/forestal/camion-croquis";
import { esVariado } from "@/lib/forestal/variado-desglose";

/**
 * /api/admin/forestal/cubicaciones — historial de cubicaciones del aserradero.
 *
 * GET     — lista las guardadas (más reciente primero).
 * POST    — guarda una nueva o actualiza por `id`.
 * DELETE  — borra por `?id=`.
 *
 * Guard: requireAdmin → rate limit → spec:forestal:herramientas. Los totales
 * NUNCA se toman del cliente: la capa de datos los recalcula desde las piezas.
 */

const piezaSchema = z.object({
  id: z.string().trim().max(60).optional(),
  cantidad: z.coerce.number().positive().max(99999),
  espesor: z.coerce.number().positive().max(999),
  ancho: z.coerce.number().positive().max(999),
  largo: z.coerce.number().positive().max(999),
  uEspesor: z.enum(["pulg", "cm", "pies", "m"]).optional(),
  uAncho: z.enum(["pulg", "cm", "pies", "m"]).optional(),
  uLargo: z.enum(["pulg", "cm", "pies", "m"]).optional(),
  especie: z.string().trim().max(60).nullish().refine((v) => !esVariado(v), { message: "«Variado» no es una especie que se declare: ábrelo antes (Resúmenes › Rolliza › Aplicar el desglose al lote)." }),
  /** De quién es la madera (aserrío por encargo). Texto libre, sin ficha del Directorio. */
  dueno: z.string().trim().max(120).nullish(),
  /** La ficha del Directorio de ese dueño (ADR-430): con ella se precia por su trato. */
  duenoParteId: z.string().trim().max(60).nullish(),
  /** Tipo comercial forzado a mano; `null`/ausente = lo decide la medida. */
  tipo: z.enum(ORDEN_TIPO as [TipoComercial, ...TipoComercial[]]).nullish(),
  /** Nota de patio de esta pieza (candado o suelta, ver observacion-de-pieza.ts). */
  observacion: z.string().trim().max(OBSERVACION_MAX).nullish(),
});

const saveSchema = z.object({
  id: z.string().trim().max(60).optional(),
  nombre: z.string().trim().min(1).max(120),
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cliente: z.string().trim().max(120).nullish(),
  especie: z.string().trim().max(60).nullish().refine((v) => !esVariado(v), { message: "«Variado» no es una especie que se declare: ábrelo antes (Resúmenes › Rolliza › Aplicar el desglose al lote)." }),
  notas: z.string().trim().max(600).nullish(),
  precioPt: z.coerce.number().nonnegative().max(999999).optional(),
  /** Línea de producción del Libro creada desde esta cubicación (el hilo que
   *  después permite emitir el ANEXO N° 04 de un despacho con sus medidas). */
  ctpEntryId: z.string().trim().max(60).nullish(),
  /** Las corridas que la cubicación ampara cuando se midió un conjunto
   *  (ADR-369): un camión se cubica entero contra los N paquetes que salen. */
  ctpEntryIds: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  gtfNumber: z.string().trim().max(60).nullish(),
  /** Parte trasera del camión (ids de piezas + ancho del croquis). Los ids que no
   *  están entre `piezas` se descartan al guardar, no dan 400. */
  trasera: z.object({
    ids: z.array(z.string().trim().min(1).max(60)).max(1000),
    anchoM: z.coerce.number().min(ANCHO_CAMION_M_MIN).max(ANCHO_CAMION_M_MAX),
  }).optional(),
  /** `updatedAt` de la versión que se leyó (ADR-445): si la guardada es otra,
   *  409 en vez de reescribir piezas viejas. Opcional: sin él, como siempre. */
  updatedAt: z.string().trim().max(40).optional(),
  // Una cubicación de patio no pasa de unos cientos de filas; el tope protege
  // el KV (es un JSON) sin estorbar el uso real.
  piezas: z.array(piezaSchema).min(1).max(1000),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:herramientas");
  return ok
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "Las Herramientas Forestales no están habilitadas para esta tienda." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-cubicaciones-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "cubicaciones");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    const cubicaciones = await ForestCubicacionesDB.list(auth.tenantId);
    // ?despachoId= — cuáles de estas cubicaciones originaron ese despacho. El
    // Libro guarda especie/volumen pero NO las medidas pieza por pieza; el hilo
    // es despacho → corridas de producción → cubicación que las creó.
    const despachoId = new URL(req.url).searchParams.get("despachoId");
    if (despachoId) {
      const origenes = await ForestCtpDespachoDB.listByDespacho(auth.tenantId, despachoId);
      const producciones = new Set(origenes.map((o) => o.produccionEntryId));
      /* TODAS las corridas que ampara (ADR-445): con sólo `ctpEntryId` —la
         primera— un camión cubicado entero no aparecía si el despacho salía
         de la segunda corrida. */
      const sugeridas = cubicaciones
        .filter((c) => corridasDeCubicacion(c).some((id) => producciones.has(id)))
        .map((c) => c.id);
      return NextResponse.json({ cubicaciones, sugeridas });
    }
    return NextResponse.json({ cubicaciones });
  } catch (err) {
    logger.error("[cubicaciones.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-cubicaciones-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "cubicaciones");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  try {
    const { updatedAt: updatedAtLeido, ...datos } = parsed.data;
    const cubicacion = await ForestCubicacionesDB.save(
      auth.tenantId,
      {
        ...datos,
        cliente: parsed.data.cliente ?? undefined,
        especie: parsed.data.especie ?? undefined,
        notas: parsed.data.notas ?? undefined,
        ctpEntryId: parsed.data.ctpEntryId ?? undefined,
        gtfNumber: parsed.data.gtfNumber ?? undefined,
        piezas: parsed.data.piezas as unknown as Record<string, unknown>[],
      },
      auth.username ?? "unknown",
      { updatedAtLeido },
    );
    return NextResponse.json({ cubicacion }, { status: parsed.data.id ? 200 : 201 });
  } catch (err) {
    /* Una corrida que no existe, es de otro negocio, está anulada o no es de
       producción no se liga (ADR-445): 422 con el motivo, no un 500. */
    if (err instanceof CubicacionDesactualizadaError) {
      return NextResponse.json({ error: "cubicacion_desactualizada", message: err.message, updatedAt: err.actual }, { status: 409 });
    }
    if (err instanceof CubicacionVinculoError) {
      return NextResponse.json({ error: "vinculo_invalido", message: err.message, ids: err.ids }, { status: 422 });
    }
    logger.error("[cubicaciones.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-cubicaciones-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "cubicaciones");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const ok = await ForestCubicacionesDB.remove(auth.tenantId, id, auth.username ?? "unknown");
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (err) {
    logger.error("[cubicaciones.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
