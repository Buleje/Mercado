import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

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
  const _rl = await applyRateLimit(req, "GENEROUS", "superadmin-tenants-X"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  try {
    const session = await requirePlatform(req);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { slug } = await params;

    let body: { plan?: string; active?: boolean; name?: string; ownerEmail?: string };
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

    // Inline edit del superadmin (bundle C): renombrar + email del dueño.
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 80) {
        return NextResponse.json({ error: "Nombre inválido (2–80 caracteres)" }, { status: 400 });
      }
      updates.name = name;
    }
    if (body.ownerEmail !== undefined) {
      const email = String(body.ownerEmail).trim();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return NextResponse.json({ error: "Email inválido" }, { status: 400 });
      }
      updates.ownerEmail = email || null;
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
        // [AUDIT FIX] usar el CUID canónico, no el slug. Antes guardaba el slug
        // → el audit trail quedaba desfasado del resto de rutas superadmin (que
        // usan tenant.id) y no joineaba contra Tenant.id.
        entityId: tenant.id,
        detail: details.join(", "),
        user: `superadmin:${session.username}`,
        tenantId: tenant.id,
      },
    }).catch((err) => logger.error("[superadmin/tenants/[slug]] operation failed", { error: String(err) }));

    // Audit P0 #3 (2026-05-19): invalidar el cache de analytics cuando cambia
    // plan o estado activo. Antes el MRR mostraba datos hasta 30 min stale
    // tras cambiar el plan de un tenant.
    // Next 16: revalidateTag firma 2-arg (tag, "max" para invalidar todo).
    try {
      revalidateTag("superadmin:analytics", "max");
      revalidateTag(`superadmin:tenant:${slug}`, "max");
    } catch (e) {
      logger.warn("[superadmin/tenants] revalidateTag failed", { error: String(e) });
    }

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
