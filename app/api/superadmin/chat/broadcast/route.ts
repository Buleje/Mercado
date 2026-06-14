import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { prisma } from "@/lib/prisma";
import { PlatformChatDB } from "@/lib/db/platform-chat.db";
import { logger } from "@/lib/logger";

// Segmentación de tenants para el broadcast. El superadmin opera cross-tenant
// (es plataforma) → prisma.tenant directo, igual que el resto de /superadmin.
const segmentSchema = z.object({
  plan: z.string().max(40).optional(),
  status: z.enum(["all", "active", "trial", "expired_trial", "inactive"]).default("all"),
  tenantIds: z.array(z.string().max(120)).max(500).optional(),
});

const postSchema = segmentSchema.extend({
  body: z.string().min(1).max(5000),
  subject: z.string().max(300).optional(),
});

async function resolveSegment(seg: z.infer<typeof segmentSchema>): Promise<{ id: string; name: string }[]> {
  if (seg.tenantIds && seg.tenantIds.length > 0) {
    return prisma.tenant.findMany({ where: { id: { in: seg.tenantIds } }, select: { id: true, name: true } });
  }
  const where: Record<string, unknown> = {};
  if (seg.plan) where.plan = seg.plan;
  const now = new Date();
  if (seg.status === "active") where.active = true;
  else if (seg.status === "inactive") where.active = false;
  else if (seg.status === "trial") {
    where.active = true;
    where.trialEndsAt = { gt: now };
  } else if (seg.status === "expired_trial") {
    where.trialEndsAt = { lt: now };
  }
  return prisma.tenant.findMany({ where, select: { id: true, name: true }, take: 500 });
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = segmentSchema.safeParse({
    ...params,
    tenantIds: params.tenantIds ? params.tenantIds.split(",") : undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Segmento inválido", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const tenants = await resolveSegment(parsed.data);
    return NextResponse.json({ count: tenants.length, sample: tenants.slice(0, 8) });
  } catch (e) {
    logger.error("[superadmin/chat] broadcast preview error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const { body: text, subject, ...seg } = parsed.data;
    const tenants = await resolveSegment(seg);
    if (tenants.length === 0) {
      return NextResponse.json({ error: "El segmento no tiene tenants" }, { status: 400 });
    }
    const result = await PlatformChatDB.broadcast({
      tenants: tenants.map((t) => ({ tenantId: t.id, tenantName: t.name })),
      body: text,
      subject,
      createdBy: auth.username,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    logger.error("[superadmin/chat] broadcast error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
