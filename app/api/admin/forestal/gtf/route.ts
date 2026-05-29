import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestGtfDB } from "@/lib/db/forest-gtf.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";

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

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  try {
    if (id) {
      const gtf = await ForestGtfDB.getById(auth.tenantId, id);
      if (!gtf) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ gtf });
    }
    return NextResponse.json({ gtfs: await ForestGtfDB.list(auth.tenantId) });
  } catch (err) {
    logger.error("[gtf.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
    logger.error("[gtf.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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
    return NextResponse.json({ gtf: await ForestGtfDB.annul(auth.tenantId, parsed.data.id, parsed.data.reason) });
  } catch (err) {
    logger.error("[gtf.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
