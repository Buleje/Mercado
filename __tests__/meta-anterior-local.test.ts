import { describe, expect, it } from "vitest";
import { leerMetaVieja, metaMensual, queOfrecerGuardar } from "@/lib/admin/meta-anterior-local";

describe("meta que vivía en el navegador", () => {
  it("lee la meta y el tope guardados; ignora ceros, texto roto y negativos", () => {
    const mes = "2026-10";
    expect(leerMetaVieja(JSON.stringify({ month: mes, salesGoal: 12000, expensesGoal: 4000 }), mes)).toEqual({ ventas: 12000, gastos: 4000 });
    expect(leerMetaVieja(JSON.stringify({ month: mes, salesGoal: 0, expensesGoal: 3500.555 }), mes)).toEqual({ ventas: null, gastos: 3500.56 });
    expect(leerMetaVieja(JSON.stringify({ month: mes, salesGoal: 0, expensesGoal: 0 }), mes)).toBeNull();
    expect(leerMetaVieja(JSON.stringify({ month: mes, salesGoal: -5, expensesGoal: "900" }), mes)).toBeNull();
    expect(leerMetaVieja("{roto", mes)).toBeNull();
    expect(leerMetaVieja(null, mes)).toBeNull();
  });

  it("sólo la del mes en curso: una de mayo no se ofrece como la de octubre", () => {
    const guardada = JSON.stringify({ month: "2026-05", salesGoal: 12000, expensesGoal: 4000 });
    expect(leerMetaVieja(guardada, "2026-10")).toBeNull();
    expect(leerMetaVieja(guardada, "2026-05")).toEqual({ ventas: 12000, gastos: 4000 });
    // Sin mes guardado no hay cómo saber de cuándo es.
    expect(leerMetaVieja(JSON.stringify({ salesGoal: 12000 }), "2026-10")).toBeNull();
  });

  it("sólo ofrece lo que el servidor no tiene como meta mensual", () => {
    const vieja = { ventas: 12000, gastos: 4000 };
    expect(queOfrecerGuardar(vieja, [])).toEqual(vieja);
    expect(queOfrecerGuardar(vieja, [{ category: "ventas", period: "mensual" }])).toEqual({ ventas: null, gastos: 4000 });
    // Una meta semanal de ventas no es «la del mes»: la vieja se sigue ofreciendo.
    expect(queOfrecerGuardar(vieja, [{ category: "ventas", period: "semanal" }])).toEqual(vieja);
    expect(
      queOfrecerGuardar(vieja, [
        { category: "ventas", period: "mensual" },
        { category: "gastos", period: "mensual" },
      ]),
    ).toBeNull();
    expect(queOfrecerGuardar(null, [])).toBeNull();
  });

  it("la meta del mes es la mensual de esa categoría", () => {
    const metas = [
      { id: "a", category: "ventas" as const, period: "diario" as const },
      { id: "b", category: "ventas" as const, period: "mensual" as const },
    ];
    expect(metaMensual(metas, "ventas")?.id).toBe("b");
    expect(metaMensual(metas, "gastos")).toBeUndefined();
  });
});
