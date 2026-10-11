import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getOrSet } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { mesLima, parsearMes } from "@/lib/finance/ingresos-del-periodo";
import { limaDateKey } from "@/lib/utils";
import {
  armarPeriodo,
  armarPeriodoDeComparacion,
  CONTRAS_PERIODO,
  esContra,
  instantesDelRango,
  mesDeComparacion,
  parsearDia,
  PERIODOS,
  rangoDeComparacion,
  rangoDelPeriodo,
  type ComparacionDePeriodos,
} from "@/lib/finance/comparativo-periodos";
import { ComparativoPeriodosDB } from "@/lib/db/comparativo-periodos.db";
import { z } from "zod";

/* Los mismos que `monthly-summary` (Mi Plata): gestión + analista, que lee ventas,
   gastos y analítica (Reportes comparativos venía de Análisis). */
const ROLES_GESTION = ["admin", "owner", "manager", "analista"] as const;

/** Modo «Comparar períodos»: llega cuando viene `periodo`. */
const ConsultaPeriodo = z.object({
  periodo: z.enum(PERIODOS),
  contra: z.enum(CONTRAS_PERIODO).optional(),
  fecha: z.string().optional(),
});

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
 * Gestión (admin, dueño, encargado) y analista, como `monthly-summary`:
 * ventas, margen y fiado no son de cajero ni almacenero.
 *
 * GET /api/finanzas/comparativo?periodo=semana|mes|trimestre|anyo
 *     [&contra=anterior|hace_un_anyo][&fecha=YYYY-MM-DD]
 *
 * Comparar períodos (11-10): el período de calendario de Lima que contiene
 * `fecha` (hoy por defecto) contra el anterior o el mismo de hace un año, con
 * la misma regla de ventas + clientes únicos, costo y devoluciones.
 */
export async function GET(req: NextRequest) {
  /* Ventas, margen y fiado no son para la caja ni el almacén: sin
     `allowedRoles`, `requireAdmin` deja pasar a cajero y almacenero (11-10). */
  const auth = await requireAdmin(req, ROLES_GESTION);
  if (auth instanceof NextResponse) return auth;

  const params = new URL(req.url).searchParams;
  if (params.has("periodo")) return compararPeriodos(auth.tenantId, params);
  const contra = params.get("contra") ?? "mes_pasado";
  if (!esContra(contra)) {
    return NextResponse.json(
      { error: "contra debe ser mes_pasado o mismo_mes_anyo" },
      { status: 400 },
    );
  }
  const mesParam = params.get("mes");
  const mes = parsearMes(mesParam);
  if (mesParam && !mes)
    return NextResponse.json({ error: "mes debe ser YYYY-MM" }, { status: 400 });
  const actual = mes ?? mesLima(new Date());
  const base = mesDeComparacion(actual, contra);

  try {
    const payload = await getOrSet(
      `finanzas:comparativo:${auth.tenantId}:${actual}:${base}`,
      60,
      async () => {
        const [a, b] = await Promise.all([
          ComparativoPeriodosDB.delMes(auth.tenantId, actual),
          ComparativoPeriodosDB.delMes(auth.tenantId, base),
        ]);
        return { contra, actual: armarPeriodo(actual, a), base: armarPeriodo(base, b) };
      },
    );
    return NextResponse.json(payload);
  } catch (err) {
    logger.error("[finanzas/comparativo] failed", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo cargar la comparación" }, { status: 500 });
  }
}

async function compararPeriodos(tenantId: string, params: URLSearchParams) {
  const parsed = ConsultaPeriodo.safeParse(Object.fromEntries(params));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "periodo debe ser semana, mes, trimestre o anyo; contra, anterior o hace_un_anyo" },
      { status: 400 },
    );
  }
  const { periodo } = parsed.data;
  const contra = parsed.data.contra ?? "anterior";
  const fecha =
    parsed.data.fecha === undefined ? limaDateKey(new Date()) : parsearDia(parsed.data.fecha);
  if (!fecha) return NextResponse.json({ error: "fecha debe ser YYYY-MM-DD" }, { status: 400 });
  const actual = rangoDelPeriodo(periodo, fecha);
  const base = rangoDeComparacion(periodo, actual, contra);

  try {
    const payload = await getOrSet(
      `finanzas:comparativo:${tenantId}:${periodo}:${actual.desde}:${base.desde}`,
      60,
      async () => {
        const [a, b] = await Promise.all([
          ComparativoPeriodosDB.delRangoCompleto(tenantId, instantesDelRango(actual)),
          ComparativoPeriodosDB.delRangoCompleto(tenantId, instantesDelRango(base)),
        ]);
        const respuesta: ComparacionDePeriodos = {
          periodo,
          contra,
          actual: armarPeriodoDeComparacion(periodo, actual, a),
          base: armarPeriodoDeComparacion(periodo, base, b),
        };
        return respuesta;
      },
    );
    return NextResponse.json(payload);
  } catch (err) {
    logger.error("[finanzas/comparativo] periodos failed", {
      tenantId,
      periodo,
      error: String(err),
    });
    return NextResponse.json({ error: "No se pudo cargar la comparación" }, { status: 500 });
  }
}
