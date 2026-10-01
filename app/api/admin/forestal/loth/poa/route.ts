import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothPoaDB } from "@/lib/db/forest-loth-poa.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/poa — parámetros del Plan Operativo de un plan de
 * manejo: DMC por especie (override del oficial) y % de semilleros.
 *
 * GET  ?planId=X — lee la config (defaults si nunca se guardó).
 * PUT  { planId, dmcOverrides, semillerosPct } — la reemplaza.
 *
 * Guard: requireAdmin → rate limit → spec:forestal:loth-libro.
 */

const putSchema = z.object({
  planId: z.string().trim().min(1),
  dmcOverrides: z.record(z.string().trim().max(120), z.number()).default({}),
  semillerosPct: z.number().min(0).max(100).default(10),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-poa-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const planId = new URL(req.url).searchParams.get("planId") ?? "";
  try {
    return NextResponse.json({ config: await ForestLothPoaDB.get(auth.tenantId, planId) });
  } catch (err) {
    logger.error("[loth.poa.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-loth-poa-put", async (req: NextRequest) => {
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
    const { planId, ...config } = parsed.data;
    return NextResponse.json({ config: await ForestLothPoaDB.set(auth.tenantId, planId, config, auth.username ?? "unknown") });
  } catch (err) {
    logger.error("[loth.poa.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
