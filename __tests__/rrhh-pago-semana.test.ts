/**
 * El pago del sábado (Brandon 24-10): lo ganado menos los adelantos de
 * planilla, sin descontar dos veces ni descontar lo que no corresponde.
 */
import { describe, expect, it } from "vitest";
import {
  adelantosDescontables,
  calcularPagoSemana,
  diferenciaDelPago,
  entregadoDelPago,
  marcaDelPago,
  notaDelPago,
  prefijoDescuentosDelPago,
  semanasEnterasDelPeriodo,
  textoDelAvisoDelSabado,
  tipoDePago,
  totalesDeLaSemana,
  type AdelantoParaPago,
  type CalculoPago,
} from "@/lib/rrhh/pago-semana";

const SEMANAL = { modalidad: "SEMANA" as const, monto: 420 };

function adelanto(id: string, saldo: number, fecha: string, extra: Partial<AdelantoParaPago> = {}): AdelantoParaPago {
  return {
    id,
    codigoOperacion: `ADL-${id}`,
    modalidad: "DESCUENTO_PLANILLA",
    status: "ABIERTO",
    saldoPendiente: saldo,
    moneda: "PEN",
    direccion: "DADO",
    fechaAdelanto: fecha,
    ...extra,
  };
}

describe("calcularPagoSemana", () => {
  it("neto = ganado − adelantos abiertos de planilla", () => {
    const c = calcularPagoSemana({
      referencia: SEMANAL,
      ganado: 420,
      descontadoPrevio: 0,
      adelantos: [adelanto("a", 50, "2026-10-20T15:00:00Z"), adelanto("b", 30.5, "2026-10-22T15:00:00Z")],
    });
    expect(c.tipo).toBe("tarifa");
    expect(c.base).toBe(420);
    expect(c.aDescontar).toBe(80.5);
    expect(c.neto).toBe(339.5);
    expect(c.sigueDebiendo).toBe(0);
    expect(c.lineas.every((l) => l.liquida)).toBe(true);
  });

  it("nunca descuenta más que lo ganado: el más viejo primero y el resto queda para la semana que viene", () => {
    const c = calcularPagoSemana({
      referencia: SEMANAL,
      ganado: 100,
      descontadoPrevio: 0,
      adelantos: [adelanto("nuevo", 80, "2026-10-23T15:00:00Z"), adelanto("viejo", 70, "2026-10-01T15:00:00Z")],
    });
    expect(c.lineas.map((l) => [l.adelantoId, l.descuento, l.liquida])).toEqual([
      ["viejo", 70, true],
      ["nuevo", 30, false],
    ]);
    expect(c.neto).toBe(0);
    expect(c.sigueDebiendo).toBe(50);
  });

  it("lo ya descontado a mano para esta semana resta antes (no se descuenta dos veces)", () => {
    const c = calcularPagoSemana({
      referencia: SEMANAL,
      ganado: 420,
      descontadoPrevio: 100,
      adelantos: [adelanto("a", 400, "2026-10-20T15:00:00Z")],
    });
    // Tope del descuento = 420 − 100 ya descontado.
    expect(c.aDescontar).toBe(320);
    expect(c.neto).toBe(0);
    expect(c.sigueDebiendo).toBe(80);
  });

  it("no descuenta cuenta corriente, cerrados, recibidos ni dólares", () => {
    const c = calcularPagoSemana({
      referencia: SEMANAL,
      ganado: 420,
      descontadoPrevio: 0,
      adelantos: [
        adelanto("cc", 50, "2026-10-20T15:00:00Z", { modalidad: "CUENTA_CORRIENTE" }),
        adelanto("cerrado", 50, "2026-10-20T15:00:00Z", { status: "LIQUIDADO" }),
        adelanto("recibido", 50, "2026-10-20T15:00:00Z", { direccion: "RECIBIDO" }),
        adelanto("usd", 50, "2026-10-20T15:00:00Z", { moneda: "USD" }),
      ],
    });
    expect(c.lineas).toEqual([]);
    expect(c.neto).toBe(420);
  });

  it("sin tarifa: «falta definir»; el monto escrito sólo cuenta en ese caso", () => {
    const sin = calcularPagoSemana({ referencia: null, ganado: 0, descontadoPrevio: 0, adelantos: [adelanto("a", 40, "2026-10-20T15:00:00Z")] });
    expect(sin.tipo).toBe("falta_definir");
    expect(sin.base).toBeNull();
    expect(sin.lineas).toEqual([]);
    expect(sin.neto).toBe(0);

    const escrito = calcularPagoSemana({ referencia: null, ganado: 0, montoManual: 300, descontadoPrevio: 0, adelantos: [adelanto("a", 40, "2026-10-20T15:00:00Z")] });
    expect(escrito.base).toBe(300);
    expect(escrito.neto).toBe(260);

    // Con tarifa, un monto escrito por el cliente no cambia nada.
    const conTarifa = calcularPagoSemana({ referencia: SEMANAL, ganado: 420, montoManual: 9999, descontadoPrevio: 0, adelantos: [] });
    expect(conTarifa.base).toBe(420);
  });

  it("quien cobra por mes no entra en el sábado; «sin pago» es falta definir", () => {
    expect(tipoDePago({ modalidad: "MES", monto: 1500 })).toBe("mensual");
    expect(tipoDePago({ modalidad: "SIN_PAGO", monto: 0 })).toBe("falta_definir");
    const mes = calcularPagoSemana({ referencia: { modalidad: "MES", monto: 1500 }, ganado: 350, descontadoPrevio: 0, adelantos: [] });
    expect(mes.base).toBeNull();
    expect(mes.neto).toBe(0);
  });

  it("los céntimos se redondean en la unidad del negocio (sin 0,1+0,2)", () => {
    const c = calcularPagoSemana({
      referencia: SEMANAL,
      ganado: 0.3,
      descontadoPrevio: 0,
      adelantos: [adelanto("a", 0.1, "2026-10-20T15:00:00Z"), adelanto("b", 0.2, "2026-10-21T15:00:00Z")],
    });
    expect(c.aDescontar).toBe(0.3);
    expect(c.neto).toBe(0);
  });
});

