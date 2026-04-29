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
 * Supports filtering by domain.
 *
 * Query params:
 *   page    — Page number (default 1)
 *   limit   — Items per page, max 100 (default 20)
 *   domain  — Filter by agent domain (inventory, orders, etc.)
 *
 * SECURITY (regla #3 CLAUDE.md): el `tenantId` viene SIEMPRE de la
 * sesión admin autenticada — NUNCA del query string. Aceptar ?tenantId=
 * permitiría a un admin del tenant A leer logs del tenant B (IDOR).
 */

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  domain: z.string().optional(),
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

    const { page, limit, domain } = parsed.data;
    // tenantId SIEMPRE de la sesión autenticada — nunca del cliente
    const effectiveTenantId = admin.tenantId;

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
