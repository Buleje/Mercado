import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { newTraceId, toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/require-admin";
import {
  getPersistedTasks,
  countPersistedTasks,
} from "@/lib/agents/persistence";

/**
 * GET /api/admin/agents/history
 *
 * Paginated history of agent tasks persisted to ActivityLog.
 * Supports filtering by domain and tenantId.
 *
 * Query params:
 *   page     — Page number (default 1)
 *   limit    — Items per page, max 100 (default 20)
 *   domain   — Filter by agent domain (inventory, orders, etc.)
 *   tenantId — Filter by tenant (defaults to x-tenant-id header or "main")
 */

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  domain: z.string().optional(),
  tenantId: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    // Auth check — same pattern as /api/agents POST
    const admin = await requireAdmin(req, ["owner", "admin", "manager"]);
    if (admin instanceof NextResponse) return admin;

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      domain: url.searchParams.get("domain") ?? undefined,
      tenantId: url.searchParams.get("tenantId") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0].message,
            traceId,
          },
        },
        { status: 400 },
      );
    }

    const { page, limit, domain, tenantId } = parsed.data;
    const effectiveTenantId =
      tenantId || req.headers.get("x-tenant-id") || "main";

    logger.info("[agents] GET /api/admin/agents/history", {
      traceId,
      tenantId: effectiveTenantId,
      domain,
      page,
      limit,
    });

    const [tasks, total] = await Promise.all([
      getPersistedTasks({
        tenantId: effectiveTenantId,
        domain,
        limit,
        offset: (page - 1) * limit,
      }),
      countPersistedTasks({
        tenantId: effectiveTenantId,
        domain,
      }),
    ]);

    return NextResponse.json({
      tasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
