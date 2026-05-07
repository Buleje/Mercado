import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { SubscribeBodySchema } from "@/lib/validators/socio-buleje";
import { SocioBulejeDB } from "@/lib/db/socio-buleje.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/socio-buleje/subscribe
 *
 * Activa (o reactiva) una membership Socio Buleje — ADR-078.
 * Body: { plan: "monthly" | "yearly" | "annual", userId }
 *
 * Comportamiento:
 *   - Primera vez: crea membership en `trial` + cycle `waived` (S/0).
 *   - Reactivación (ex-socio): status `active` + cycle `pending` (S/19|189).
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "socio-buleje-subscribe"); if (_rl) return _rl;
  const traceId = newTraceId();
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = SubscribeBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Datos inválidos", details: parsed.error.flatten(), traceId } },
        { status: 400 },
      );
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const { plan, userId } = parsed.data;
    const membership = await SocioBulejeDB.subscribe(tenantId, userId, plan);

    return NextResponse.json({ ok: true, membership, traceId });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    logger.warn("[api/socio-buleje/subscribe] error", {
      traceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(payload, { status });
  }
}
