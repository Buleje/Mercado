import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { WoodEntriesDB } from "@/lib/db/wood-entries.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { ctpErrorResponse } from "@/lib/forestal/ctp-api-errors";
import { withApiHandler } from "@/lib/api-handler";

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
 *   3. rate limit GENEROUS bucket 'ctp' — igual que el endpoint hermano
 *      /api/admin/forestal/ctp (ADR-127).
 *
 * 2026-07-15 — Estaba en STRICT (=10 req/15min, no 60/min como decía este
 * comentario) y SIN bucket propio, así que compartía cupo con cualquier otro
 * endpoint STRICT del admin: listar + filtrar + buscar tiraba 429 a las ~10
 * interacciones y el tab parecía roto. La defensa real acá es requireAdmin +
 * el guard de especialización; el rate limit es secundario.
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

export const GET = withApiHandler("forestal-wood-entries-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
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

  // Fechas inválidas → sin límite (no reventar el listado por un query param).
  const parseDate = (raw: string | null) => {
    if (!raw) return undefined;
    const parsed = z.coerce.date().safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  };

  const filters = {
    status: statusParsed?.success ? statusParsed.data : undefined,
    speciesCommonName: speciesCommonName ?? undefined,
    gtfNumber: gtfNumber ?? undefined,
    fromDate: parseDate(fromDate),
    toDate: parseDate(toDate),
    search: search ?? undefined,
    limit,
    offset,
  };

  try {
    // ?stats=1 → adjunta los agregados del período (calculados en DB) a la misma
    // respuesta. Van juntos, no en dos requests: así KPIs y tabla describen
    // exactamente el mismo instante (y es la mitad de tráfico por interacción).
    if (url.searchParams.get("stats") === "1") {
      const [result, stats] = await Promise.all([
        WoodEntriesDB.list(auth.tenantId, filters),
        WoodEntriesDB.stats(auth.tenantId, filters),
      ]);
      return NextResponse.json({ ...result, stats });
    }
    const result = await WoodEntriesDB.list(auth.tenantId, filters);
    return NextResponse.json(result);
  } catch (err) {
    logger.error("[wood-entries.GET] failed", { error: String(err) });
    // Dev-mode: expone mensaje + stack truncado para debug rápido.
    // Production: solo error_code genérico (no leak).
    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      isDev
        ? {
            error: "internal_error",
            message: String(err),
            stack: err instanceof Error
              ? err.stack?.split("\n").slice(0, 5).join("\n")
              : undefined,
          }
        : { error: "internal_error" },
      { status: 500 },
    );
  }
});

// ─── POST — create ───────────────────────────────────────────────────────

export const POST = withApiHandler("forestal-wood-entries-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "ctp");
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
    // Los invariantes del libro (período cerrado, GTF duplicada) llegan como
    // CtpInvariantError: con un 500 el operario veía "error interno" al cargar
    // un ingreso con fecha de un mes ya cerrado.
    return ctpErrorResponse(err, "wood-entries.POST", auth.tenantId);
  }
});
