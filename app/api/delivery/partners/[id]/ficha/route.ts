/**
 * GET /api/delivery/partners/:id/ficha?period=week|month|all — la ficha del
 * repartidor (17-10, P24/P41/P42): entregas del período con su pedido,
 * incidencias, lo ganado (tarifas + propinas) frente a lo pagado en retiros, lo
 * que se le debe hoy y sus asignaciones abiertas.
 *
 * El período es el MISMO del ranking (`desdeDelPeriodo`): la fila del ranking
 * abre la ficha con las mismas cuentas. Ver: admin y encargado (como el
 * ranking y los retiros). Sólo lectura. Otro negocio = 404.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { DeliveryPartnersDB } from "@/lib/db/delivery-partners.db";
import { desdeDelPeriodo, type PeriodoRanking } from "@/lib/delivery/ranking-reparto";
import { logger } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

const PERIODOS: readonly PeriodoRanking[] = ["week", "month", "all"];

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!id || id.length > 64) return NextResponse.json({ error: "Repartidor inválido." }, { status: 400 });

  const pedido = req.nextUrl.searchParams.get("period") ?? "month";
  const periodo: PeriodoRanking = (PERIODOS as readonly string[]).includes(pedido) ? (pedido as PeriodoRanking) : "month";
  const hasta = new Date();
  const desde = periodo === "all" ? null : desdeDelPeriodo(periodo, hasta);

  try {
    const ficha = await DeliveryPartnersDB.fichaForAdmin(auth.tenantId, id, desde);
    if (!ficha) return NextResponse.json({ error: "Ese repartidor ya no está en tu equipo." }, { status: 404 });
    return NextResponse.json({
      ...ficha,
      periodo,
      desde: desde?.toISOString() ?? null,
      hasta: hasta.toISOString(),
    });
  } catch (err) {
    logger.error("[delivery/partners/ficha] GET failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No pudimos leer la ficha del repartidor." }, { status: 500 });
  }
}
