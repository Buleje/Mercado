import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * El cálculo de «gasto atípico» decide si la pantalla le grita al usuario. Un
 * falso positivo enseña a ignorar la alerta entera —la lección de los siete
 * rojos falsos del libro CTP— así que el umbral se prueba con números.
 */

const findManyExpense = vi.fn();
const findManyBudget = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    expense: { findMany: (...a: unknown[]) => findManyExpense(...a) },
    expenseBudget: { findMany: (...a: unknown[]) => findManyBudget(...a) },
  },
}));
vi.mock("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: () => {},
}));
vi.mock("server-only", () => ({}));

const { ExpenseBudgetDB } = await import("@/lib/db/expense-budget.db");

/** Un gasto de `monto` en el mes `mesesAtras` contado desde agosto de 2026. */
const gasto = (category: string, amount: number, mesesAtras: number) => ({
  category,
  amount,
  date: new Date(Date.UTC(2026, 7 - mesesAtras, 15)),
});

const HOY = new Date(Date.UTC(2026, 7, 20)); // 20 de agosto de 2026

beforeEach(() => {
  findManyExpense.mockReset();
  findManyBudget.mockReset();
  findManyBudget.mockResolvedValue([]);
});

describe("getTendencia", () => {
  it("devuelve un punto por mes aunque el mes no tenga gastos", async () => {
    findManyExpense.mockResolvedValue([gasto("Luz", 100, 0)]);
    const t = await ExpenseBudgetDB.getTendencia("main", 6, HOY);
    expect(t.meses).toHaveLength(6);
    expect(t.meses.map((m) => m.clave)).toEqual([
      "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
    ]);
    // Un mes sin gastos vale cero, no desaparece: si no, la serie mentiría.
    expect(t.meses[0]).toEqual({ clave: "2026-03", total: 0 });
  });

  it("marca atípica una categoría que se dispara sobre su propia historia", async () => {
    findManyExpense.mockResolvedValue([
      gasto("Luz", 100, 5), gasto("Luz", 105, 4), gasto("Luz", 98, 3),
      gasto("Luz", 102, 2), gasto("Luz", 100, 1),
      gasto("Luz", 400, 0), // el mes en curso, 4×
    ]);
    const t = await ExpenseBudgetDB.getTendencia("main", 6, HOY);
    const luz = t.categorias.find((c) => c.category === "Luz");
    expect(luz?.atipico).toBe(true);
    expect(luz?.actual).toBe(400);
    expect(luz?.anterior).toBe(100);
    expect(luz?.variacionPct).toBe(300);
  });

  it("NO marca atípica una variación chica aunque la categoría sea muy estable", async () => {
    // Con un gasto clavado en 100, cualquier desvío es «muchas sigmas». Sin el
    // segundo requisito (20% arriba), S/105 saldría en rojo y la alerta se
    // volvería ruido que nadie mira.
    findManyExpense.mockResolvedValue([
      gasto("Internet", 100, 5), gasto("Internet", 100, 4), gasto("Internet", 100, 3),
      gasto("Internet", 100, 2), gasto("Internet", 101, 1),
      gasto("Internet", 105, 0),
    ]);
    const t = await ExpenseBudgetDB.getTendencia("main", 6, HOY);
    expect(t.categorias.find((c) => c.category === "Internet")?.atipico).toBe(false);
  });

  it("no marca atípico sin historia suficiente", async () => {
    findManyExpense.mockResolvedValue([gasto("Nuevo", 5000, 1), gasto("Nuevo", 9000, 0)]);
    const t = await ExpenseBudgetDB.getTendencia("main", 6, HOY);
    // Los meses previos son [0,0,0,0,5000]: hay dispersión, pero un solo dato
    // real no es una historia. Se exige que el salto supere el promedio + 2σ.
    const nuevo = t.categorias.find((c) => c.category === "Nuevo");
    expect(nuevo?.actual).toBe(9000);
    expect(nuevo?.atipico).toBe(false);
  });

  it("el promedio excluye el mes en curso", async () => {
    findManyExpense.mockResolvedValue([
      gasto("Agua", 60, 2), gasto("Agua", 40, 1), gasto("Agua", 500, 0),
    ]);
    const t = await ExpenseBudgetDB.getTendencia("main", 6, HOY);
    const agua = t.categorias.find((c) => c.category === "Agua");
    // Cinco meses previos: 0, 0, 0, 60, 40 → promedio 20. Si incluyera el mes
    // en curso el promedio sería 100 y el salto se vería la mitad de grande.
    expect(agua?.promedio).toBe(20);
  });

  it("compara contra el techo declarado", async () => {
    findManyExpense.mockResolvedValue([gasto("Alquiler", 850, 0)]);
    findManyBudget.mockResolvedValue([{ category: "Alquiler", montoMensual: 900 }]);
    const t = await ExpenseBudgetDB.getTendencia("main", 6, HOY);
    expect(t.categorias.find((c) => c.category === "Alquiler")?.presupuesto).toBe(900);
    expect(t.totales.presupuesto).toBe(900);
  });

  it("sin mes anterior no inventa una variación", async () => {
    findManyExpense.mockResolvedValue([gasto("Luz", 100, 0)]);
    const t = await ExpenseBudgetDB.getTendencia("main", 6, HOY);
    expect(t.totales.variacionPct).toBeNull();
    expect(t.categorias[0]?.variacionPct).toBeNull();
  });

  it("ignora las plantillas de gastos fijos", async () => {
    findManyExpense.mockResolvedValue([]);
    await ExpenseBudgetDB.getTendencia("main", 6, HOY);
    // Contar plantillas haría que el presupuesto se viera superado sin que
    // nadie hubiera pagado nada (ADR-374).
    expect(findManyExpense.mock.calls[0][0].where.recurring).toBe(false);
  });
});
