import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";

/**
 * /api/admin/forestal/wood-entries
 *
 * GET  — lista ingresos de madera (LOE-CTP, ADR-124)
 * POST — crea nuevo ingreso (status pendiente)
 *
 * Guard:
 *   1. requireAdmin (cookie sesión)
 *   2. isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro")
 *      Si no está habilitado por superadmin → 403.
 *   3. rate limit STRICT (60 req/min/IP)
 */

// ─── Zod schemas ──────────────────────────────────────────────────────────

const documentTypeEnum = z.enum(["RUC", "DNI", "CE", "PASAPORTE"]);
const originTypeEnum = z.enum([
  "concesion",
  "predio_privado",
  "comunidad_nativa",
  "reforestacion",
  "retroaserradero",
  "otro",
]);
const productTypeEnum = z.enum([
  "rolliza",
  "aserrada",
  "tablones",
  "listones",
  "durmientes",
  "pulgada",
  "carbon",
  "lena",
  "otro",
]);
const statusEnum = z.enum([
  "pendiente",
  "validado",
  "rechazado",
  "procesado",
  "anulado",
]);

const createSchema = z.object({
  entryDate: z.coerce.date().optional(),
  gtfNumber: z.string().trim().min(1).max(50),
  gtfDate: z.coerce.date().nullable().optional(),
  gtfSeries: z.string().trim().max(20).nullable().optional(),

  providerName: z.string().trim().min(1).max(200),
  providerDocument: z.string().trim().max(20).nullable().optional(),
  providerDocumentType: documentTypeEnum.nullable().optional(),

  originType: originTypeEnum.optional(),
  originCode: z.string().trim().max(100).nullable().optional(),
  originRegion: z.string().trim().max(80).nullable().optional(),
  originDistrict: z.string().trim().max(80).nullable().optional(),

  speciesCommonName: z.string().trim().min(1).max(120),
  speciesScientificName: z.string().trim().max(150).nullable().optional(),
  speciesCites: z.boolean().optional(),

  productType: productTypeEnum.optional(),
  volumeM3: z.coerce.number().positive().max(99999),
  pieces: z.coerce.number().int().nonnegative().optional(),
  avgLengthM: z.coerce.number().positive().nullable().optional(),
  avgDiameterCm: z.coerce.number().positive().nullable().optional(),
  humidityPct: z.coerce.number().min(0).max(100).nullable().optional(),
  defectsNotes: z.string().trim().max(500).nullable().optional(),

  notes: z.string().trim().max(1000).nullable().optional(),
  photos: z.array(z.string().url()).max(10).nullable().optional(),
});

// ─── Guard ────────────────────────────────────────────────────────────────

async function ensureSpecializationOrDeny(tenantId: string) {
  const enabled = await isSpecializationEnabled(
    tenantId,
    "spec:forestal:ctp-libro",
  );
  if (!enabled) {
    return NextResponse.json(
      {
        error: "specialization_disabled",
        message:
          "El módulo Libro de Operaciones CTP no está habilitado para este tenant. Solicitá al superadmin habilitarlo.",
      },
      { status: 403 },
    );
  }
  return null;
}

// ─── GET — list ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "STRICT");
  if (rl) return rl;

  const guard = await ensureSpecializationOrDeny(auth.tenantId);
  if (guard) return guard;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  const speciesCommonName = url.searchParams.get("species");
  const gtfNumber = url.searchParams.get("gtf");
  const fromDate = url.searchParams.get("from");
  const toDate = url.searchParams.get("to");
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const offset = Number(url.searchParams.get("offset") ?? "0");

  // Validate status if provided
  const statusParsed = status ? statusEnum.safeParse(status) : null;
  if (statusParsed && !statusParsed.success) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  try {
    const result = await WoodEntriesDB.list(auth.tenantId, {
      status: statusParsed?.success ? statusParsed.data : undefined,
      speciesCommonName: speciesCommonName ?? undefined,
      gtfNumber: gtfNumber ?? undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      search: search ?? undefined,
      limit,
      offset,
    });
    return NextResponse.json(result);
  } catch (err) {
    logger.error("[wood-entries.GET] failed", { error: String(err) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST — create ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "STRICT");
  if (rl) return rl;

  const guard = await ensureSpecializationOrDeny(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const entry = await WoodEntriesDB.create(auth.tenantId, {
      ...parsed.data,
      createdBy: auth.username ?? "unknown",
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (err) {
    logger.error("[wood-entries.POST] failed", {
      error: String(err),
      tenantId: auth.tenantId,
    });
    return NextResponse.json(
      { error: "internal_error", message: String(err) },
      { status: 500 },
    );
  }
}
