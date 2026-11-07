/**
 * __tests__/adelantos-estado-cuenta-unificado.test.ts
 *
 * ADR-412 §5 — el estado de cuenta de una persona (Adelantos + cuenta
 * forestal) en una sola línea de tiempo, con el mismo signo y el mismo
 * redondeo que el resto del módulo.
 */
import { describe, expect, it } from "vitest";
import {
  datosPagoDelNegocio,
  estadoCuentaUnificado,
  formatearDia,
  resumenWhatsApp,
  totalesDeEstadoCuenta,
  type AdelantoParaEstadoCuenta,
  type LineaEstadoCuenta,
  type TotalesEstadoCuenta,
} from "@/lib/adelantos/estado-cuenta-unificado";
import { sonLaMismaCuenta } from "@/lib/adelantos/cuenta-unificada";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";

const adelanto = (p: Partial<AdelantoParaEstadoCuenta>): AdelantoParaEstadoCuenta => ({
  status: "ABIERTO",
  codigoOperacion: "ADL-2026-0001",
  fechaAdelanto: "2026-09-01T12:00:00.000Z",
  montoAdelantado: 500,
  moneda: "PEN",
  entregas: [],
  ...p,
});

const mov = (p: Partial<MovimientoCuenta>): MovimientoCuenta => ({
  id: "m1",
  parteId: "p1",
  parteNombre: "Aserradero El Roble",
  fecha: "2026-09-05T00:00:00.000Z",
  tipo: "cargo",
  concepto: "aserrio_prestado",
  monto: 300,
  moneda: "PEN",
  referencia: "Corrida N° 18",
  fleteId: null,
  notas: null,
  ...p,
});

const totalesCon = (p: Partial<TotalesEstadoCuenta>): TotalesEstadoCuenta => ({
  adelantos: { cargos: 0, abonos: 0, saldo: 0 },
  forestal: { cargos: 0, abonos: 0, saldo: 0 },
  neto: 0,
  otrasMonedas: {},
  ...p,
});

describe("estadoCuentaUnificado — orden cronológico y signo", () => {
  it("intercala adelanto + forestal en orden de fecha, con saldo corrido", () => {
    const lineas = estadoCuentaUnificado(
      [adelanto({ fechaAdelanto: "2026-09-01T12:00:00.000Z", montoAdelantado: 500 })],
      [mov({ fecha: "2026-09-05T00:00:00.000Z", monto: 300 })],
    );
    expect(lineas.map((l) => l.origen)).toEqual(["adelanto", "forestal"]);
    expect(lineas[0].acumulado).toBe(500);
    expect(lineas[1].acumulado).toBe(800); // 500 + 300, se ve el camino completo
    expect(lineas[1].referencia).toBe("Corrida N° 18");
  });

  it("una entrega resta (signo negativo) y un abono forestal también", () => {
    const lineas = estadoCuentaUnificado(
      [
        adelanto({
          fechaAdelanto: "2026-09-01T00:00:00.000Z",
          montoAdelantado: 500,
          entregas: [{ fecha: "2026-09-03T00:00:00.000Z", descripcion: "Pagó en efectivo", valor: 200 }],
        }),
      ],
      [mov({ fecha: "2026-09-04T00:00:00.000Z", tipo: "abono", concepto: "pago", monto: 100 })],
    );
    expect(lineas[1].monto).toBe(-200); // entrega
    expect(lineas[2].monto).toBe(-100); // abono forestal
    expect(lineas[2].acumulado).toBe(200); // 500 - 200 - 100
  });

  it("un adelanto CANCELADO no ensucia la cuenta que se le puede mandar a la persona", () => {
    const lineas = estadoCuentaUnificado(
      [adelanto({ status: "CANCELADO", montoAdelantado: 9000 })],
      [mov({ monto: 50 })],
    );
    expect(lineas).toHaveLength(1);
    expect(lineas[0].origen).toBe("forestal");
  });
});

describe("estadoCuentaUnificado — multi-moneda sin mezclar", () => {
  it("un adelanto en USD corre su PROPIO acumulado, no se mezcla con el forestal en PEN", () => {
    const lineas = estadoCuentaUnificado(
      [adelanto({ fechaAdelanto: "2026-09-01T00:00:00.000Z", montoAdelantado: 100, moneda: "USD" })],
      [mov({ fecha: "2026-09-02T00:00:00.000Z", monto: 300 })],
    );
    const usd = lineas.find((l) => l.moneda === "USD")!;
    const pen = lineas.find((l) => l.moneda === "PEN")!;
    expect(usd.acumulado).toBe(100);
    expect(pen.acumulado).toBe(300); // no arrastra los 100 USD
  });
});

describe("estadoCuentaUnificado — redondeo a céntimos", () => {
  it("no arrastra el resto de punto flotante (0.1 + 0.2)", () => {
    const lineas = estadoCuentaUnificado(
      [],
      [mov({ id: "a", monto: 0.1, fecha: "2026-01-01T00:00:00.000Z" }), mov({ id: "b", monto: 0.2, fecha: "2026-01-02T00:00:00.000Z" })],
    );
    expect(lineas[1].acumulado).toBe(0.3);
  });
});

