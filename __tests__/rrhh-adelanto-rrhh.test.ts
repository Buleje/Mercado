/**
 * «Dar adelanto» desde la asistencia (25-10): el sábado en que se descuenta,
 * la nota legible y la vista previa del pago (la misma cuenta del servidor).
 */
import { describe, expect, it } from "vitest";
import {
  descuentoDelAdelanto,
  finDeMes,
  notaDelAdelantoRrhh,
  primerSabadoDesde,
  sabadoTrasElPago,
  textoDelDescuento,
  vistaPreviaDelPago,
} from "@/lib/rrhh/adelanto-rrhh";
import type { FilaPagoSemanaDTO } from "@/lib/rrhh/pago-semana";

describe("el sábado del descuento", () => {
  it("el primer sábado desde hoy: el mismo sábado, o el que viene", () => {
    expect(primerSabadoDesde("2026-10-24")).toBe("2026-10-24"); // sábado
    expect(primerSabadoDesde("2026-10-25")).toBe("2026-10-31"); // domingo → el de la semana que entra
    expect(primerSabadoDesde("2026-10-19")).toBe("2026-10-24"); // lunes
    expect(primerSabadoDesde("2026-10-30")).toBe("2026-10-31"); // viernes
    expect(primerSabadoDesde("2026-12-27")).toBe("2027-01-02"); // cruza el año
  });

  it("si esa semana ya se le pagó, cae en el sábado siguiente", () => {
    expect(descuentoDelAdelanto({ hoy: "2026-10-24", tipo: "tarifa", semanaPagada: true }).fecha).toBe("2026-10-31");
    expect(descuentoDelAdelanto({ hoy: "2026-10-24", tipo: "tarifa", semanaPagada: false }).fecha).toBe("2026-10-24");
  });

  it("sin tarifa definida también se paga el sábado (con monto a mano)", () => {
    expect(descuentoDelAdelanto({ hoy: "2026-10-21", tipo: "falta_definir", semanaPagada: false }).fecha).toBe("2026-10-24");
  });

  it("quien cobra por mes: a fin de mes, nunca el sábado", () => {
    const d = descuentoDelAdelanto({ hoy: "2026-02-10", tipo: "mensual", semanaPagada: true });
    expect(d).toEqual({ fecha: "2026-02-28", tipo: "mensual", semanaPagada: false });
    expect(finDeMes("2028-02-03")).toBe("2028-02-29");
    expect(textoDelDescuento(d)).toBe("Cobra por mes: cóbraselo a fin de mes (28/02)");
  });

  it("la frase del sábado lleva día y mes", () => {
    expect(textoDelDescuento({ fecha: "2026-10-31", tipo: "tarifa" })).toBe("Se descuenta el sábado 31/10");
  });

  it("tras un pago que no cubrió todo, el saldo pasa al sábado siguiente (nunca a uno pasado)", () => {
    // Semana del lunes 26-10 pagada el sábado 31-10 → 07-11.
    expect(sabadoTrasElPago("2026-10-26", "2026-10-31")).toEqual({ pagado: "2026-10-31", siguiente: "2026-11-07" });
    // Esa misma semana pagada tarde, el lunes 09-11 → el próximo sábado, 14-11.
    expect(sabadoTrasElPago("2026-10-26", "2026-11-09")).toEqual({ pagado: "2026-10-31", siguiente: "2026-11-14" });
    // Cruza el año.
    expect(sabadoTrasElPago("2026-12-28", "2027-01-02").siguiente).toBe("2027-01-09");
  });
});

describe("la nota del adelanto", () => {
  it("sin nada: la nota de siempre", () => {
    expect(notaDelAdelantoRrhh({})).toBe("Adelanto de sueldo (RRHH)");
  });

  it("motivo, detalle y cómo se le dio, en una línea", () => {
    expect(notaDelAdelantoRrhh({ motivo: "pasaje", detalle: " a Pucallpa ", metodo: "yape" })).toBe(
      "Adelanto de sueldo (RRHH) · Pasaje: a Pucallpa · por Yape",
    );
    expect(notaDelAdelantoRrhh({ motivo: "salud", metodo: "efectivo" })).toBe("Adelanto de sueldo (RRHH) · Salud · en efectivo");
  });

  it("«Otro» escribe sólo su detalle; la nota libre de antes va al final", () => {
    expect(notaDelAdelantoRrhh({ motivo: "otro", detalle: "útiles del colegio", nota: "lo pidió el lunes" })).toBe(
      "Adelanto de sueldo (RRHH) · útiles del colegio · lo pidió el lunes",
    );
    expect(notaDelAdelantoRrhh({ motivo: "otro", detalle: "  " })).toBe("Adelanto de sueldo (RRHH)");
  });
});

function fila(extra: Partial<FilaPagoSemanaDTO> = {}): FilaPagoSemanaDTO {
  const base: FilaPagoSemanaDTO = {
    colaboradorId: "c1",
    nombre: "Juan",
    puesto: null,
    estado: "ACTIVO",
    beneficiarioId: "b1",
    tipo: "tarifa",
    referencia: { modalidad: "DIA", monto: 50 },
    ganado: 300,
    sinMarcar: 0,
    avisos: [],
    abiertos: [
      {
        id: "a1",
        codigoOperacion: "ADL-1",
        modalidad: "DESCUENTO_PLANILLA",
        status: "ABIERTO",
        saldoPendiente: 40,
        moneda: "PEN",
        direccion: "DADO",
        fechaAdelanto: "2026-10-20T15:00:00.000Z",
      },
    ],
    descontadoPrevio: 0,
    calculo: { tipo: "tarifa", base: 300, descontadoPrevio: 0, lineas: [], aDescontar: 40, neto: 260, sigueDebiendo: 0 },
    adelantosDeLaSemana: [],
    otrasDeudas: 0,
    pagado: null,
    pagoSinGasto: null,
  };
  return { ...base, ...extra };
}

describe("la vista previa del sábado", () => {
  it("suma el adelanto nuevo a los abiertos: ganó 300 − (40 + 50) = 210", () => {
    expect(vistaPreviaDelPago(fila(), 50, "2026-10-25T15:00:00.000Z")).toEqual({
      ganado: 300,
      aDescontar: 90,
      neto: 210,
      sigueDebiendo: 0,
      tipo: "tarifa",
    });
  });

  it("si los adelantos pasan lo ganado, el neto es 0 y sigue debiendo", () => {
    const v = vistaPreviaDelPago(fila(), 400, "2026-10-25T15:00:00.000Z");
    expect(v?.neto).toBe(0);
    expect(v?.aDescontar).toBe(300);
    expect(v?.sigueDebiendo).toBe(140);
  });

  it("sin monto todavía: lo de hoy", () => {
    expect(vistaPreviaDelPago(fila(), 0, "2026-10-25T15:00:00.000Z")?.neto).toBe(260);
  });

  it("ya pagado o cobra por mes: no hay vista previa del sábado", () => {
    expect(vistaPreviaDelPago(fila({ tipo: "mensual" }), 50, "2026-10-25T15:00:00.000Z")).toBeNull();
    const pagado = fila({ pagado: { gastoId: "g1" } as unknown as FilaPagoSemanaDTO["pagado"] });
    expect(vistaPreviaDelPago(pagado, 50, "2026-10-25T15:00:00.000Z")).toBeNull();
  });
});
