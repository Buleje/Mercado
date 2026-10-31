import { describe, expect, it } from "vitest";
import { estadoCuentaUnificado, claveDia } from "@/lib/adelantos/estado-cuenta-unificado";
import { armarCuentaDeGuia, sentidoDelSaldo, tipoDeLinea } from "@/lib/forestal/cuenta-en-la-guia";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";

const mov = (p: Partial<MovimientoCuenta> & Pick<MovimientoCuenta, "id" | "tipo" | "concepto" | "monto" | "fecha">): MovimientoCuenta => ({
  parteId: "P1",
  parteNombre: "QA plata",
  moneda: "PEN",
  referencia: null,
  fleteId: null,
  notas: null,
  ...p,
});

describe("tipoDeLinea", () => {
  it("clasifica cada concepto en su filtro", () => {
    expect(tipoDeLinea({ origen: "forestal", conceptoForestal: "madera" })).toBe("madera");
    expect(tipoDeLinea({ origen: "forestal", conceptoForestal: "pago_hecho" })).toBe("pagos");
    expect(tipoDeLinea({ origen: "forestal", conceptoForestal: "pago" })).toBe("pagos");
    expect(tipoDeLinea({ origen: "forestal", conceptoForestal: "compensacion" })).toBe("pagos");
    expect(tipoDeLinea({ origen: "forestal", conceptoForestal: "adelanto" })).toBe("adelantos");
    expect(tipoDeLinea({ origen: "adelanto" })).toBe("adelantos");
    expect(tipoDeLinea({ origen: "entrega" })).toBe("adelantos");
    expect(tipoDeLinea({ origen: "forestal", conceptoForestal: "aserrio_prestado" })).toBe("otros");
    expect(tipoDeLinea({ origen: "forestal", conceptoForestal: "venta" })).toBe("otros");
    // Sin concepto (línea armada a mano, anterior al campo): nunca se inventa «madera».
    expect(tipoDeLinea({ origen: "forestal" })).toBe("otros");
  });
});

describe("armarCuentaDeGuia", () => {
  it("madera 1500 − pago 500 = le debes 1000, con la guía en cada línea", () => {
    const lineas = estadoCuentaUnificado(
      [],
      [
        mov({ id: "m1", tipo: "abono", concepto: "madera", monto: 1500, fecha: "2026-09-20T00:00:00.000Z", gtfNumber: "G1" }),
        mov({ id: "m2", tipo: "cargo", concepto: "pago_hecho", monto: 500, fecha: "2026-09-21T00:00:00.000Z", gtfNumber: "G1", referencia: "LIQ-2026-0003" }),
      ],
    );
    const c = armarCuentaDeGuia({
      parteId: "P1",
      nombre: "QA plata",
      beneficiarioId: null,
      neto: -1000,
      adelantado: null,
      otrasMonedas: {},
      lineas,
      dia: claveDia,
    });
    expect(c.madera).toBe(1500);
    expect(c.pagado).toBe(500);
    expect(c.adelantado).toBeNull();
    expect(sentidoDelSaldo(c.neto)).toBe("le-debes");
    expect(c.lineas.map((l) => [l.dia, l.tipo, l.gtfNumber, l.monto, l.acumulado])).toEqual([
      ["2026-09-20", "madera", "G1", -1500, -1500],
      ["2026-09-21", "pagos", "G1", 500, -1000],
    ]);
    // El saldo corrido de la última línea es el neto: una sola verdad.
    expect(c.lineas.at(-1)?.acumulado).toBe(c.neto);
  });

  it("un adelanto con hora de la noche se lee el día de Lima, no el UTC", () => {
    const lineas = estadoCuentaUnificado(
      [{ status: "ABIERTO", codigoOperacion: "ADL-1", fechaAdelanto: "2026-09-06T01:30:00.000Z", montoAdelantado: 200, moneda: "PEN", entregas: [] }],
      [],
    );
    const c = armarCuentaDeGuia({ parteId: "P1", nombre: "x", beneficiarioId: "B1", neto: 200, adelantado: 200, otrasMonedas: {}, lineas, dia: claveDia });
    expect(c.lineas[0]).toMatchObject({ dia: "2026-09-05", tipo: "adelantos", referencia: "ADL-1" });
    expect(sentidoDelSaldo(0.004)).toBe("al-dia");
  });

  it("la madera en otra moneda no se suma a los soles", () => {
    const lineas = estadoCuentaUnificado([], [mov({ id: "m1", tipo: "abono", concepto: "madera", monto: 100, moneda: "USD", fecha: "2026-09-20T00:00:00.000Z" })]);
    const c = armarCuentaDeGuia({ parteId: "P1", nombre: "x", beneficiarioId: null, neto: 0, adelantado: null, otrasMonedas: { USD: -100 }, lineas, dia: claveDia });
    expect(c.madera).toBe(0);
    expect(c.lineas[0].moneda).toBe("USD");
  });
});