describe("adelantosDescontables", () => {
  it("ordena del más viejo al más nuevo", () => {
    const r = adelantosDescontables([adelanto("b", 1, "2026-10-22T00:00:00Z"), adelanto("a", 1, "2026-10-20T00:00:00Z")]);
    expect(r.map((a) => a.id)).toEqual(["a", "b"]);
  });
});

describe("totales y aviso del sábado", () => {
  const calc = (base: number | null, neto: number, aDescontar: number, tipo: CalculoPago["tipo"] = "tarifa"): CalculoPago => ({
    tipo,
    base,
    descontadoPrevio: 0,
    lineas: [],
    aDescontar,
    neto,
    sigueDebiendo: 0,
  });

  it("suman por pagar, falta definir y pagados por separado", () => {
    const t = totalesDeLaSemana([
      { calculo: calc(420, 340, 80), pagado: null },
      { calculo: calc(300, 300, 0), pagado: null },
      { calculo: calc(null, 0, 0, "falta_definir"), pagado: null },
      { calculo: calc(null, 0, 0, "mensual"), pagado: null },
      { calculo: calc(0, 0, 0), pagado: null },
      { calculo: calc(420, 420, 0), pagado: { neto: 370, descontado: 50 } },
    ]);
    expect(t).toEqual({
      porPagar: 2,
      netoPorPagar: 640,
      adelantosPorDescontar: 80,
      faltaDefinir: 1,
      pagados: 1,
      netoPagado: 370,
      descontadoEnPagos: 50,
    });
  });

  it("el aviso dice cuántos, el neto y los adelantos; sin nadie, no hay aviso", () => {
    const aviso = textoDelAvisoDelSabado({
      porPagar: 8,
      netoPorPagar: 2950,
      adelantosPorDescontar: 410,
      faltaDefinir: 0,
      pagados: 0,
      netoPagado: 0,
      descontadoEnPagos: 0,
    });
    expect(aviso?.title).toMatch(/^Hoy se paga: 8 trabajadores · S\/ 2[.,]?950[.,]00 neto$/);
    expect(aviso?.body).toMatch(/S\/ 410[.,]00 en adelantos a descontar\.$/);
    expect(
      textoDelAvisoDelSabado({ porPagar: 0, netoPorPagar: 0, adelantosPorDescontar: 0, faltaDefinir: 0, pagados: 3, netoPagado: 900, descontadoEnPagos: 0 }),
    ).toBeNull();
    // Sólo personas sin tarifa: no dice «0 trabajadores · S/ 0,00 neto».
    const soloFalta = textoDelAvisoDelSabado({ porPagar: 0, netoPorPagar: 0, adelantosPorDescontar: 0, faltaDefinir: 5, pagados: 0, netoPagado: 0, descontadoEnPagos: 0 });
    expect(soloFalta?.title).toBe("Hoy se paga: a 5 les falta definir el pago");
    expect(soloFalta?.title).not.toMatch(/0 trabajadores/);
  });
});

