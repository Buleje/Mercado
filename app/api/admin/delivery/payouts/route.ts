import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { PartnerPayoutsDB } from "@/lib/db/partner-payouts.db";
import { ROLES_ESCRIBEN_PLATA_GUIA } from "@/lib/forestal/plata-de-guia-rol";
import { filtroHistorialSchema } from "@/lib/delivery/payout-transiciones";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/delivery/payouts — retiros que los repartidores pidieron en
 * su app: los que esperan pago, el historial y el resumen (calculado acá).
 *
 * Ver: admin y encargado. Resolver (aprobar/pagar/rechazar) es plata: sólo
 * admin y dueño — `puedeResolver` le dice a la pantalla si muestra los botones
 * (el bypass de gestión de `requireAdmin` deja pasar al encargado igual).
 *
 * `?historial=paid|rejected` filtra el historial EN LA BASE (antes se filtraba
 * en la pantalla sobre los últimos 60 y un pagado viejo no aparecía).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const filtro = filtroHistorialSchema.safeParse(req.nextUrl.searchParams.get("historial") || undefined);
  if (!filtro.success) {
    return NextResponse.json({ error: "Filtro de historial inválido: usa paid o rejected." }, { status: 400 });
  }
  try {
    const data = await PartnerPayoutsDB.listForTenant(auth.tenantId, { historial: filtro.data });
    return NextResponse.json({
      ...data,
      puedeResolver: (ROLES_ESCRIBEN_PLATA_GUIA as readonly string[]).includes(auth.role),
    });
  } catch (err) {
    logger.error("[admin/delivery/payouts] GET failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No pudimos leer los retiros." }, { status: 500 });
  }
}
