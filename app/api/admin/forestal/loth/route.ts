import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB, LOTH_SECTIONS } from "@/lib/db/forest-loth.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { lothErrorResponse, lothValidationResponse } from "@/lib/forestal/loth-api-errors";

/**
 * /api/admin/forestal/loth — Libro de Operaciones Títulos Habilitantes (ADR-125)
 *
 * GET  — lista entries (?section, ?caratulaId, ?search, ?includeAnnulled)
 *        ?stats=1 → resumen por sección
 * POST — crea entry (status registrado, lineNo correlativo automático)
 *
 * Guard: requireAdmin → rate limit STRICT → spec:forestal:loth-libro
 */

const sectionEnum = z.enum(LOTH_SECTIONS);

const createSchema = z.object({
  caratulaId: z.string().trim().min(1).nullable().optional(),
  planId: z.string().trim().min(1).nullable().optional(),
  section: sectionEnum,
  entryDate: z.coerce.date().optional(),

  treeCode: z.string().trim().max(60).nullable().optional(),
  trozaCode: z.string().trim().max(60).nullable().optional(),
  despachoCode: z.string().trim().max(60).nullable().optional(),
  isRama: z.boolean().optional(),

  speciesCommon: z.string().trim().max(120).nullable().optional(),
  speciesScientific: z.string().trim().max(150).nullable().optional(),
  cites: z.boolean().optional(),

  diamMayorM: z.coerce.number().positive().max(99).nullable().optional(),
  diamMenorM: z.coerce.number().positive().max(99).nullable().optional(),
  lengthM: z.coerce.number().positive().max(999).nullable().optional(),
  volumeM3: z.coerce.number().nonnegative().max(99999).nullable().optional(),

  productType: z.string().trim().max(80).nullable().optional(),
  quantity: z.coerce.number().nonnegative().max(9999999).nullable().optional(),
  unit: z.enum(["m3", "kg", "unidad"]).nullable().optional(),
  pieces: z.coerce.number().int().nonnegative().max(999999).nullable().optional(),

  gtfNumber: z.string().trim().max(60).nullable().optional(),

  discarded: z.boolean().optional(),
  consumoInterno: z.boolean().optional(),
  observations: z.string().trim().max(1000).nullable().optional(),

  correctsLineNo: z.coerce.number().int().positive().nullable().optional(),
  correctionNote: z.string().trim().max(500).nullable().optional(),

  gpsLat: z.coerce.number().min(-90).max(90).nullable().optional(),
  gpsLng: z.coerce.number().min(-180).max(180).nullable().optional(),
  photoUrl: z.string().trim().max(500).nullable().optional(),
});

async function ensureSpecOrDeny(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  if (!enabled) {
    return NextResponse.json(
      {
        error: "specialization_disabled",
        message:
          "El Libro de Operaciones de Títulos Habilitantes no está habilitado para este tenant. Solicitá al superadmin habilitarlo.",
      },
      { status: 403 },
    );
  }
  return null;
}

export const GET = withApiHandler("forestal-loth-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpecOrDeny(auth.tenantId);
  if (guard) return guard;

  const url = new URL(req.url);

  try {
    if (url.searchParams.get("stats") === "1") {
      const caratulaId = url.searchParams.get("caratulaId") ?? undefined;
      const stats = await ForestLothDB.stats(auth.tenantId, caratulaId);
      return NextResponse.json({ stats });
    }

    if (url.searchParams.get("despachables") === "1") {
      return NextResponse.json({ items: await ForestLothDB.despachablesResueltos(auth.tenantId) });
    }

    const availableFor = url.searchParams.get("available");
    if (availableFor && (LOTH_SECTIONS as readonly string[]).includes(availableFor)) {
      const items = await ForestLothDB.availableSource(
        auth.tenantId,
        availableFor as (typeof LOTH_SECTIONS)[number],
        url.searchParams.get("planId") ?? undefined,
      );
      return NextResponse.json({ items });
    }

    // Cadena de custodia de un árbol/troza por su código (drill-in desde la tabla).
    const traceCode = url.searchParams.get("trace");
    if (traceCode) {
      return NextResponse.json({ trace: await ForestLothDB.traceByCode(auth.tenantId, traceCode) });
    }

    const sectionParam = url.searchParams.get("section");
    const section =
      sectionParam && (LOTH_SECTIONS as readonly string[]).includes(sectionParam)
        ? (sectionParam as (typeof LOTH_SECTIONS)[number])
        : undefined;

    const { entries, total } = await ForestLothDB.list(auth.tenantId, {
      section,
      caratulaId: url.searchParams.get("caratulaId") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      includeAnnulled: url.searchParams.get("includeAnnulled") === "1",
      limit: Number(url.searchParams.get("limit")) || undefined,
      offset: Number(url.searchParams.get("offset")) || undefined,
    });
    return NextResponse.json({ entries, total });
  } catch (err) {
    logger.error("[loth.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-loth-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpecOrDeny(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);

  try {
    const entry = await ForestLothDB.create(auth.tenantId, {
      ...parsed.data,
      createdBy: auth.username ?? "unknown",
    });
    // ADR-126: al talar, el árbol del censo pasa a "talado" (consume saldo).
    // Fire-and-forget: no rompe el registro si el árbol no está en el censo.
    if (parsed.data.section === "tala" && parsed.data.treeCode) {
      ForestPlanDB.markTreeStatusByCode(auth.tenantId, parsed.data.treeCode, "talado").catch((err) =>
        logger.error("[loth.markTalado] failed", { error: String(err), tenantId: auth.tenantId }),
      );
    }
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    // Una invariante T1–T5 violada es dato del operador (422), no fallo del server.
    return lothErrorResponse(err, "loth.POST", auth.tenantId);
  }
});