describe("fechas — Lima para lo que tiene hora, UTC para el día sin hora", () => {
  const DMY: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };

  it("un adelanto de las 20:00 de Lima (01:00Z del día siguiente) sale con SU día", () => {
    expect(formatearDia("2026-09-06T01:00:00.000Z", DMY)).toBe("05/09/2026");
  });

  it("un día sin hora de la cuenta forestal (00:00Z) sigue siendo ese mismo día, no el anterior", () => {
    expect(formatearDia("2026-09-05T00:00:00.000Z", DMY)).toBe("05/09/2026");
  });

  it("ordena por el día que se lee: el adelanto de las 20:00 del 5 va antes que el cargo forestal del 6", () => {
    const lineas = estadoCuentaUnificado(
      [adelanto({ fechaAdelanto: "2026-09-06T01:00:00.000Z", montoAdelantado: 500 })],
      [mov({ fecha: "2026-09-06T00:00:00.000Z", monto: 300 })],
    );
    expect(lineas.map((l) => l.origen)).toEqual(["adelanto", "forestal"]);
    expect(lineas[1].acumulado).toBe(800);
  });

  it("el WhatsApp escribe una entrega de las 21:30 de Lima con su día", () => {
    const linea: LineaEstadoCuenta = {
      fecha: "2026-09-06T02:30:00.000Z",
      origen: "entrega",
      concepto: "Entrega",
      referencia: null,
      monto: -50,
      moneda: "PEN",
      acumulado: -50,
    };
    const texto = resumenWhatsApp("Ana", [linea], totalesCon({}));
    const dia5 = formatearDia("2026-09-05T00:00:00.000Z", { day: "2-digit", month: "short", year: "2-digit" });
    expect(texto).toContain(`${dia5} · Entrega`);
  });
});

describe("totalesDeEstadoCuenta — coincide con la fórmula del resumen", () => {
  it("separa las dos patas y el neto es la suma en PEN", () => {
    const lineas = estadoCuentaUnificado(
      [adelanto({ montoAdelantado: 500 })],
      [mov({ monto: 300 }), mov({ id: "m2", tipo: "abono", concepto: "pago", monto: 50 })],
    );
    const t = totalesDeEstadoCuenta(lineas);
    expect(t.adelantos).toEqual({ cargos: 500, abonos: 0, saldo: 500 });
    expect(t.forestal).toEqual({ cargos: 300, abonos: 50, saldo: 250 });
    expect(t.neto).toBe(750);
  });

  it("las monedas != PEN quedan en otrasMonedas, fuera del neto", () => {
    const lineas = estadoCuentaUnificado([adelanto({ montoAdelantado: 40, moneda: "USD" })], []);
    const t = totalesDeEstadoCuenta(lineas);
    expect(t.neto).toBe(0);
    expect(t.otrasMonedas).toEqual({ USD: 40 });
  });

  it("un movimiento forestal en otra moneda no desaparece: va a otrasMonedas", () => {
    const lineas = estadoCuentaUnificado(
      [adelanto({ montoAdelantado: 40, moneda: "USD" })],
      [mov({ monto: 300, moneda: "USD" }), mov({ id: "m2", monto: 100 })],
    );
    const t = totalesDeEstadoCuenta(lineas);
    expect(t.forestal.saldo).toBe(100);
    expect(t.neto).toBe(100);
    expect(t.otrasMonedas).toEqual({ USD: 340 });
  });
});

describe("resumenWhatsApp", () => {
  const totales = totalesCon({ neto: 150 });

  it("trae el neto en palabras (mismo texto que la fila) y sólo las últimas 5 líneas", () => {
    const lineas: LineaEstadoCuenta[] = Array.from({ length: 8 }, (_, i) => ({
      fecha: `2026-09-0${i + 1}T00:00:00.000Z`,
      origen: "forestal" as const,
      concepto: "Aserrío prestado",
      referencia: `Corrida N° ${i + 1}`,
      monto: 10,
      moneda: "PEN",
      acumulado: (i + 1) * 10,
    }));
    const texto = resumenWhatsApp("Ana", lineas, totales);
    expect(texto).toContain("Ana te debe S/ 150.00.");
    expect(texto).not.toContain("Corrida N° 1)"); // la primera quedó afuera de las últimas 5
    expect(texto).toContain("Corrida N° 8)");
  });

  it("agrega «Cómo pagar» sólo si hay un dato cargado", () => {
    const sinPago = resumenWhatsApp("Ana", [], totales);
    expect(sinPago).not.toContain("Cómo pagar");
    const conPago = resumenWhatsApp("Ana", [], totales, { banco: "BCP", cuentaBancaria: "1932" });
    expect(conPago).toContain("Cómo pagar: BCP cuenta 1932");
  });
});

