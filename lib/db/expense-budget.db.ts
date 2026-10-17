import "server-only";
import { prisma } from "@/lib/prisma";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";

/**
 * ExpenseBudgetDB — el techo mensual de gasto por categoría, y la comparación
 * contra lo que realmente se gastó (ADR-375).
 *
 * DOS PREGUNTAS QUE LA PANTALLA NO PODÍA RESPONDER:
 *
 * 1. «¿Me pasé?» — el presupuesto vivía en `localStorage`, así que no existía
 *    para nadie más que el navegador donde se había escrito, y el reparto por
 *    categoría lo inventaba una función `estimateBudget()`.
 *
 * 2. «¿Esto es mucho?» — un total suelto no dice nada. S/2.100 de luz es
 *    normal o es una fuga según lo que se pagó los meses anteriores. Por eso
 *    acá se calcula, por categoría, el promedio de los meses previos y el
 *    desvío: una categoría es ATÍPICA cuando se despega de su propia historia,
 *    no cuando cruza un número redondo.
 */

function safeRevalidate(tag: string): void {
  try {
    revalidateTag(tag, "max");
  } catch {
    /* fuera de contexto de request (test/script) — no crítico */
  }
}

export type DbExpenseBudget = {
  category: string;
  montoMensual: number;
  updatedBy: string | null;
  updatedAt: string;
};

/** Una categoría comparada contra su presupuesto y contra su propia historia. */
export type DbComparativaCategoria = {
  category: string;
  /** Gastado en el mes en curso. */
  actual: number;
  /** Gastado en el mes anterior. */
  anterior: number;
  /** Promedio de los meses previos completos (sin contar el actual). */
  promedio: number;
  /** Techo declarado. `null` = nadie fijó uno. */
  presupuesto: number | null;
  /** `actual - anterior`, en % del anterior. `null` si el anterior era cero. */
  variacionPct: number | null;
  /**
   * La categoría se despegó de su PROPIA historia. Tres condiciones, y cada
   * una tapa un falso positivo distinto:
   *
   *  · más de 2 desvíos estándar sobre su promedio — el salto es real;
   *  · al menos 20% arriba — en una categoría clavada en S/100, S/105 ya son
   *    «muchas sigmas» y marcarlo sería ruido;
   *  · al menos 3 meses previos CON gasto — una categoría estrenada el mes
   *    pasado no tiene historia de la que despegarse; los ceros de los meses
   *    en que no existía inflan la dispersión y la harían saltar sola.
   *
   * Un rojo falso enseña a ignorar la lista entera.
   */
  atipico: boolean;
};

export type DbTendenciaGastos = {
  /** Totales del gasto por mes, del más viejo al más nuevo. */
  meses: Array<{ clave: string; total: number }>;
  categorias: DbComparativaCategoria[];
  totales: { actual: number; anterior: number; variacionPct: number | null; presupuesto: number };
};

