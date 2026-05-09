import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { runWithAuditContext } from "@/lib/audit/audit-context";

const VALID_STATUSES = ["pendiente", "confirmado", "preparando", "en_camino", "entregado", "cancelado"] as const;

const BulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(VALID_STATUSES),
});

// POST /api/orders/bulk-status — bulk status update (admin only)
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "orders-bulk-status"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BulkStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { ids, status } = parsed.data;

  // Round 14 M004: audit log de Order.updateMany bulk con admin actor + IP.
  return runWithAuditContext(req, auth.username, async () => {
  try {
    // F3: tenantId en where — previene modificación cross-tenant
    const result = await prisma.order.updateMany({
      where: { id: { in: ids }, tenantId: auth.tenantId },
      data: { status, updatedAt: new Date() },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "No se encontraron pedidos válidos para este tenant" }, { status: 404 });
    }

    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity(
      "Bulk", "pedido",
      `Cambio masivo de estado a "${status}" — ${result.count} pedido(s)`,
      undefined, auth.username, requestId,
    ).catch((err) => logger.warn("[orders/bulk-status] activity log failed", { err: String(err) }));

    return NextResponse.json({ ok: true, updated: result.count });
  } catch (e) {
    logger.error("[orders/bulk-status] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  });
}