describe("resumenWhatsApp — la moneda va en el texto", () => {
  const lineaUsd: LineaEstadoCuenta = {
    fecha: "2026-09-01T15:00:00.000Z",
    origen: "adelanto",
    concepto: "Adelanto",
    referencia: "ADL-2026-0009",
    monto: 40,
    moneda: "USD",
    acumulado: 40,
  };

  it("con soles en cero y dólares pendientes NO dice «está al día», y la línea dice USD, no S/", () => {
    const texto = resumenWhatsApp("Ana", [lineaUsd], totalesCon({ neto: 0, otrasMonedas: { USD: 40 } }));
    expect(texto).toContain("*Ana te debe USD 40.00.*");
    expect(texto).not.toContain("está al día");
    expect(texto).toContain("(ADL-2026-0009): +USD 40.00");
    expect(texto).not.toContain("S/");
  });

  it("con soles Y otra moneda, lista las dos por separado", () => {
    const texto = resumenWhatsApp("Ana", [], totalesCon({ neto: 150, otrasMonedas: { USD: -20 } }));
    expect(texto).toContain("*Ana te debe S/ 150.00.*");
    expect(texto).toContain("*Le debes USD 20.00 a Ana.*");
  });

  it("sin nada en ninguna moneda sigue diciendo «está al día»", () => {
    expect(resumenWhatsApp("Ana", [], totalesCon({}))).toContain("*Ana está al día.*");
  });
});

describe("«Cómo pagar» — la cuenta del NEGOCIO, nunca la de la persona", () => {
  const configurado = {
    transferEnabled: true,
    transferBankName: "BCP",
    transferAccountNum: "191-1234567",
    transferAccountHolder: "Bodega San Martín",
    yapeEnabled: true,
    yapePhone: "987654321",
    yapeName: "Brandon",
  };

  it("sin medios de pago configurados (o apagados) no hay datos, y el WhatsApp omite la línea", () => {
    expect(datosPagoDelNegocio({})).toBeNull();
    expect(datosPagoDelNegocio({ ...configurado, transferEnabled: false, yapeEnabled: false })).toBeNull();
    // Un banco sin número de cuenta no es a dónde transferir.
    expect(datosPagoDelNegocio({ transferEnabled: true, transferBankName: "BCP", transferAccountNum: "  " })).toBeNull();
    const texto = resumenWhatsApp("Ana", [], totalesCon({ neto: 150 }), datosPagoDelNegocio({}));
    expect(texto).not.toContain("Cómo pagar");
  });

  it("con la cuenta del negocio configurada, «Cómo pagar» la muestra con su titular", () => {
    const texto = resumenWhatsApp("Ana", [], totalesCon({ neto: 150 }), datosPagoDelNegocio(configurado));
    expect(texto).toContain("Cómo pagar: BCP cuenta 191-1234567 (Bodega San Martín) · Yape 987654321 (Brandon)");
  });

  it("si el que debe es el negocio, no le manda a la persona a dónde pagar", () => {
    const texto = resumenWhatsApp("Ana", [], totalesCon({ neto: -150 }), datosPagoDelNegocio(configurado));
    expect(texto).toContain("Le debes S/ 150.00 a Ana.");
    expect(texto).not.toContain("Cómo pagar");
  });
});

describe("sonLaMismaCuenta — nunca juntar dos cuentas", () => {
  const benef = { id: "B1", documento: "20-123456789", forestPartyId: null };
  const parte = { id: "P2", docNumero: "20123456789" };
  const base = { beneficiario: benef, parte, parteVinculadaA: null, vinculoPropioVigente: false };

  it("el vínculo explícito a ESTA parte alcanza, aunque los documentos no coincidan", () => {
    expect(
      sonLaMismaCuenta({ ...base, beneficiario: { ...benef, documento: null, forestPartyId: "P2" }, parte: { id: "P2", docNumero: "999" } }),
    ).toBe(true);
  });

  it("sin vínculo, el mismo documento normalizado las une", () => {
    expect(sonLaMismaCuenta(base)).toBe(true);
  });

  it("B1 con P2 de otro documento (la lista desactualizada) NO es la misma cuenta", () => {
    expect(sonLaMismaCuenta({ ...base, parte: { id: "P2", docNumero: "10456789012" } })).toBe(false);
    expect(sonLaMismaCuenta({ ...base, beneficiario: { ...benef, documento: null } })).toBe(false);
  });

  it("si la persona está vinculada a OTRA parte viva, no la cruza por documento", () => {
    expect(
      sonLaMismaCuenta({ ...base, beneficiario: { ...benef, forestPartyId: "P1" }, vinculoPropioVigente: true }),
    ).toBe(false);
  });

  it("si el vínculo propio apunta a una parte que ya no existe, cae al documento (como la unión)", () => {
    expect(
      sonLaMismaCuenta({ ...base, beneficiario: { ...benef, forestPartyId: "P-fantasma" }, vinculoPropioVigente: false }),
    ).toBe(true);
  });

  it("si la parte ya es de otra persona por vínculo explícito, no", () => {
    expect(sonLaMismaCuenta({ ...base, parteVinculadaA: "B9" })).toBe(false);
    expect(sonLaMismaCuenta({ ...base, parteVinculadaA: "B1" })).toBe(true);
  });

  it("una parte dada de baja no aporta documento: sólo el vínculo explícito la une", () => {
    expect(sonLaMismaCuenta({ ...base, parte: { id: "P2", docNumero: null } })).toBe(false);
  });
});
