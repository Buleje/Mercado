import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { mesLima, parsearMes } from "@/lib/finance/ingresos-del-periodo";
import { armarPeriodo, esContra, mesDeComparacion } from "@/lib/finance/comparativo-periodos";
import { ComparativoPeriodosDB } from "@/lib/db/comparativo-periodos.db";

/**
 * GET /api/finanzas/comparativo?contra=mes_pasado|mismo_mes_anyo[&mes=YYYY-MM]
 *
 * Un mes de Lima contra otro, con los totales ya calculados en el servidor
 * (regla 6): ventas (POS + pedidos concretados, la regla de Mi Plata),
 * transacciones, ticket promedio, margen (sólo sobre lo que tiene costo),
 * clientes nuevos y fiado dado. Lo que no se puede calcular viaja `null`.
 *
 * Reemplaza la lectura de `/api/admin/dashboard?from&to`, que ignoraba el
 * rango y no traía totales: la pantalla mostraba S/ 0,00 y «NaN%».
 * Mismo permiso que `/api/finanzas/monthly-summary` (la otra serie mensual).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const params = new URL(req.url).searchParams;
  const contra = params.get("contra") ?? "mes_pasado";
  if (!esContra(contra)) {
    return NextResponse.json({ error: "contra debe ser mes_pasado o mismo_mes_anyo" }, { status: 400 });
  }
  const mesParam = params.get("mes");
  const mes = parsearMes(mesParam);
  if (mesParam && !mes) return NextResponse.json({ error: "mes debe ser YYYY-MM" }, { status: 400 });
  const actual = mes ?? mesLima(new Date());
  const base = mesDeComparacion(actual, contra);

  try {
    const payload = await getOrSet(`finanzas:comparativo:${auth.tenantId}:${actual}:${base}`, 60, async () => {
      const [a, b] = await Promise.all([
        ComparativoPeriodosDB.delMes(auth.tenantId, actual),
        ComparativoPeriodosDB.delMes(auth.tenantId, base),
      ]);
      return { contra, actual: armarPeriodo(actual, a), base: armarPeriodo(base, b) };
    });
    return NextResponse.json(payload);
  } catch (err) {
    logger.error("[finanzas/comparativo] failed", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo cargar la comparación" }, { status: 500 });
  }
}
