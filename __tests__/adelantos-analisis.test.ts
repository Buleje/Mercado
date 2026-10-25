import { describe, expect, it } from "vitest";
import { analizarAdelantos, diasEntre, type AdelantoParaAnalisis } from "@/lib/adelantos/analisis";

/** 25-10-2026 al mediodía de Lima. */
const AHORA = Date.parse("2026-10-25T17:00:00Z");

function ad(p: Partial<AdelantoParaAnalisis> & { beneficiarioId: string; montoAdelantado: number; fechaAdelanto: string }): AdelantoParaAnalisis {
  return {
    status: "ABIERTO",
    saldoPendiente: p.montoAdelantado,
    moneda: "PEN",
    modalidad: "CUENTA_CORRIENTE",
    direccion: "DADO",
    entregas: [],
    entregasPactadas: [],
    beneficiario: { nombre: p.beneficiarioId },
    ...p,
  };
}

/** Lo de Blas medido el 25-10 (sin los de prueba anulados, con el de prueba liquidado). */
const BLAS: AdelantoParaAnalisis[] = [
  ad({ beneficiarioId: "prueba", beneficiario: { nombre: "PRUEBA TEST - Juan Perez" }, montoAdelantado: 250, saldoPendiente: 0, status: "LIQUIDADO", fechaAdelanto: "2026-08-03T15:00:00Z", entregas: [{ fecha: "2026-08-03T16:00:00Z", valor: 250 }] }),
  ad({ beneficiarioId: "prueba", montoAdelantado: 50, status: "CANCELADO", fechaAdelanto: "2026-08-03T15:00:00Z" }),
  ad({ beneficiarioId: "quispe", beneficiario: { nombre: "Quispe Galindo  Victor" }, montoAdelantado: 17000, fechaAdelanto: "2026-08-04T15:00:00Z" }),
  ad({ beneficiarioId: "mama", beneficiario: { nombre: "MAMA DE ALEX" }, montoAdelantado: 3642, saldoPendiente: 2442, fechaAdelanto: "2026-08-17T15:00:00Z", entregas: [{ fecha: "2026-09-29T15:00:00Z", valor: 1200 }] }),
  ad({ beneficiarioId: "wasaco", montoAdelantado: 3217, fechaAdelanto: "2026-09-19T15:00:00Z" }),
  ad({ beneficiarioId: "wasaco", montoAdelantado: 1731, fechaAdelanto: "2026-09-19T15:00:00Z" }),
  ad({ beneficiarioId: "wasaco", montoAdelantado: 1300, fechaAdelanto: "2026-09-19T15:00:00Z" }),
];

