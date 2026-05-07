import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/internal/audit-log
 *
 * Internal-only endpoint for cross-tenant audit logging.
 * Called fire-and-forget from proxy.ts (Edge runtime) when suspicious
 * cross-tenant access patterns are detected.
 *
 * Auth: x-internal-key must match INTERNAL_API_KEY env var.
 * Not exposed to clients.
 */

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "internal-audit-log"); if (_rl) return _rl;
  // Only accept requests from the same origin (proxy.ts)
  const internalKey = req.headers.get("x-internal-key");
  const expected = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET;

  if (!expected || internalKey !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      event,
      resolvedTenantId,
      clientTenantHeader,
      ip,
      path,
      method,
      userAgent,
      requestId,
    } = body as {
      event: string;
      resolvedTenantId?: string;
      clientTenantHeader?: string;
      ip?: string;
      path?: string;
      method?: string;
      userAgent?: string;
      requestId?: string;
    };

    logger.warn("[cross-tenant-audit]", {
      event,
      resolvedTenantId,
      clientTenantHeader,
      ip,
      path,
      method,
      requestId,
    });

    await prisma.activityLog.create({
      data: {
        tenantId: resolvedTenantId ?? "system",
        action: "CROSS_TENANT_AUDIT",
        entity: "security",
        entityId: requestId ?? undefined,
        detail: JSON.stringify({
          event,
          resolvedTenantId,
          clientTenantHeader,
          ip: ip?.substring(0, 45), // Limit IP length
          path: path?.substring(0, 200),
          method,
          userAgent: userAgent?.substring(0, 200),
        }),
        user: "system",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[cross-tenant-audit] Failed to write audit log", { error: String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
