import { describe, expect, it } from "vitest";
import {
  REGLA_GENERAL, TASA_POR_DEFECTO, calcularComisiones, leerMarcaDePago, marcaDePago, moverDia, rangoLibre, rangoLima, tasaPara,
  type ReglaComision,
} from "@/lib/comisiones/calcular";

const regla = (cashierId: string, rate: number, minSales = 0, maxSales: number | null = null): ReglaComision => ({
  id: `${cashierId}-${minSales}`, cashierId, label: "", minSales, maxSales, rate,
});

describe("tasaPara", () => {
  it("sin reglas usa el 2 % de siempre", () => {
    expect(tasaPara("maria", 1000, [])).toEqual({ tasa: TASA_POR_DEFECTO, fuente: "por_defecto", tramo: null });
  });

  it("la regla propia gana a la general", () => {
    const reglas = [regla(REGLA_GENERAL, 2), regla("maria", 3)];
    expect(tasaPara("maria", 100, reglas).tasa).toBe(3);
    expect(tasaPara("carlos", 100, reglas)).toMatchObject({ tasa: 2, fuente: "general" });
  });

  it("el tramo donde cae lo vendido decide el % (el borde superior es exclusivo)", () => {
    const reglas = [regla("maria", 2, 0, 5000), regla("maria", 3, 5000)];
    expect(tasaPara("maria", 4999.99, reglas).tasa).toBe(2);
    expect(tasaPara("maria", 5000, reglas)).toMatchObject({ tasa: 3, tramo: "desde S/ 5,000" });
  });

  it("si lo vendido no cae en ningún tramo propio, pasa a la general", () => {
    const reglas = [regla("maria", 5, 10000), regla(REGLA_GENERAL, 1)];
    expect(tasaPara("maria", 300, reglas)).toMatchObject({ tasa: 1, fuente: "general" });
  });
});

describe("marca de pago", () => {
  it("ida y vuelta, aun con «:» en el usuario", () => {
    const m = marcaDePago("ana:caja", "2026-10-01", "2026-10-07");
    expect(leerMarcaDePago(m)).toEqual({ cashierId: "ana:caja", desde: "2026-10-01", hasta: "2026-10-07" });
    expect(leerMarcaDePago("pago de luz")).toBeNull();
  });
});

describe("calcularComisiones", () => {
  const ventas = [
    { cashierId: "maria", cashierName: "María", role: "cajero", sales: 40, revenue: 6000 },
    { cashierId: "carlos", cashierName: "Carlos", role: "cajero", sales: 12, revenue: 1500.5 },
  ];
  const reglas = [regla(REGLA_GENERAL, 2), regla("maria", 3)];

  it("comisión, pagado dentro del período y pendiente; totales del backend", () => {
    const pagos = [
      { id: "g1", amount: 60, notes: marcaDePago("maria", "2026-10-01", "2026-10-07"), date: "2026-10-08T10:00:00Z" },
      // Otro período (setiembre) no descuenta del de octubre.
      { id: "g2", amount: 99, notes: marcaDePago("maria", "2026-09-01", "2026-09-30"), date: "2026-10-01T10:00:00Z" },
    ];
    const r = calcularComisiones("2026-10-01", "2026-10-31", ventas, reglas, pagos);
    const maria = r.filas.find((f) => f.cashierId === "maria")!;
    expect(maria).toMatchObject({ tasa: 3, comision: 180, pagado: 60, pendiente: 120, ultimoPago: "2026-10-08T10:00:00Z" });
    const carlos = r.filas.find((f) => f.cashierId === "carlos")!;
    expect(carlos.comision).toBe(30.01);
    expect(r.totales).toEqual({ ventas: 52, vendido: 7500.5, comision: 210.01, pagado: 60, pendiente: 150.01 });
    expect(r.filas[0].cashierId).toBe("maria");
  });

  it("lo pagado de más no deja pendiente negativo", () => {
    const pagos = [{ id: "g", amount: 500, notes: marcaDePago("carlos", "2026-10-01", "2026-10-31"), date: "2026-10-31" }];
    const carlos = calcularComisiones("2026-10-01", "2026-10-31", ventas, reglas, pagos).filas.find((f) => f.cashierId === "carlos")!;
    expect(carlos.pendiente).toBe(0);
  });
});

describe("pagos que se pisan con el período (revisión 08-10: el mismo tramo se pagaba dos veces)", () => {
  const ventas = [{ cashierId: "maria", cashierName: "María", role: "cajero", sales: 4, revenue: 400 }];
  const pago = (desde: string, hasta: string, amount = 8) => ({ id: `${desde}`, amount, notes: marcaDePago("maria", desde, hasta), date: "2026-10-08T15:00:00Z" });

  it("pagaste «Este mes» (01–08) y miras «Esta semana» (06–08): pendiente 0, ya está en ese pago", () => {
    const f = calcularComisiones("2026-10-06", "2026-10-08", ventas, [], [pago("2026-10-01", "2026-10-08")]).filas[0];
    expect(f).toMatchObject({ comision: 8, pagado: 0, pendiente: 0, cubierto: true, cruce: { desde: "2026-10-01", hasta: "2026-10-08" }, libre: null });
  });

  it("pagaste la semana 29/09–05/10 y miras setiembre: pendiente 0 y quedan libres 01–28/09", () => {
    const f = calcularComisiones("2026-09-01", "2026-09-30", ventas, [], [pago("2026-09-29", "2026-10-05")]).filas[0];
    expect(f).toMatchObject({ pendiente: 0, cubierto: false, cruce: { desde: "2026-09-29", hasta: "2026-10-05" }, libre: { desde: "2026-09-01", hasta: "2026-09-28" } });
    const r = calcularComisiones("2026-09-01", "2026-09-30", ventas, [], [pago("2026-09-29", "2026-10-05")]);
    expect(r.totales.pendiente).toBe(0);
  });

  it("la misma semana vista desde octubre deja libres 06–31/10", () => {
    const f = calcularComisiones("2026-10-01", "2026-10-31", ventas, [], [pago("2026-09-29", "2026-10-05")]).filas[0];
    expect(f.libre).toEqual({ desde: "2026-10-06", hasta: "2026-10-31" });
  });

  it("un pago DENTRO del período sigue descontándose y no es cruce; uno de otro vendedor no cuenta", () => {
    const otro = { id: "x", amount: 99, notes: marcaDePago("carlos", "2026-10-01", "2026-10-31"), date: "2026-10-08" };
    const f = calcularComisiones("2026-10-01", "2026-10-31", ventas, [], [pago("2026-10-06", "2026-10-08", 3), otro]).filas[0];
    expect(f).toMatchObject({ pagado: 3, pendiente: 5, cruce: null, cubierto: false, libre: null });
  });

  it("rangoLibre: cruces por los dos lados y fin de mes / año bisiesto", () => {
    expect(rangoLibre("2026-10-01", "2026-10-31", [{ desde: "2026-09-29", hasta: "2026-10-05" }, { desde: "2026-10-27", hasta: "2026-11-02" }])).toEqual({ desde: "2026-10-06", hasta: "2026-10-26" });
    expect(rangoLibre("2026-10-06", "2026-10-08", [{ desde: "2026-10-01", hasta: "2026-10-08" }])).toBeNull();
    expect(moverDia("2028-02-28", 1)).toBe("2028-02-29");
    expect(moverDia("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("rangoLima", () => {
  it("el día empieza a las 05:00 UTC", () => {
    const { from, to } = rangoLima("2026-10-01", "2026-10-01");
    expect(from.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-02T04:59:59.999Z");
  });
});
