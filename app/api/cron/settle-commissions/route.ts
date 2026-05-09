import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { withCronHealth } from "@/lib/cron/with-cron-health";

/**
 * GET /api/cron/settle-commissions
 *
 * Llamado por Vercel Cron (diario recomendado).
 * Liquida las comisiones en estado "pending" con más de 7 días de antigüedad.
 *
 * Authorization: Bearer <CRON_SECRET>
 */
export const GET = withCronHealth("settle-commissions", async (req: NextRequest) => {
  const traceId = newTraceId();

  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Buscar comisiones pendientes con más de 7 días
    const pending = await prisma.commissionLedger.findMany({
      where: {
        status: "pending",
        createdAt: { lt: cutoff },
      },
      select: { id: true, amount: true },
    });

    if (pending.length === 0) {
      logger.info("[cron/settle-commissions] No pending commissions to settle");
      return NextResponse.json({ settled: 0, totalAmount: 0 });
    }

    const ids = pending.map((c) => c.id);
    const totalAmount = Math.round(
      pending.reduce((sum, c) => sum + toNumOrZero(c.amount), 0) * 100,
    ) / 100;

    // Marcar como "settled"
    await prisma.commissionLedger.updateMany({
      where: { id: { in: ids } },
      data: { status: "settled", settledAt: new Date() },
    });

    logger.info("[cron/settle-commissions] Commissions settled", {
      count: pending.length,
      totalAmount,
    });

    return NextResponse.json({ settled: pending.length, totalAmount });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    logger.error("[cron/settle-commissions] Failed", { error: err, traceId });
    return NextResponse.json(payload, { status });
  }
});
