import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { DeliveryPartnersDB } from "@/lib/db/delivery-partners.db";
import { PartnerPayoutsDB } from "@/lib/db/partner-payouts.db";
import { logger } from "@/lib/logger";
import { desdeDelPeriodo, rankingReparto, type PeriodoRanking } from "@/lib/delivery/ranking-reparto";

/**
 * GET /api/admin/delivery/ranking?period=week|month|all
 *   También acepta sinónimos en es-PE: ?period=semana|mes|todo
 *
 * Devuelve ranking de partners del tenant ordenado por entregas exitosas
 * en el periodo. Incluye stats avanzados.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  try {
  const { searchParams } = new URL(req.url);
  // Acepta tanto en como es-PE (consolidación con /api/delivery/ranking)
  const rawPeriod = searchParams.get("period") ?? "month";
  const period = rawPeriod === "semana" ? "week"
               : rawPeriod === "mes" ? "month"
               : rawPeriod === "todo" ? "all"
               : rawPeriod;
  const periodo: PeriodoRanking = period === "week" || period === "all" ? period : "month";
  const hasta = new Date();
  const since = desdeDelPeriodo(periodo, hasta);

  // 17-10 (P41): lo pagado en retiros en el mismo período, aparte de lo
  // ganado en tarifas: son cifras distintas y ninguna mueve a la otra.
  const [partners, pagado] = await Promise.all([
    DeliveryPartnersDB.getRanking(auth.tenantId, since),
    PartnerPayoutsDB.pagadoPorRepartidor(auth.tenantId, periodo === "all" ? null : since),
  ]);
  // Cuentas en `lib/delivery/ranking-reparto.ts` (17-10): base = asignaciones
  // creadas en el período; «completadas» = entregadas ÷ cerradas, null sin cerradas.
  const { ranking, summary } = rankingReparto(partners);

  return NextResponse.json({
    period: periodo,
    since: since.toISOString(),
    hasta: hasta.toISOString(),
    ranking,
    summary,
    pagado,
  });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[admin/delivery/ranking] GET failed", {
      error: detail,
      tenantId: auth.tenantId,
    });
    return NextResponse.json(
      {
        error: "Error del servidor",
        ...(process.env.NODE_ENV !== "production" ? { detail } : {}),
      },
      { status: 503 },
    );
  }
}
