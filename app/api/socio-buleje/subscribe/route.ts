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

    const tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) {
      logger.warn("[api/socio-buleje/subscribe] missing x-tenant-id", { traceId });
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "tenant requerido", traceId } },
        { status: 400 },
      );
    }
    const { plan, userId, ref } = parsed.data;
    const membership = await SocioBulejeDB.subscribe(tenantId, userId, plan);

    // Referidos: si vino un código válido y es un alta NUEVA (status trial),
    // acreditamos la recompensa al referrer. Fire-and-forget + guardado: un
    // código falso o un referrer inexistente simplemente no hace nada.
    if (ref && membership.status === "trial") {
      void (async () => {
        try {
          const { decodeReferralCode, REFERRAL_REWARD_SOLES } = await import("@/lib/socio/referral");
          const referrerId = decodeReferralCode(ref);
          if (referrerId && referrerId !== userId) {
            await SocioBulejeDB.earnCashback(
              tenantId,
              referrerId,
              null,
              REFERRAL_REWARD_SOLES,
              "Referido: un vecino se hizo Socio 🎉",
            );
          }
        } catch (err) {
          logger.warn("[api/socio-buleje/subscribe] referral reward skipped", {
            traceId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    }

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
