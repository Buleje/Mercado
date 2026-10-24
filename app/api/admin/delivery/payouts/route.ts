import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { PartnerPayoutsDB } from "@/lib/db/partner-payouts.db";
import { ROLES_ESCRIBEN_PLATA_GUIA } from "@/lib/forestal/plata-de-guia-rol";
import { RetirosAlertasDB } from "@/lib/db/retiros-alertas.db";
import { alertasDeRetiros, filtrosRetirosSchema, MAXIMO_EXPORTAR, referenciasUsadas } from "@/lib/delivery/retiros-conciliacion";
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
 *
 * 17-10 (P35/P36): `?desde=&hasta=` (días de Lima, por el día en que se
 * resolvió), `?partnerId=` y `?exportar=1` (hasta 2000 filas, para el CSV).
 * `totales` suma TODAS las filas con esos filtros. `alertas` = coincidencias
 * para revisar (misma referencia, mismo monto en 24 h, esperas largas, pagos
 * sin N.° de operación): nunca bloquean ni cambian un retiro.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;
  const sp = req.nextUrl.searchParams;
  const filtros = filtrosRetirosSchema.safeParse({
    historial: sp.get("historial") || undefined,
    desde: sp.get("desde") || undefined,
    hasta: sp.get("hasta") || undefined,
    partnerId: sp.get("partnerId") || undefined,
    exportar: sp.get("exportar") || undefined,
  });
  if (!filtros.success) {
    return NextResponse.json(
      { error: "Filtro inválido: historial paid o rejected, fechas AAAA-MM-DD y «desde» antes de «hasta»." },
      { status: 400 },
    );
  }
  const { exportar, ...opciones } = filtros.data;
  try {
    const ahora = new Date();
    const [data, paraAlertas] = await Promise.all([
      PartnerPayoutsDB.listForTenant(auth.tenantId, { ...opciones, ...(exportar ? { take: MAXIMO_EXPORTAR } : {}) }, ahora),
      exportar ? Promise.resolve(null) : PartnerPayoutsDB.paraAlertas(auth.tenantId, ahora),
    ]);
    const alertas = paraAlertas ? await RetirosAlertasDB.conJustificacion(auth.tenantId, alertasDeRetiros(paraAlertas, ahora)) : [];
    return NextResponse.json({
      ...data,
      alertas,
      // P34: para avisar (sin bloquear) si el N.° de operación que se escribe ya pagó otro retiro.
      referencias: paraAlertas ? referenciasUsadas(paraAlertas) : [],
      puedeResolver: (ROLES_ESCRIBEN_PLATA_GUIA as readonly string[]).includes(auth.role),
    });
  } catch (err) {
    logger.error("[admin/delivery/payouts] GET failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No pudimos leer los retiros." }, { status: 500 });
  }
}
