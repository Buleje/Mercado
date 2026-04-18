import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { CashbackHistoryQuerySchema } from "@/lib/validators/socio-buleje";
import { SocioBulejeDB } from "@/lib/db/socio-buleje.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/socio-buleje/cashback?userId=...&limit=20
 *
 * Devuelve historial de cashback (ledger append-only) + balance actual. ADR-078.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const { searchParams } = new URL(req.url);
    const parsed = CashbackHistoryQuerySchema.safeParse({
      userId: searchParams.get("userId"),
      limit: searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Parámetros inválidos", details: parsed.error.flatten(), traceId } },
        { status: 400 },
      );
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "main";
    const { userId, limit } = parsed.data;
    const [entries, balance] = await Promise.all([
      SocioBulejeDB.getCashbackHistory(tenantId, userId, limit ?? 20),
      SocioBulejeDB.getCashbackBalance(tenantId, userId),
    ]);

    return NextResponse.json({ ok: true, entries, balance, traceId });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    logger.warn("[api/socio-buleje/cashback] error", {
      traceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(payload, { status });
  }
}
