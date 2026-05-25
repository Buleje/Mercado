import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

async function requirePlatform(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return null;
  return getPlatformSession(token);
}

// GET /api/superadmin/activity?tenant=&action=&page=1&limit=50
// Returns paginated activity log entries across all tenants
export async function GET(req: NextRequest) {
  try {
    const rateLimited = applyRateLimit(req, "GENEROUS", "sa-activity");
    if (rateLimited) return rateLimited;

    const session = await requirePlatform(req);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = req.nextUrl;
    const tenantFilter = url.searchParams.get("tenant") || undefined;
    const actionFilter = url.searchParams.get("action") || undefined;
    const entityFilter = url.searchParams.get("entity") || undefined;
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (tenantFilter) where.tenantId = tenantFilter;
    if (actionFilter) where.action = actionFilter;
    if (entityFilter) where.entity = entityFilter;

    // Date range filter — acepta ISO timestamps (?from=2026-04-01T00:00:00Z&to=...).
    // Si las fechas son inválidas, ignoramos el filtro silenciosamente.
    if (fromParam || toParam) {
      const range: Record<string, Date> = {};
      if (fromParam) {
        const f = new Date(fromParam);
        if (!Number.isNaN(f.getTime())) range.gte = f;
      }
      if (toParam) {
        const t = new Date(toParam);
        if (!Number.isNaN(t.getTime())) range.lte = t;
      }
      if (Object.keys(range).length > 0) where.createdAt = range;
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          detail: true,
          user: true,
          tenantId: true,
          createdAt: true,
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST /api/superadmin/activity
// Creates a platform-level activity log entry (e.g., plan changes, suspensions)
export async function POST(req: NextRequest) {
  try {
    const rateLimitedPost = applyRateLimit(req, "MODERATE", "sa-activity-post");
    if (rateLimitedPost) return rateLimitedPost;

    const session = await requirePlatform(req);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch((err) => { logger.error("[superadmin/activity] parse JSON body failed", { error: String(err) }); return null; });
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const { action, entity, entityId, detail, tenantId } = body;

    if (!action || !entity) {
      return NextResponse.json({ error: "action and entity required" }, { status: 400 });
    }

    const log = await prisma.activityLog.create({
      data: {
        action: String(action).slice(0, 50),
        entity: String(entity).slice(0, 50),
        entityId: entityId ? String(entityId).slice(0, 100) : null,
        detail: detail ? String(detail).slice(0, 500) : "",
        user: "superadmin",
        tenantId: tenantId ? String(tenantId).slice(0, 50) : "platform",
      },
    });

    return NextResponse.json({ log });

  } catch (e) {
    logger.error("[post] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
