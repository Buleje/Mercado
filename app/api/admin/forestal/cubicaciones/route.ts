import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestCubicacionesDB } from "@/lib/db/forest-cubicaciones.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

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
  especie: z.string().trim().max(60).nullish(),
});

const saveSchema = z.object({
  id: z.string().trim().max(60).optional(),
  nombre: z.string().trim().min(1).max(120),
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  cliente: z.string().trim().max(120).nullish(),
  especie: z.string().trim().max(60).nullish(),
  notas: z.string().trim().max(600).nullish(),
  precioPt: z.coerce.number().nonnegative().max(999999).optional(),
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
    const cubicacion = await ForestCubicacionesDB.save(
      auth.tenantId,
      {
        ...parsed.data,
        cliente: parsed.data.cliente ?? undefined,
        especie: parsed.data.especie ?? undefined,
        notas: parsed.data.notas ?? undefined,
        piezas: parsed.data.piezas as unknown as Record<string, unknown>[],
      },
      auth.username ?? "unknown",
    );
    return NextResponse.json({ cubicacion }, { status: parsed.data.id ? 200 : 201 });
  } catch (err) {
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
