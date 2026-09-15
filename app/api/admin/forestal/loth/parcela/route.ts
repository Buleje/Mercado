import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothParcelaDB } from "@/lib/db/forest-loth-parcela.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/parcela — polígono del área de aprovechamiento del
 * Libro TH (geolocalización EUDR · Reglamento UE 2023/1115).
 *
 * GET — lee la parcela declarada del tenant.
 * PUT — reemplaza la parcela { vertices: [[lat,lng]], nota, deforestacionCero }.
 *
 * Guard: requireAdmin → rate limit → spec:forestal:loth-libro.
 */

const putSchema = z.object({
  vertices: z
    .array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]))
    .max(500)
    .default([]),
  nota: z.string().trim().max(160).default(""),
  deforestacionCero: z.boolean().default(false),
});

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-parcela-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  try {
    const parcela = await ForestLothParcelaDB.get(auth.tenantId);
    return NextResponse.json({ parcela });
  } catch (err) {
    logger.error("[loth.parcela.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-loth-parcela-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: parsed.error.issues[0]?.message, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const parcela = await ForestLothParcelaDB.set(auth.tenantId, parsed.data, auth.username ?? "unknown");
    return NextResponse.json({ parcela });
  } catch (err) {
    logger.error("[loth.parcela.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
