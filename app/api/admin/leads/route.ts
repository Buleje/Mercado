/**
 * app/api/admin/leads/route.ts
 *
 * GET — Lista paginada de leads (entity=lead en ActivityLog).
 *
 * Query params:
 *  - limit  (default 50, max 200)
 *  - offset (default 0)
 *  - source (filter: wa-outbound | fb-ads | direct | …)
 *  - businessType (filter: bodega | pizzeria | …)
 *
 * PATCH — Actualiza el status de un lead (workflow new → contacted → demo_done → signed_up).
 *  body: { entityId: string, status: "contacted" | "demo_done" | "signed_up" | "won" | "lost" }
 *
 * SECURITY:
 *  - assertCsrf en PATCH
 *  - requireAdmin
 *  - rate-limit MODERATE
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { LeadsDB } from "@/lib/db/leads.db";
import { logger } from "@/lib/logger";

// Brandon 2026-05-16: removido `force-dynamic` (incompatible con
// cacheComponents Next 16, ADR-019). requireAdmin lee cookies →
// Next infiere dynamic automáticamente.

const UpdateSchema = z.object({
  entityId: z.string().min(1).max(120),
  status: z.enum(["new", "contacted", "demo_done", "signed_up", "won", "lost"]),
});

export async function GET(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "leads-list");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId requerido" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
    const source = url.searchParams.get("source") ?? undefined;
    const businessType = url.searchParams.get("businessType") ?? undefined;

    const leads = await LeadsDB.list(tenantId, { limit, offset, source, businessType });

    return NextResponse.json({
      tenantId,
      leads,
      count: leads.length,
      offset,
      limit,
    });
  } catch (err) {
    logger.error("[leads/list] failed", { err: String(err) });
    return NextResponse.json(
      { error: "leads_list_failed", details: String(err).slice(0, 200) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const csrfErr = assertCsrf(req);
  if (csrfErr) return csrfErr;

  const _rl = await applyRateLimit(req, "MODERATE", "leads-update");
  if (_rl) return _rl;

  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId requerido" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => null);
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Datos inválidos",
          issues: parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const ok = await LeadsDB.updateStatus(
      tenantId,
      parsed.data.entityId,
      parsed.data.status,
      auth.username,
    );

    if (!ok) {
      return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, entityId: parsed.data.entityId, status: parsed.data.status });
  } catch (err) {
    logger.error("[leads/update] failed", { err: String(err) });
    return NextResponse.json(
      { error: "leads_update_failed", details: String(err).slice(0, 200) },
      { status: 500 },
    );
  }
}
