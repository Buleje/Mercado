import { describe, expect, it } from "vitest";
import { agruparPorDia, filasDelGrupo, horaLima, prepararFilas } from "@/components/admin/unified/finanzas/movimientos/cuentas-agrupado";
import type { MovimientoCuenta } from "@/lib/finance/cuentas-tipos";

const mov = (o: Partial<MovimientoCuenta> & Pick<MovimientoCuenta, "id" | "grupo" | "cuando" | "monto">): MovimientoCuenta => ({
  fuente: "gasto", tipo: "Gasto", conHora: true, persona: "", detalle: "", moneda: "PEN", ...o,
});

describe("Cuentas: agrupado por día", () => {
  it("la hora y el día son de Lima (UTC−5), no del UTC", () => {
    expect(horaLima("2026-11-02T01:05:00.000Z")).toBe("20:05");
    const [f] = prepararFilas([mov({ id: "a", grupo: "gastos", cuando: "2026-11-02T01:05:00.000Z", monto: 10 })]);
    expect(f.dia).toBe("2026-11-01");
  });

  it("conHora=false no inventa hora", () => {
    const [f] = prepararFilas([mov({ id: "a", grupo: "gastos", cuando: "2026-11-01T05:00:00.000Z", monto: 10, conHora: false })]);
    expect(f.hora).toBe("");
  });

  it("agrupa por día, suma entra/sale de lo visible y deja fuera otras monedas", () => {
    const filas = prepararFilas([
      mov({ id: "1", grupo: "ingresos", cuando: "2026-11-01T18:00:00.000Z", monto: 100 }),
      mov({ id: "2", grupo: "adelantos", cuando: "2026-11-01T16:00:00.000Z", monto: 30 }),
      mov({ id: "3", grupo: "gastos", cuando: "2026-11-01T15:00:00.000Z", monto: 20, moneda: "USD" }),
      mov({ id: "4", grupo: "gastos", cuando: "2026-10-31T15:00:00.000Z", monto: 5 }),
    ]);
    const dias = agruparPorDia(filas);
    expect(dias.map((d) => d.dia)).toEqual(["2026-11-01", "2026-10-31"]);
    expect(dias[0]).toMatchObject({ entra: 100, sale: 30 });
    expect(dias[0].filas).toHaveLength(3);
    expect(dias[1]).toMatchObject({ entra: 0, sale: 5 });
  });

  it("la tarjeta filtra por grupo y null deja todo", () => {
    const filas = prepararFilas([
      mov({ id: "1", grupo: "ingresos", cuando: "2026-11-01T18:00:00.000Z", monto: 1 }),
      mov({ id: "2", grupo: "gastos", cuando: "2026-11-01T17:00:00.000Z", monto: 2 }),
    ]);
    expect(filasDelGrupo(filas, "gastos").map((f) => f.id)).toEqual(["2"]);
    expect(filasDelGrupo(filas, null)).toHaveLength(2);
  });
});
