import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { ForestAnexosDB } from "@/lib/db/forest-anexos.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/anexos — bandeja de ANEXOS N° 04 emitidos.
 *
 * GET     — lista los emitidos (más reciente primero).
 * POST    — registra una emisión (upsert por N° + GTF).
 * DELETE  — borra por `?id=`.
 *
 * Guard: requireAdmin → rate limit → especialización. El anexo se emite desde
 * dos lados (Herramientas y Libro CTP), así que basta con tener CUALQUIERA de
 * las dos habilitada. Los totales NUNCA se toman del cliente: la capa de datos
 * los recalcula desde las piezas.
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
  pieTablar: z.coerce.number().nonnegative().optional(),
  m3: z.coerce.number().nonnegative().optional(),
});

const saveSchema = z.object({
  id: z.string().trim().max(60).optional(),
  numero: z.string().trim().max(60).default(""),
  gtf: z.string().trim().max(60).default(""),
  fecha: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  empresa: z.string().trim().max(160).default(""),
  firmante: z.string().trim().max(120).default(""),
  documento: z.string().trim().max(30).default(""),
  cargo: z.string().trim().max(120).default(""),
  observaciones: z.string().trim().max(600).default(""),
  unidadV: z.enum(["pt", "m3"]).default("pt"),
  modo: z.enum(["oficial", "compacto"]).default("oficial"),
  especieGlobal: z.string().trim().max(60).nullish(),
  ctpEntryId: z.string().trim().max(60).nullish(),
  // Un anexo de varias hojas son 35 filas por bloque × 4 × N hojas; el tope
  // protege el KV sin estorbar un despacho grande de verdad.
  piezas: z.array(piezaSchema).min(1).max(1000),
});

async function ensureSpec(tenantId: string) {
  const [herramientas, libro] = await Promise.all([
    isSpecializationEnabled(tenantId, "spec:forestal:herramientas"),
    isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"),
  ]);
  return herramientas || libro
    ? null
    : NextResponse.json(
        { error: "specialization_disabled", message: "El módulo forestal no está habilitado para esta tienda." },
        { status: 403 },
      );
}

export const GET = withApiHandler("forestal-anexos-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "anexos");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    const anexos = await ForestAnexosDB.list(auth.tenantId);
    return NextResponse.json({ anexos });
  } catch (err) {
    logger.error("[anexos.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-anexos-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "anexos");
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
  const { id, fecha, especieGlobal, ctpEntryId, piezas, ...datos } = parsed.data;
  try {
    const anexo = await ForestAnexosDB.save(
      auth.tenantId,
      {
        id,
        fecha,
        datos,
        especieGlobal: especieGlobal ?? undefined,
        ctpEntryId: ctpEntryId ?? undefined,
        // Las piezas llegan ya cubicadas del cliente; los TOTALES del anexo se
        // recalculan igual en `construirEmision`, que es lo que se guarda.
        piezas: piezas.map((p, i) => ({
          id: p.id ?? `p-${i}`,
          cantidad: p.cantidad,
          espesor: p.espesor, ancho: p.ancho, largo: p.largo,
          uEspesor: p.uEspesor ?? "pulg", uAncho: p.uAncho ?? "pulg", uLargo: p.uLargo ?? "pies",
          especie: p.especie ?? undefined,
          pieTablar: p.pieTablar ?? 0,
          m3: p.m3 ?? 0,
        })),
      },
      auth.username ?? "unknown",
    );
    return NextResponse.json({ anexo }, { status: id ? 200 : 201 });
  } catch (err) {
    logger.error("[anexos.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-anexos-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = await applyRateLimit(req, "GENEROUS", "anexos");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  try {
    const ok = await ForestAnexosDB.remove(auth.tenantId, id, auth.username ?? "unknown");
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch (err) {
    logger.error("[anexos.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
