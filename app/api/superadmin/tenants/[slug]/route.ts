import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// PATCH /api/superadmin/tenants/[slug]
// Body: { plan?, active? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const session = await requirePlatform(req);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { slug } = await params;

    let body: { plan?: string; active?: boolean };
    try { body = await req.json(); } catch { body = {}; }

    const updates: Record<string, unknown> = {};

    if (body.plan !== undefined) {
      if (!["free", "pro", "business", "enterprise"].includes(body.plan)) {
        return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
      }
      updates.plan = body.plan;
    }

    if (body.active !== undefined) {
      updates.active = Boolean(body.active);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    const tenant = await prisma.tenant.update({
      where: { slug },
      data: updates,
      select: { id: true, slug: true, name: true, plan: true, active: true },
    });

    // Log activity
    const details: string[] = [];
    if (body.plan !== undefined) details.push(`plan → ${body.plan}`);
    if (body.active !== undefined) details.push(body.active ? "reactivated" : "suspended");
    await prisma.activityLog.create({
      data: {
        action: body.active !== undefined ? (body.active ? "tenant_reactivated" : "tenant_suspended") : "plan_changed",
        entity: "tenant",
        entityId: slug,
        detail: details.join(", "),
        user: `superadmin:${session.username}`,
        tenantId: slug,
      },
    }).catch((err) => logger.error("[superadmin/tenants/[slug]] operation failed", { error: String(err) }));

    logger.info("[SuperAdmin] Tenant updated", { username: session.username, slug, updates });
    return NextResponse.json({ tenant });
  } catch (error) {
    logger.error("[superadmin/tenants PATCH] Error updating tenant", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: "Error updating tenant" },
      { status: 500 }
    );
  }
}
