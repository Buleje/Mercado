import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import {
  ESTADOS_PEDIDO_QUE_ENTRAN, combinarIngresos, mesLima, mesesHasta, parsearMes, rangoDelMesLima,
  type IngresoDelMes,
} from "@/lib/finance/ingresos-del-periodo";
import { logger } from "@/lib/logger";

/**
 * GET /api/finanzas/monthly-summary?months=6[&hasta=YYYY-MM]
 *
 * Ingresos por mes: Σ Sale.total + Σ Order.total de los pedidos concretados.
 * La regla (qué entra y cómo se parten los meses) vive en
 * `lib/finance/ingresos-del-periodo.ts`; este endpoint la aplica con agregados
 * y es la ÚNICA fuente de ingresos de Mi Plata — la leen el Resumen y
 * Ganancias. Antes Ganancias bajaba `/api/orders` y filtraba en el navegador
 * con otros estados y sin las ventas del POS: mayo daba 229,20 en una pestaña
 * y 54,90 en la otra.
 *
 * Los meses son de calendario de LIMA (01 a las 05:00 UTC → 01 siguiente a las
 * 05:00 UTC): una venta del 30/09 a las 20:00 de Pucallpa es de setiembre.
 *
 * `hasta` (opcional, `YYYY-MM`) fija el último mes de la serie: Ganancias deja
 * elegir el mes. Sin él, el mes en curso en Lima. Cada fila trae además el
 * desglose `ventas`/`pedidos` para que una pantalla pueda decir de dónde sale.
 *
 * Roles: la plata del negocio entero. Dueño, admin y encargado, más el
 * analista (lee ventas, gastos y la proyección: `RUTAS_PANEL`
 * `/api/finance/cashflow-rolling`). Cajero y almacenero → 403: antes,
 * `requireAdmin(req)` sin lista dejaba pasar a cualquier rol del panel, y
 * ninguna pestaña de ellos la usa (Mi Plata e Impuestos no están en
 * `MODULE_PERMISSIONS` de esos roles).
 *
 * @prisma-direct ok — agregados con scope explícito por `auth.tenantId`.
 */
const ROLES = ["admin", "owner", "manager", "analista"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const params = new URL(req.url).searchParams;
  const monthsParam = Number(params.get("months"));
  const months = Math.min(24, Math.max(1, Number.isFinite(monthsParam) && monthsParam > 0 ? monthsParam : 6));
  const hastaParam = params.get("hasta");
  const hasta = parsearMes(hastaParam);
  if (hastaParam && !hasta) {
    return NextResponse.json({ error: "hasta debe ser YYYY-MM" }, { status: 400 });
  }
  const ultimo = hasta ?? mesLima(new Date());

  try {
    const payload = await getOrSet(
      `finanzas:monthly-summary:${auth.tenantId}:${months}:${ultimo}`,
      120,
      async () => {
        const result: IngresoDelMes[] = [];
        for (const month of mesesHasta(ultimo, months)) {
          const { start, end } = rangoDelMesLima(month);
          const [saleAgg, orderAgg] = await Promise.all([
            prisma.sale.aggregate({
              _sum: { total: true },
              where: { tenantId: auth.tenantId, createdAt: { gte: start, lt: end } },
            }),
            prisma.order.aggregate({
              _sum: { total: true },
              where: {
                tenantId: auth.tenantId,
                createdAt: { gte: start, lt: end },
                status: { in: [...ESTADOS_PEDIDO_QUE_ENTRAN] },
                deletedAt: null,
              },
            }),
          ]);
          result.push(combinarIngresos(month, toNumOrZero(saleAgg._sum.total), toNumOrZero(orderAgg._sum.total)));
        }
        return result;
      },
    );
    return NextResponse.json(payload);
  } catch (err) {
    logger.error("[finanzas/monthly-summary] failed", { error: String(err) });
    return NextResponse.json({ error: "No se pudo cargar el resumen mensual" }, { status: 500 });
  }
}
