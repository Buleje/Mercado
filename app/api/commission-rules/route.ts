import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CommissionRulesDB } from "@/lib/db/commission-rules.db";
import { requireAdmin } from "@/lib/require-admin";
import { enqueueActivityLog } from "@/lib/queue";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

// ─── Validation ───────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  cashierId: z.string().min(1).max(100),
  label: z.string().max(200).default(""),
  minSales: z.number().min(0).default(0),
  maxSales: z.number().min(0).nullable().default(null),
  rate: z.number().min(0).max(100),
});

const UpdateSchema = z.object({
  label: z.string().max(200).optional(),
  minSales: z.number().min(0).optional(),
  maxSales: z.number().min(0).nullable().optional(),
  rate: z.number().min(0).max(100).optional(),
});

// ─── GET /api/commission-rules ────────────────────────────────────────────────
// Returns all rules grouped by cashierId

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const rules = await CommissionRulesDB.list(auth.tenantId);
    return NextResponse.json(rules);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

// ─── POST /api/commission-rules ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "commission-rules"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const rule = await CommissionRulesDB.create(auth.tenantId, parsed.data);

    enqueueActivityLog({ action: "commission_rule_created", resource: "commission", resourceId: rule.id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Regla de comisión creada para ${parsed.data.cashierId}` }, timestamp: new Date().toISOString() }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

// ─── PATCH /api/commission-rules?id=xxx ──────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "commission-rules"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const result = await CommissionRulesDB.updateForTenant(auth.tenantId, id, parsed.data);
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const { previous: existing, updated } = result;

    enqueueActivityLog({ action: "commission_rule_updated", resource: "commission", resourceId: id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Regla de comisión actualizada para ${existing.cashierId}` }, timestamp: new Date().toISOString() }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json(updated);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

// ─── DELETE /api/commission-rules?id=xxx ─────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const csrfFail = assertCsrf(req); if (csrfFail) return csrfFail;
  const _rl = await applyRateLimit(req, "MODERATE", "commission-rules"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await CommissionRulesDB.deleteForTenant(auth.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    enqueueActivityLog({ action: "commission_rule_deleted", resource: "commission", resourceId: id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Regla de comisión eliminada para ${existing.cashierId}` }, timestamp: new Date().toISOString() }).catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
