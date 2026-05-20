import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CampaignsDB } from "@/lib/db/campaigns.db";
import { requireAdmin } from "@/lib/require-admin";
import { enqueueActivityLog } from "@/lib/queue";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

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

// Audit project-wide 2026-05-19: estimateAudience migrado a CampaignsDB.estimateAudience.

// ─── GET /api/campaigns ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") ?? undefined;

  const campaigns = await CampaignsDB.list(auth.tenantId, { status });
  return NextResponse.json(campaigns);
}

// ─── POST /api/campaigns ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "campaigns"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, message, segment, channel, status, scheduledAt } = parsed.data;

  const totalAudience = await CampaignsDB.estimateAudience(auth.tenantId, segment);

  const campaign = await CampaignsDB.create(auth.tenantId, {
    name,
    message,
    segment,
    channel,
    status,
    scheduledAt,
    totalAudience,
  });

  enqueueActivityLog({ action: "campaign_created", resource: "campaign", resourceId: campaign.id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Campaña "${name}" creada` }, timestamp: new Date().toISOString() }).catch((err) => logger.warn("enqueueActivityLog failed (non-critical)", { err }));

  return NextResponse.json(campaign, { status: 201 });
}

// ─── PATCH /api/campaigns?id=xxx ─────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "campaigns"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await CampaignsDB.updateForTenant(auth.tenantId, id, parsed.data);
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { previous: existing, updated } = result;

  enqueueActivityLog({ action: "campaign_updated", resource: "campaign", resourceId: id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Campaña "${existing.name}" actualizada → ${parsed.data.status ?? "—"}` }, timestamp: new Date().toISOString() }).catch((err) => logger.warn("enqueueActivityLog failed (non-critical)", { err }));

  return NextResponse.json(updated);
}

// ─── DELETE /api/campaigns?id=xxx ────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "campaigns"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await CampaignsDB.deleteForTenant(auth.tenantId, id);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  enqueueActivityLog({ action: "campaign_deleted", resource: "campaign", resourceId: id, userId: auth.username, tenantId: auth.tenantId, details: { description: `Campaña "${existing.name}" eliminada` }, timestamp: new Date().toISOString() }).catch((err) => logger.warn("enqueueActivityLog failed (non-critical)", { err }));

  return NextResponse.json({ ok: true });
}
