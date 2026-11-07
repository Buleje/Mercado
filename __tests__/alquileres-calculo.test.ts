/**
 * Periodos, vencimientos y deuda de un alquiler (ADR-524). La plata en
 * céntimos: la deuda es n × renta exacta, sin céntimos bailando.
 */
import { describe, expect, it } from "vitest";
import {
  type AlquilerParaCalculo,
  avisoMontoDelPago,
  cantidadDePeriodos,
  diaDeVencimiento,
  formatoMonto,
  periodoEnPlazo,
  periodosEntre,
  resumenAlquiler,
  vencimientoDelPeriodo,
} from "@/lib/admin/alquileres-calculo";

function alquiler(over: Partial<AlquilerParaCalculo> = {}): AlquilerParaCalculo {
  return {
    rentaMensual: 1500,
    moneda: "PEN",
    diaPago: 5,
    inicioEl: "2026-11-01",
    finEl: "2027-10-31",
    estado: "vigente",
    renovacionAutomatica: false,
    avisoNoRenovarDias: null,
    garantiaMonto: null,
    garantiaPagada: null,
    garantiaDevueltaEl: null,
    ...over,
  };
}

describe("diaDeVencimiento", () => {
  it("31 en febrero = último día (28 en año común)", () => {
    expect(diaDeVencimiento("2027-02", 31)).toBe("2027-02-28");
  });
  it("bisiesto: 31 en febrero de 2028 = 29", () => {
    expect(diaDeVencimiento("2028-02", 31)).toBe("2028-02-29");
    expect(diaDeVencimiento("2028-02", 30)).toBe("2028-02-29");
  });
  it("30 en abril se queda en 30; 31 en abril = 30", () => {
    expect(diaDeVencimiento("2027-04", 30)).toBe("2027-04-30");
    expect(diaDeVencimiento("2027-04", 31)).toBe("2027-04-30");
  });
  it("nunca antes del inicio del contrato", () => {
    expect(vencimientoDelPeriodo({ inicioEl: "2026-11-15", diaPago: 5 }, "2026-11")).toBe("2026-11-15");
    expect(vencimientoDelPeriodo({ inicioEl: "2026-11-15", diaPago: 5 }, "2026-12")).toBe("2026-12-05");
  });
  it("sin día de pago usa el día del inicio (31 → fin de mes)", () => {
    expect(vencimientoDelPeriodo({ inicioEl: "2027-01-31", diaPago: null }, "2027-02")).toBe("2027-02-28");
  });
});

