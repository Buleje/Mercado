import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePartner } from "@/lib/delivery/partner-session";
import { DeliveryStreaksDb } from "@/lib/db/delivery-streaks.db";
import { logger } from "@/lib/logger";


/**
 * GET /api/delivery/me/streaks
 *
 * Devuelve racha diaria, progreso de meta semanal y bonuses activos
 * del repartidor autenticado.
 *
 * Auth: cookie `buleje-partner-sess` (requirePartner).
 * Cache: 60 s por partnerId (gestionado en DeliveryStreaksDb.getStreaks).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const { partnerId } = session;

  try {
    const payload = await DeliveryStreaksDb.getStreaks(partnerId);

    logger.info("delivery.streaks.read", {
      partnerId,
      days: payload.streak.days,
      weeklyGoalCurrent: payload.weeklyGoal.current,
      weeklyGoalTarget: payload.weeklyGoal.target,
      daysRemaining: payload.weeklyGoal.daysRemaining,
    });

    return NextResponse.json(payload);
  } catch (err) {
    logger.error("delivery.streaks.failed", {
      partnerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "No se pudo obtener la racha del repartidor" },
      { status: 500 },
    );
  }
}
