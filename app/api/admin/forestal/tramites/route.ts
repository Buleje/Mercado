import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestTramitesDB } from "@/lib/db/forest-tramites.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/tramites — expediente de los trámites del CTP (ADR-308).
 *
 * GET     — lista los trámites del tenant (el último tocado primero).
 * POST    — guarda uno nuevo o actualiza por `id`.
 * DELETE  — borra por `?id=`.
 *
 * Guard: requireAdmin → CSRF → rate limit → `spec:forestal:tramites` (la MISMA
 * spec que gatea el tab: si el endpoint exigiera otra, el módulo se vería y
 * respondería 403).
 *
 * El estado y las fechas NO se toman a ciegas del cliente: `construirTramite`
 * normaliza (un "presentado" sin fecha recibe la de hoy; un estado desconocido
 * cae a borrador, nunca a presentado).
 */

const autoridadEnum = z.enum(["arffs", "serfor", "osinfor", "otra"]);
const estadoEnum = z.enum(["borrador", "presentado", "observado", "resuelto", "desistido"]);
const fechaSolo = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

const saveSchema = z.object({
  id: z.string().trim().max(80).optional(),
  formatoId: z.string().trim().min(1).max(60),
  formatoNombre: z.string().trim().max(120).optional(),
  autoridad: autoridadEnum,
  asunto: z.string().trim().max(300).optional(),
  // Los valores del formulario: claves cortas, textos acotados. El tope real lo
  // vuelve a aplicar `construirTramite` (el KV es un JSON compartido). 20 000 —
  // no 4 000 — porque `guiasJson` (ADR-364, relación de guías + trozas) es un
  // array serializado: el mismo tope que `tramites-registro.ts`, o esta validación
  // rechaza en silencio lo que el otro lado sí aceptaría.
  datos: z.record(z.string().trim().max(60), z.string().max(20_000)).optional(),
  estado: estadoEnum.optional(),
  expedienteAutoridad: z.string().trim().max(80).nullish(),
  fechaPresentacion: fechaSolo.nullish(),
  fechaRespuesta: fechaSolo.nullish(),
  notas: z.string().trim().max(2000).nullish(),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:tramites");
  return ok
    ? null
    : NextResponse.json(
        {
          error: "specialization_disabled",
          message: "El módulo Trámites y Oficios no está habilitado para esta tienda.",
        },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-tramites-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  try {
    const tramites = await ForestTramitesDB.list(auth.tenantId);
    return NextResponse.json({ tramites });
  } catch (err) {
    logger.error("[tramites.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-tramites-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "validation_error",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const tramite = await ForestTramitesDB.save(
      auth.tenantId,
      {
        ...parsed.data,
        expedienteAutoridad: parsed.data.expedienteAutoridad ?? undefined,
        fechaPresentacion: parsed.data.fechaPresentacion ?? undefined,
        fechaRespuesta: parsed.data.fechaRespuesta ?? undefined,
        notas: parsed.data.notas ?? undefined,
      },
      auth.username ?? "unknown",
    );
    return NextResponse.json({ tramite }, { status: parsed.data.id ? 200 : 201 });
  } catch (err) {
    logger.error("[tramites.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-tramites-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const ok = await ForestTramitesDB.remove(auth.tenantId, id, auth.username ?? "unknown");
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[tramites.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
