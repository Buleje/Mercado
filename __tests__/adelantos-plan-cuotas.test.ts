import { describe, expect, it } from "vitest";
import { diaLocal, diferenciaDelPlan, planCuadra, repartirCuotas } from "@/lib/adelantos/plan-cuotas";

/** Suma los valores tal como los ve el formulario: strings de dos decimales. */
const suma = (cuotas: { valor: string }[]) =>
  Math.round(cuotas.reduce((s, c) => s + Number(c.valor), 0) * 100) / 100;

describe("repartirCuotas", () => {
  it("reparte en partes iguales cuando el monto es divisible", () => {
    const c = repartirCuotas(600, 3);
    expect(c.map((x) => x.valor)).toEqual(["200.00", "200.00", "200.00"]);
  });

  it("la ÚLTIMA cuota absorbe el redondeo — el plan suma exacto", () => {
    // 100/3 = 33.333…: tres de 33.33 dejarían un céntimo sin pactar.
    const c = repartirCuotas(100, 3);
    expect(c.map((x) => x.valor)).toEqual(["33.33", "33.33", "33.34"]);
    expect(suma(c)).toBe(100);
  });

  it("suma exacto para montos y cantidades variadas", () => {
    for (const total of [0.03, 10, 99.99, 500, 1234.56, 9999.99]) {
      for (const n of [2, 3, 4, 6, 7, 12]) {
        expect(suma(repartirCuotas(total, n))).toBe(Math.round(total * 100) / 100);
      }
    }
  });

  it("espacia las fechas según el ritmo, empezando por la primera cuota", () => {
    const desde = new Date("2026-01-10T12:00:00");
    expect(repartirCuotas(300, 3, "semanal", desde).map((c) => c.fecha)).toEqual([
      "2026-01-17",
      "2026-01-24",
      "2026-01-31",
    ]);
    expect(repartirCuotas(300, 3, "quincenal", desde).map((c) => c.fecha)).toEqual([
      "2026-01-25",
      "2026-02-09",
      "2026-02-24",
    ]);
    expect(repartirCuotas(300, 3, "mensual", desde)[0].fecha).toBe("2026-02-09");
  });

  it("numera las cuotas para que la descripción se lea sola", () => {
    expect(repartirCuotas(200, 2)[1].descripcion).toBe("Cuota 2 de 2");
  });

  it("devuelve vacío ante entradas que no son un plan", () => {
    expect(repartirCuotas(0, 3)).toEqual([]);
    expect(repartirCuotas(-100, 3)).toEqual([]);
    expect(repartirCuotas(100, 0)).toEqual([]);
    expect(repartirCuotas(100, Number.NaN)).toEqual([]);
  });
});

describe("diferenciaDelPlan / planCuadra", () => {
  it("un plan repartido automáticamente siempre cuadra", () => {
    const c = repartirCuotas(100, 3);
    expect(planCuadra(100, c.map((x) => x.valor))).toBe(true);
    expect(diferenciaDelPlan(100, c.map((x) => x.valor))).toBe(0);
  });

  it("informa lo que falta y lo que sobra, con signo", () => {
    expect(diferenciaDelPlan(500, ["200", "150"])).toBe(150);
    expect(diferenciaDelPlan(500, ["300", "300"])).toBe(-100);
  });

  it("no se descuadra por el error de punto flotante", () => {
    // 0.1 + 0.2 === 0.30000000000000004 en binario.
    expect(planCuadra(0.3, ["0.1", "0.2"])).toBe(true);
  });

  it("trata los campos vacíos o basura como cero, no como NaN", () => {
    expect(diferenciaDelPlan(100, ["", "40", "abc"])).toBe(60);
  });

  it("un plan sin cuotas debe el total entero", () => {
    expect(diferenciaDelPlan(500, [])).toBe(500);
    expect(planCuadra(500, [])).toBe(false);
  });
});

describe("diaLocal", () => {
  it("da el día del calendario local, no el UTC", () => {
    // 23:30 local del 3 sigue siendo el 3, aunque en UTC ya sea el 4.
    const d = new Date(2026, 7, 3, 23, 30);
    expect(diaLocal(d)).toBe("2026-08-03");
  });
});
