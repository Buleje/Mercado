import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { processCascadeTick } from "@/lib/delivery/offer-cascade";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/delivery-offer-cascade
 *
 * Cron tick — corre cada 30s en Vercel (configurar via vercel.json).
 *  1. Marca offers `pending` vencidas (expiresAt < now) como `expired`.
 *  2. Para cada orderId con offer expirada y sin assignment: crea
 *     próxima oferta para el siguiente partner más cercano.
 *  3. Si no hay candidatos (max attempts o todos offline), order
 *     queda sin asignar — admin puede asignar manualmente.
 *
 * Auth: Bearer <CRON_SECRET>.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processCascadeTick();
    logger.info("[cron/delivery-offer-cascade]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[cron/delivery-offer-cascade] failed", { error: String(err) });
    return NextResponse.json(
      { error: "Cascade tick failed" },
      { status: 500 },
    );
  }
}
