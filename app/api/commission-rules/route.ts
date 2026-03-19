export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";

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

  const rules = await prisma.commissionRule.findMany({
    where: { tenantId: auth.tenantId },
    orderBy: [{ cashierId: "asc" }, { minSales: "asc" }],
  });

  return NextResponse.json(rules);
}

// ─── POST /api/commission-rules ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rule = await prisma.commissionRule.create({
    data: { ...parsed.data, tenantId: auth.tenantId },
  });

  const requestId = req.headers.get("x-request-id") ?? undefined;
  logActivity("commission_rule_created", "commission", rule.id, `Regla de comisión creada para ${parsed.data.cashierId}`, auth.username, requestId).catch(() => {});

  return NextResponse.json(rule, { status: 201 });
}

// ─── PATCH /api/commission-rules?id=xxx ──────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

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

  const requestId = req.headers.get("x-request-id") ?? undefined;
  logActivity("commission_rule_updated", "commission", id, `Regla de comisión actualizada para ${existing.cashierId}`, auth.username, requestId).catch(() => {});

  return NextResponse.json(updated);
}

// ─── DELETE /api/commission-rules?id=xxx ─────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.commissionRule.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.commissionRule.delete({ where: { id } });

  const requestId = req.headers.get("x-request-id") ?? undefined;
  logActivity("commission_rule_deleted", "commission", id, `Regla de comisión eliminada para ${existing.cashierId}`, auth.username, requestId).catch(() => {});

  return NextResponse.json({ ok: true });
}