describe("plazo", () => {
  it("12 periodos del 01-11-2026 al 31-10-2027 y del 15-11-2026 al 14-11-2027", () => {
    expect(cantidadDePeriodos("2026-11-01", "2027-10-31")).toBe(12);
    expect(cantidadDePeriodos("2026-11-15", "2027-11-14")).toBe(12);
    expect(cantidadDePeriodos("2026-11-01", "2027-11-01")).toBe(12);
  });
  it("fin null = sin cantidad de periodos", () => {
    expect(cantidadDePeriodos("2026-11-01", null)).toBeNull();
  });
  it("periodosEntre cruza el año", () => {
    expect(periodosEntre("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(periodosEntre("2027-02", "2026-11")).toEqual([]);
  });
  it("pago fuera de plazo: antes del inicio o después del último mes", () => {
    const a = alquiler();
    expect(periodoEnPlazo(a, "2026-10", "2026-11-03")).toBe(false);
    expect(periodoEnPlazo(a, "2026-11", "2026-11-03")).toBe(true);
    expect(periodoEnPlazo(a, "2027-10", "2026-11-03")).toBe(true);
    expect(periodoEnPlazo(a, "2027-11", "2026-11-03")).toBe(false);
    expect(periodoEnPlazo(a, "2027-13", "2026-11-03")).toBe(false);
  });
  it("sin fin acepta hasta 12 meses por delante de hoy", () => {
    const a = alquiler({ finEl: null });
    expect(periodoEnPlazo(a, "2027-11", "2026-11-03")).toBe(true);
    expect(periodoEnPlazo(a, "2027-12", "2026-11-03")).toBe(false);
  });
});

describe("resumenAlquiler", () => {
  it("deuda = n × renta, en céntimos exactos", () => {
    const a = alquiler({ rentaMensual: 1234.56 });
    const r = resumenAlquiler(a, [{ periodo: "2026-12", monto: 1234.56 }], "2027-02-10");
    expect(r.periodosAtrasados).toEqual(["2026-11", "2027-01", "2027-02"]);
    expect(r.deudaAtrasada).toBe(3703.68);
    expect(r.totalPagado).toBe(1234.56);
    expect(r.periodosPagados).toBe(1);
    expect(r.proximoPeriodo).toBe("2027-03");
    expect(r.proximoVenceEl).toBe("2027-03-05");
    expect(r.alertas.map((x) => x.tipo)).toEqual(["pago_atrasado"]);
  });
  it("0,1 + 0,2 no se tuerce: 3 pagos de 0.10 suman 0.30", () => {
    const a = alquiler({ rentaMensual: 0.1 });
    const pagos = ["2026-11", "2026-12", "2027-01"].map((periodo) => ({ periodo, monto: 0.1 }));
    expect(resumenAlquiler(a, pagos, "2027-01-02").totalPagado).toBe(0.3);
  });
  it("pagar tarde no deja deuda; el día del vencimiento todavía no es atraso", () => {
    const a = alquiler();
    expect(resumenAlquiler(a, [], "2026-11-05").periodosAtrasados).toEqual([]);
    expect(resumenAlquiler(a, [], "2026-11-06").periodosAtrasados).toEqual(["2026-11"]);
    expect(resumenAlquiler(a, [{ periodo: "2026-11", monto: 1500 }], "2026-11-20").deudaAtrasada).toBe(0);
  });
  it("en negociación nadie debe nada", () => {
    const r = resumenAlquiler(alquiler({ estado: "negociacion" }), [], "2027-03-01");
    expect(r.periodosAtrasados).toEqual([]);
    expect(r.proximoPeriodo).toBeNull();
  });
  it("fin null: los atrasos llegan hasta el mes de hoy, sin días para el fin", () => {
    const r = resumenAlquiler(alquiler({ finEl: null }), [], "2027-01-20");
    expect(r.periodosAtrasados).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(r.periodosDelPlazo).toBeNull();
    expect(r.diasParaFin).toBeNull();
  });
  it("terminado: no cuenta meses después del fin", () => {
    const r = resumenAlquiler(alquiler({ estado: "terminado", finEl: "2026-12-31" }), [], "2027-06-01");
    expect(r.periodosAtrasados).toEqual(["2026-11", "2026-12"]);
  });
  it("fin cerca, aviso de no renovar y garantía pendiente", () => {
    const a = alquiler({ avisoNoRenovarDias: 60, garantiaMonto: 3000, garantiaPagada: false });
    const todos = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08"];
    const r = resumenAlquiler(a, todos.map((periodo) => ({ periodo, monto: 1500 })), "2027-08-20");
    expect(r.avisoNoRenovarEl).toBe("2027-09-01");
    expect(r.diasParaFin).toBe(72);
    expect(r.alertas.map((x) => x.tipo)).toEqual(["garantia_pendiente", "aviso_no_renovar"]);
    const r2 = resumenAlquiler(a, todos.map((periodo) => ({ periodo, monto: 1500 })), "2027-09-10");
    expect(r2.alertas.map((x) => x.tipo)).toContain("fin_cerca");
  });
  it("moneda: los textos de la alerta salen en la moneda del contrato", () => {
    const usd = resumenAlquiler(alquiler({ moneda: "USD", rentaMensual: 800 }), [], "2026-12-10");
    expect(usd.alertas[0]?.texto).toContain("US$ 1,600.00");
    const pen = resumenAlquiler(alquiler({ rentaMensual: 1500 }), [], "2026-11-10");
    expect(pen.alertas[0]?.texto).toContain("S/ 1,500.00");
    expect(formatoMonto(123456789, "PEN")).toBe("S/ 1,234,567.89");
  });
  it("R2: un pago menor a la renta deja el mes pagado en parte y la deuda es lo que falta", () => {
    const a = alquiler({ inicioEl: "2026-09-01", finEl: "2027-08-31" });
    const r = resumenAlquiler(a, [{ periodo: "2026-09", monto: 150 }], "2026-10-30");
    expect(r.deudaAtrasada).toBe(2850);
    expect(r.periodosAtrasados).toEqual(["2026-09", "2026-10"]);
    expect(r.periodosParciales).toEqual([{ periodo: "2026-09", pagado: 150, falta: 1350 }]);
    expect(r.periodosPagados).toBe(0);
    expect(r.totalPagado).toBe(150);
    expect(r.alertas.map((x) => x.tipo)).toEqual(expect.arrayContaining(["pago_atrasado", "pago_incompleto"]));
    expect(r.alertas.find((x) => x.tipo === "pago_incompleto")?.texto).toContain("S/ 1,350.00");
    // Completo = sale de los parciales y de la deuda.
    const ok = resumenAlquiler(a, [{ periodo: "2026-09", monto: 1500 }], "2026-10-30");
    expect(ok.deudaAtrasada).toBe(1500);
    expect(ok.periodosParciales).toEqual([]);
    expect(ok.periodosPagados).toBe(1);
  });
});

describe("avisoMontoDelPago", () => {
  it("igual a la renta = sin aviso; menor = falta; mayor = exceso", () => {
    expect(avisoMontoDelPago(1500, 1500, "PEN", "2026-09")).toBeNull();
    expect(avisoMontoDelPago(1500, 150, "PEN", "2026-09")).toContain("falta S/ 1,350.00");
    expect(avisoMontoDelPago(1500, 1600, "PEN", "2026-09")).not.toBeNull();
  });
});
