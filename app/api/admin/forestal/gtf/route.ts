import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestGtfDB, GtfDuplicateError } from "@/lib/db/forest-gtf.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/gtf — Guía de Transporte Forestal (ADR-126 Fase 4)
 * GET (lista · ?id detalle) · POST (emite) · PATCH { id, action:"annul", reason }
 */

const itemSchema = z.object({
  code: z.string().trim().max(60).nullable().optional(),
  species: z.string().trim().max(120).nullable().optional(),
  scientific: z.string().trim().max(150).nullable().optional(),
  cites: z.boolean().optional(),
  diamMayorM: z.coerce.number().nonnegative().nullable().optional(),
  diamMenorM: z.coerce.number().nonnegative().nullable().optional(),
  lengthM: z.coerce.number().nonnegative().nullable().optional(),
  volumeM3: z.coerce.number().nonnegative().nullable().optional(),
  productType: z.string().trim().max(80).nullable().optional(),
  pieces: z.coerce.number().int().nonnegative().nullable().optional(),
  quantity: z.coerce.number().nonnegative().nullable().optional(),
  unit: z.string().trim().max(10).nullable().optional(),
});
const createSchema = z.object({
  planId: z.string().trim().min(1).nullable().optional(),
  gtfNumber: z.string().trim().min(1).max(60),
  gtfDate: z.coerce.date().nullable().optional(),
  tipo: z.enum(["trozas", "producto"]).optional(),
  titularName: z.string().trim().max(200).nullable().optional(),
  tituloHabilitante: z.string().trim().max(120).nullable().optional(),
  parcelaCorta: z.string().trim().max(120).nullable().optional(),
  transportista: z.string().trim().max(200).nullable().optional(),
  transportistaDoc: z.string().trim().max(20).nullable().optional(),
  conductor: z.string().trim().max(200).nullable().optional(),
  conductorLicencia: z.string().trim().max(40).nullable().optional(),
  placaVehiculo: z.string().trim().max(20).nullable().optional(),
  origen: z.string().trim().max(200).nullable().optional(),
  destino: z.string().trim().max(200).nullable().optional(),
  items: z.array(itemSchema).min(1).max(500),
  observations: z.string().trim().max(1000).nullable().optional(),
});
const patchSchema = z.object({ id: z.string().trim().min(1), action: z.literal("annul"), reason: z.string().trim().min(3).max(500) });

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}
/** Lectura: LOTH (emisor) o CTP (recibe con la guía) pueden consultar guías. */
async function ensureReadSpec(tenantId: string) {
  const loth = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  const ctp = await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro");
  return loth || ctp ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-gtf-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureReadSpec(auth.tenantId);
  if (guard) return guard;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const gtfNumber = url.searchParams.get("gtfNumber");
  try {
    if (gtfNumber) {
      // Importar al ingreso CTP: buscar la guía emitida por su número.
      const gtf = await ForestGtfDB.findByNumber(auth.tenantId, gtfNumber);
      if (!gtf) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ gtf });
    }
    if (id) {
      const gtf = await ForestGtfDB.getById(auth.tenantId, id);
      if (!gtf) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ gtf });
    }
    // Bandeja monte→planta: guías de trozas emitidas sin ingreso vigente en el CTP.
    if (url.searchParams.get("sinIngresar") === "1") {
      return NextResponse.json({ gtfs: await ForestGtfDB.sinIngresarAlCtp(auth.tenantId) });
    }
    // Sugerencia de correlativo para una serie (el operador la acepta o la pisa).
    const serie = url.searchParams.get("sugerir");
    if (serie) {
      return NextResponse.json({ sugerido: await ForestGtfDB.sugerirNumero(auth.tenantId, serie) });
    }
    return NextResponse.json({ gtfs: await ForestGtfDB.list(auth.tenantId) });
  } catch (err) {
    logger.error("[gtf.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-gtf-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  try {
    const gtf = await ForestGtfDB.create(auth.tenantId, { ...parsed.data, createdBy: auth.username ?? "unknown" });
    return NextResponse.json({ gtf }, { status: 201 });
  } catch (err) {
    // GTF duplicada = dato del operador (una guía no se anota dos veces), no 500.
    if (err instanceof GtfDuplicateError) {
      return NextResponse.json({ error: "duplicate", message: err.message }, { status: 409 });
    }
    logger.error("[gtf.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-gtf-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json({ gtf: await ForestGtfDB.annul(auth.tenantId, parsed.data.id, parsed.data.reason, auth.username ?? "unknown") });
  } catch (err) {
    logger.error("[gtf.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