describe("analizarAdelantos (datos de Blas)", () => {
  const r = analizarAdelantos(BLAS, AHORA).porMoneda.PEN;

  it("los KPIs no cuentan lo anulado", () => {
    expect(r.kpi).toEqual({ adelantado: 27140, liquidado: 1450, pendiente: 25690, pct: 5, deudores: 3, diasParaVolver: 0 });
  });

  it("por mes: lo que diste y lo que te devolvieron en su mes", () => {
    expect(r.meses.map((m) => m.clave)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(r.meses[3]).toMatchObject({ mes: "agosto", corto: "ago", diste: 20892, devolvieron: 250 });
    expect(r.meses[4]).toMatchObject({ mes: "setiembre", corto: "set", diste: 6248, devolvieron: 1200 });
    expect(r.totalMeses).toEqual({ diste: 27140, devolvieron: 1450 });
  });

  it("por persona: quién debe más primero, con su parte de lo que te deben", () => {
    expect(r.personas.map((p) => [p.nombre, p.debe, p.pctVolvio, p.pctDeLoQueTeDeben])).toEqual([
      ["Quispe Galindo  Victor", 17000, 0, 66],
      ["wasaco", 6248, 0, 24],
      ["MAMA DE ALEX", 2442, 33, 10],
      ["PRUEBA TEST - Juan Perez", 0, 100, 0],
    ]);
  });

  it("quién tarda más: días sin moverse de lo abierto, días en pagar de lo cerrado", () => {
    expect(r.tardanza.map((t) => [t.nombre, t.diasPromedio, t.abiertos, t.pagados])).toEqual([
      ["Quispe Galindo  Victor", 82, 1, 0],
      ["wasaco", 36, 3, 0],
      ["MAMA DE ALEX", 26, 1, 0],
      ["PRUEBA TEST - Juan Perez", 0, 0, 1],
    ]);
  });

  it("atraso con la regla de Cobranza (sin fecha pactada = antigüedad)", () => {
    const conPlata = r.atraso.filter((t) => t.monto > 0).map((t) => [t.id, t.monto, t.personas]);
    expect(conPlata).toEqual([["t60", 6248, 1], ["t90", 19442, 2]]);
  });

  it("una sola modalidad: en plata, y la pantalla no la muestra", () => {
    expect(r.modalidades).toEqual([{ id: "CUENTA_CORRIENTE", label: "Cuenta corriente", monto: 27140, pct: 100, debe: 25690 }]);
  });

  it("sin recibidos no hay bloque de lo recibido", () => {
    expect(r.recibido).toBeNull();
  });
});

describe("analizarAdelantos (reglas)", () => {
  it("nunca suma soles con dólares y ordena las monedas por volumen", () => {
    const r = analizarAdelantos([
      ad({ beneficiarioId: "a", montoAdelantado: 100, fechaAdelanto: "2026-10-01T15:00:00Z" }),
      ad({ beneficiarioId: "a", montoAdelantado: 500, moneda: "USD", fechaAdelanto: "2026-10-01T15:00:00Z" }),
    ], AHORA);
    expect(r.monedas).toEqual(["USD", "PEN"]);
    expect(r.porMoneda.PEN.kpi.pendiente).toBe(100);
    expect(r.porMoneda.USD.kpi.pendiente).toBe(500);
  });

  it("lo recibido va aparte y no cuenta como te deben", () => {
    const r = analizarAdelantos([
      ad({ beneficiarioId: "a", montoAdelantado: 100, fechaAdelanto: "2026-10-01T15:00:00Z" }),
      ad({ beneficiarioId: "b", beneficiario: { nombre: "Aserradero El Sol" }, montoAdelantado: 900, direccion: "RECIBIDO", conceptoRecibido: "SERVICIO", fechaAdelanto: "2026-10-02T15:00:00Z" }),
    ], AHORA).porMoneda.PEN;
    expect(r.kpi.pendiente).toBe(100);
    expect(r.personas.map((p) => p.id)).toEqual(["a"]);
    expect(r.recibido).toEqual({ total: 900, porDevolver: 900, servicio: 900, prestamo: 0, personas: [{ id: "b", nombre: "Aserradero El Sol", monto: 900 }] });
  });

  it("varias modalidades: cada una con su plata", () => {
    const r = analizarAdelantos([
      ad({ beneficiarioId: "a", montoAdelantado: 300, fechaAdelanto: "2026-10-01T15:00:00Z" }),
      ad({ beneficiarioId: "b", montoAdelantado: 100, modalidad: "DESCUENTO_PLANILLA", fechaAdelanto: "2026-10-01T15:00:00Z" }),
    ], AHORA).porMoneda.PEN;
    expect(r.modalidades.map((m) => [m.label, m.monto, m.pct])).toEqual([["Cuenta corriente", 300, 75], ["Descuento por planilla", 100, 25]]);
  });

  it("el % que volvió no dice 0 si volvió algo ni 100 si falta algo", () => {
    const r = analizarAdelantos([
      ad({ beneficiarioId: "a", montoAdelantado: 1000, saldoPendiente: 997, fechaAdelanto: "2026-10-01T15:00:00Z", entregas: [{ fecha: "2026-10-02T15:00:00Z", valor: 3 }] }),
      ad({ beneficiarioId: "b", montoAdelantado: 1000, saldoPendiente: 2, fechaAdelanto: "2026-10-01T15:00:00Z", entregas: [{ fecha: "2026-10-02T15:00:00Z", valor: 998 }] }),
    ], AHORA).porMoneda.PEN;
    expect(r.personas.find((p) => p.id === "a")?.pctVolvio).toBe(1);
    expect(r.personas.find((p) => p.id === "b")?.pctVolvio).toBe(99);
  });

  it("un abierto que entregó hace poco cuenta desde su última entrega", () => {
    const r = analizarAdelantos([
      ad({ beneficiarioId: "a", montoAdelantado: 1000, saldoPendiente: 500, fechaAdelanto: "2026-07-01T15:00:00Z", entregas: [{ fecha: "2026-10-20T15:00:00Z", valor: 500 }] }),
    ], AHORA).porMoneda.PEN;
    expect(r.tardanza[0]).toMatchObject({ diasPromedio: 5, diasQuieto: 5, abiertos: 1 });
  });

  it("los meses cruzan el año y el mes se toma en hora de Lima", () => {
    const enero = Date.parse("2027-01-10T17:00:00Z");
    const r = analizarAdelantos([
      // 31-dic a las 21:00 de Lima = 1-ene en UTC: es de diciembre.
      ad({ beneficiarioId: "a", montoAdelantado: 100, fechaAdelanto: "2027-01-01T02:00:00Z" }),
    ], enero).porMoneda.PEN;
    expect(r.meses.map((m) => m.corto)).toEqual(["ago", "set", "oct", "nov", "dic", "ene"]);
    expect(r.meses[4].diste).toBe(100);
  });

  it("diasEntre cuenta días de Lima", () => {
    expect(diasEntre("2026-10-24T04:00:00Z", "2026-10-24T06:00:00Z")).toBe(1); // 23:00 → 01:00 de Lima
    expect(diasEntre("2026-10-25T00:00:00Z", "2026-10-20T00:00:00Z")).toBe(0);
  });

  it("sin adelantos: sin monedas", () => {
    expect(analizarAdelantos([], AHORA)).toEqual({ monedas: [], porMoneda: {}, hoy: "2026-10-25" });
  });
});
