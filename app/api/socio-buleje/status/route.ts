import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { StatusQuerySchema } from "@/lib/validators/socio-buleje";
import { SocioBulejeDB, getSocioMonthlySavings } from "@/lib/db/socio-buleje.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/socio-buleje/status?userId=...
 *
 * Devuelve la membership activa del usuario (o null). Incluye `cashbackBalance`,
 * `totalEarned` y `totalRedeemed` hidratados del ledger. ADR-078.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = StatusQuerySchema.safeParse({ userId: searchParams.get("userId") });
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Parámetros inválidos", details: parsed.error.flatten(), traceId } },
        { status: 400 },
      );
    }

    const tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) {
      logger.warn("[api/socio-buleje/status] missing x-tenant-id", { traceId });
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "tenant requerido", traceId } },
        { status: 400 },
      );
    }
    const { userId } = parsed.data;
    const membership = await SocioBulejeDB.getMembership(tenantId, userId);

    // Ahorro mensual REAL del ledger (solo si hay membership). Alimenta el
    // historial y el "uso este mes" del panel con datos reales, no mock.
    const savings = membership
      ? await getSocioMonthlySavings(tenantId, userId, 6).catch(() => null)
      : null;

    return NextResponse.json({ ok: true, membership, savings, traceId });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    logger.warn("[api/socio-buleje/status] error", {
      traceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(payload, { status });
  }
}
