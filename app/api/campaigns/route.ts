export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";

// ─── Validation schemas ───────────────────────────────────────────────────────

const SEGMENTS = ["todos", "vip", "inactivos", "cumpleanos", "deudores"] as const;
const CHANNELS = ["whatsapp", "inapp", "ambos"] as const;
const STATUSES = ["borrador", "programada", "activa", "completada", "cancelada"] as const;

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  segment: z.enum(SEGMENTS).default("todos"),
  channel: z.enum(CHANNELS).default("whatsapp"),
  status: z.enum(["borrador", "programada"]).default("borrador"),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const UpdateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  sentAt: z.string().datetime({ offset: true }).nullable().optional(),
  totalAudience: z.number().int().min(0).optional(),
  delivered: z.number().int().min(0).optional(),
  opened: z.number().int().min(0).optional(),
  conversions: z.number().int().min(0).optional(),
  revenue: z.number().min(0).optional(),
});

// ─── Audience size estimation ─────────────────────────────────────────────────

async function estimateAudience(segment: string, tenantId: string): Promise<number> {
  try {
    const thirty = new Date();
    thirty.setDate(thirty.getDate() - 30);
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    if (segment === "todos") {
      return await prisma.customer.count({ where: { tenantId } });
    }
    if (segment === "vip") {
      return await prisma.customer.count({
        where: { tenantId, loyaltyTier: { in: ["oro", "diamante"] } },
      });
    }
    if (segment === "inactivos") {
      // Customers with no sales in the past 30 days
      return await prisma.customer.count({
        where: { tenantId, sales: { none: { createdAt: { gte: thirty } } } },
      });
    }
    if (segment === "cumpleanos") {
      return await prisma.customer.count({
        where: { tenantId, birthday: { gte: firstOfMonth, lte: lastOfMonth } },
      });
    }
    if (segment === "deudores") {
      return await prisma.customer.count({
        where: { tenantId, creditBalance: { lt: 0 } },
      });
    }
  } catch {
    // Gracefully degrade if the query fails
  }
  return 0;
}

// ─── GET /api/campaigns ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");

  const campaigns = await prisma.campaign.findMany({
    where: {
      tenantId: auth.tenantId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(campaigns);
}

// ─── POST /api/campaigns ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, message, segment, channel, status, scheduledAt } = parsed.data;

  const totalAudience = await estimateAudience(segment, auth.tenantId);

  const campaign = await prisma.campaign.create({
    data: {
      tenantId: auth.tenantId,
      name,
      message,
      segment,
      channel,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      totalAudience,
    },
  });

  const requestId = req.headers.get("x-request-id") ?? undefined;
  logActivity("campaign_created", "campaign", campaign.id, `Campaña "${name}" creada`, auth.username, requestId).catch(() => {});

  return NextResponse.json(campaign, { status: 201 });
}

// ─── PATCH /api/campaigns?id=xxx ─────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.campaign.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.sentAt !== undefined) {
    data.sentAt = parsed.data.sentAt ? new Date(parsed.data.sentAt) : null;
  }

  const updated = await prisma.campaign.update({ where: { id }, data });

  const requestId = req.headers.get("x-request-id") ?? undefined;
  logActivity("campaign_updated", "campaign", id, `Campaña "${existing.name}" actualizada → ${parsed.data.status ?? "—"}`, auth.username, requestId).catch(() => {});

  return NextResponse.json(updated);
}

// ─── DELETE /api/campaigns?id=xxx ────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.campaign.findFirst({ where: { id, tenantId: auth.tenantId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.campaign.delete({ where: { id } });

  const requestId = req.headers.get("x-request-id") ?? undefined;
  logActivity("campaign_deleted", "campaign", id, `Campaña "${existing.name}" eliminada`, auth.username, requestId).catch(() => {});

  return NextResponse.json({ ok: true });
}