describe("marcas sin columna nueva", () => {
  it("una marca por persona y semana; el prefijo de descuentos lleva el gasto", () => {
    expect(marcaDelPago("2026-10-19", "c1")).toBe("RRHH-2026-10-19-c1");
    expect(prefijoDescuentosDelPago("g1")).toBe("rrhh-pago:g1:");
  });

  it("la nota del gasto deja escrita la resta entera", () => {
    const c = calcularPagoSemana({ referencia: SEMANAL, ganado: 420, descontadoPrevio: 0, adelantos: [adelanto("a", 50, "2026-10-20T15:00:00Z")] });
    const nota = notaDelPago("Juan", "del 19/10 al 25/10/2026", c);
    expect(nota).toContain("ganado S/ 420");
    expect(nota).toContain("adelantos descontados S/ 50");
    expect(nota).toContain("(ADL-a)");
    expect(nota).toContain("neto entregado S/ 370");
  });
});

describe("revisión 24-10: lo ganado cambió después del pago", () => {
  it("pagó el sábado 9:00 y después marcó el sábado: la diferencia es lo ganado de ahora − lo pagado", () => {
    expect(diferenciaDelPago("tarifa", 470, 420)).toBe(50);
    // Un semanal pagado el miércoles con una falta marcada después: se le pagó de más.
    expect(diferenciaDelPago("tarifa", 360, 420)).toBe(-60);
  });

  it("al céntimo cuadra (sin 0,1+0,2) y sin tarifa no hay diferencia que medir", () => {
    expect(diferenciaDelPago("tarifa", 420.004, 420)).toBeNull();
    expect(diferenciaDelPago("tarifa", 0.1 + 0.2, 0.3)).toBeNull();
    expect(diferenciaDelPago("falta_definir", 0, 300)).toBeNull();
    expect(diferenciaDelPago("mensual", 1800, 0)).toBeNull();
  });
});

describe("revisión 24-10: lo pagado el sábado en «Lo ganado»", () => {
  it("sólo las semanas que caen ENTERAS en el período (como un descuento con período)", () => {
    // Octubre 2026: el 1 es jueves y el 26 es lunes (su domingo ya es noviembre).
    expect(semanasEnterasDelPeriodo("2026-10-01", "2026-10-31")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(semanasEnterasDelPeriodo("2026-10-19", "2026-10-25")).toEqual(["2026-10-19"]);
    expect(semanasEnterasDelPeriodo("2026-10-19", "2026-10-24")).toEqual([]);
  });

  it("lo entregado = lo pagado − lo descontado para esa semana, nunca negativo", () => {
    expect(entregadoDelPago(420, 50)).toBe(370);
    expect(entregadoDelPago(420, 0)).toBe(420);
    expect(entregadoDelPago(100, 150)).toBe(0);
  });
});