const claveMes = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Desvío estándar poblacional. Con menos de dos datos no hay dispersión que medir. */
function desvio(valores: number[], promedio: number): number {
  if (valores.length < 2) return 0;
  const varianza = valores.reduce((s, v) => s + (v - promedio) ** 2, 0) / valores.length;
  return Math.sqrt(varianza);
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export const ExpenseBudgetDB = {
  async getAll(tenantId: string): Promise<DbExpenseBudget[]> {
    "use cache";
    cacheLife({ revalidate: 60, stale: 120 });
    cacheTag(`tenant:${tenantId}:expense-budget`);
    const rows = await prisma.expenseBudget.findMany({
      where: { tenantId },
      orderBy: { category: "asc" },
    });
    return rows.map((r) => ({
      category: r.category,
      montoMensual: toNumOrZero(r.montoMensual),
      updatedBy: r.updatedBy,
      updatedAt: r.updatedAt.toISOString(),
    }));
  },

  /**
   * Fija (o borra) el techo de una categoría. Monto 0 = «sin techo»: se borra
   * la fila en vez de dejar un cero que la UI leería como «presupuesto de S/0»
   * y marcaría todo en rojo.
   */
  async set(
    tenantId: string,
    category: string,
    montoMensual: number,
    updatedBy?: string,
  ): Promise<void> {
    if (montoMensual <= 0) {
      await prisma.expenseBudget
        .deleteMany({ where: { tenantId, category } })
        .catch((err) => logger.warn("[expense-budget] delete failed", { tenantId, category, err: String(err) }));
    } else {
      await prisma.expenseBudget.upsert({
        where: { tenantId_category: { tenantId, category } },
        create: { tenantId, category, montoMensual, updatedBy: updatedBy ?? null },
        update: { montoMensual, updatedBy: updatedBy ?? null },
      });
    }
    safeRevalidate(`tenant:${tenantId}:expense-budget`);
  },

  /**
   * Gasto de los últimos `meses` meses, por mes y por categoría, comparado
   * contra el presupuesto.
   *
   * Cuenta lo mismo que el Historial: gastos ejecutados (`recurring = false`).
   * Las plantillas de gastos fijos no son plata gastada (ADR-374), así que
   * incluirlas acá haría que el presupuesto se viera superado sin que nadie
   * hubiera pagado nada.
   */
  async getTendencia(tenantId: string, meses = 6, hoy = new Date()): Promise<DbTendenciaGastos> {
    const desde = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - (meses - 1), 1));

    const [filas, presupuestos] = await Promise.all([
      prisma.expense.findMany({
        where: { tenantId, recurring: false, date: { gte: desde } },
        select: { category: true, amount: true, date: true },
      }),
      prisma.expenseBudget.findMany({ where: { tenantId }, select: { category: true, montoMensual: true } }),
    ]);

    // Esqueleto de meses: sin esto, un mes sin gastos desaparecería del gráfico
    // y la serie mentiría por omisión.
    const clavesMes: string[] = [];
    for (let i = meses - 1; i >= 0; i--) {
      clavesMes.push(claveMes(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1))));
    }
    const mesActual = clavesMes[clavesMes.length - 1];
    const mesAnterior = clavesMes[clavesMes.length - 2];

    const totalPorMes = new Map<string, number>(clavesMes.map((c) => [c, 0]));
    /** categoría → mes → total */
    const porCategoria = new Map<string, Map<string, number>>();

    for (const f of filas) {
      const clave = claveMes(f.date);
      if (!totalPorMes.has(clave)) continue; // fuera de la ventana
      const monto = toNumOrZero(f.amount);
      totalPorMes.set(clave, (totalPorMes.get(clave) ?? 0) + monto);
      const porMes = porCategoria.get(f.category) ?? new Map<string, number>(clavesMes.map((c) => [c, 0]));
      porMes.set(clave, (porMes.get(clave) ?? 0) + monto);
      porCategoria.set(f.category, porMes);
    }

    const techoPorCategoria = new Map(presupuestos.map((p) => [p.category, toNumOrZero(p.montoMensual)]));

    const categorias: DbComparativaCategoria[] = [...porCategoria.entries()].map(([category, porMes]) => {
      const actual = redondear(porMes.get(mesActual) ?? 0);
      const anterior = redondear(mesAnterior ? porMes.get(mesAnterior) ?? 0 : 0);
      // El promedio y el desvío se calculan SIN el mes en curso: comparar el
      // mes contra un promedio que lo incluye lo acerca a sí mismo y esconde
      // justo el salto que se está buscando. Y el mes en curso está incompleto.
      const previos = clavesMes.slice(0, -1).map((c) => porMes.get(c) ?? 0);
      const promedio = previos.length > 0 ? previos.reduce((s, v) => s + v, 0) / previos.length : 0;
      const sigma = desvio(previos, promedio);
      const presupuesto = techoPorCategoria.get(category) ?? null;
      return {
        category,
        actual,
        anterior,
        promedio: redondear(promedio),
        presupuesto,
        variacionPct: anterior > 0 ? Math.round(((actual - anterior) / anterior) * 1000) / 10 : null,
        atipico:
          previos.filter((v) => v > 0).length >= 3 &&
          sigma > 0 &&
          actual > promedio + 2 * sigma &&
          actual > promedio * 1.2,
      };
    }).sort((a, b) => b.actual - a.actual);

    const totalActual = redondear(totalPorMes.get(mesActual) ?? 0);
    const totalAnterior = redondear(mesAnterior ? totalPorMes.get(mesAnterior) ?? 0 : 0);

    return {
      meses: clavesMes.map((clave) => ({ clave, total: redondear(totalPorMes.get(clave) ?? 0) })),
      categorias,
      totales: {
        actual: totalActual,
        anterior: totalAnterior,
        variacionPct: totalAnterior > 0
          ? Math.round(((totalActual - totalAnterior) / totalAnterior) * 1000) / 10
          : null,
        presupuesto: redondear([...techoPorCategoria.values()].reduce((s, v) => s + v, 0)),
      },
    };
  },
};
