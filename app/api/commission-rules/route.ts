import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { enqueueActivityLog } from "@/lib/queue";
import { toErrorPayload } from "@/lib/api-error";
import { applyRateLimit } from "@/lib/rate-limit";

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
    const rules = await prisma.commissionRule.findMany({
      where: { tenantId: auth.tenantId },
      orderBy: [{ cashierId: "asc" }, { minSales: "asc" }],
    });

    return NextResponse.json(rules);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

// ─── POST /api/commission-rules ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "commission-rules"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const rule = await prisma.commissionRule.create({
      data: { ...parsed.data, tenantId: auth.tenantId },
    });

    enqueueActivityLog({ action: "commission_rule_created", resource: "commission", resourceId: rule.id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Regla de comisión creada para ${parsed.data.cashierId}` }, timestamp: new Date().toISOString() }).catch(() => {});

    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

// ─── PATCH /api/commission-rules?id=xxx ──────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "commission-rules"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.commissionRule.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const updated = await prisma.commissionRule.update({ where: { id }, data: parsed.data });

    enqueueActivityLog({ action: "commission_rule_updated", resource: "commission", resourceId: id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Regla de comisión actualizada para ${existing.cashierId}` }, timestamp: new Date().toISOString() }).catch(() => {});

    return NextResponse.json(updated);
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}

// ─── DELETE /api/commission-rules?id=xxx ─────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "commission-rules"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.commissionRule.findFirst({ where: { id, tenantId: auth.tenantId } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await prisma.commissionRule.delete({ where: { id } });

    enqueueActivityLog({ action: "commission_rule_deleted", resource: "commission", resourceId: id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Regla de comisión eliminada para ${existing.cashierId}` }, timestamp: new Date().toISOString() }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    return NextResponse.json(payload, { status });
  }
}
