import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { CancelBodySchema } from "@/lib/validators/socio-buleje";
import { SocioBulejeDB } from "@/lib/db/socio-buleje.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/socio-buleje/cancel
 *
 * Cancela una membership — ADR-078.
 * Body: { userId, reason?, immediate? }
 *   - immediate=false (default): `cancelAtPeriodEnd=true`, sigue siendo socio hasta currentPeriodEnd.
 *   - immediate=true: status=`cancelled` inmediatamente.
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "socio-buleje-cancel"); if (_rl) return _rl;
  const traceId = newTraceId();
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = CancelBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: parsed.error.flatten(), traceId } },
        { status: 400 },
      );
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const { userId, reason, immediate } = parsed.data;
    const membership = await SocioBulejeDB.cancel(tenantId, userId, reason, immediate ?? false);

    if (!membership) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Membership no encontrada", traceId } },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, membership, traceId });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    logger.warn("[api/socio-buleje/cancel] error", {
      traceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(payload, { status });
  }
}
