/**
 * Caja › Historial › Caja por día — el cierre de cada día con el conteo REAL
 * (`lib/caja/cierres-por-dia`, la cuenta que sirve `/api/cash-registers/por-dia`).
 */
import { describe, it, expect } from "vitest";
import {
  armarDiasDeCaja,
  camposDeCajaDelCierreAMano,
  camposDeCajaDelResumen,
  cuadreDeCajas,
  CUADRE_VACIO,
  type CajaCerradaDelDia,
  type ResumenGuardado,
} from "@/lib/caja/cierres-por-dia";

/** Una caja cerrada el `dia` a las 20:00 de Lima (01:00 UTC del día siguiente). */
function caja(dia: string, esperado: number, contado: number, notes: string | null = null): CajaCerradaDelDia {
  const cierre = new Date(new Date(`${dia}T20:00:00-05:00`).getTime());
  return {
    openedAt: new Date(`${dia}T13:00:00.000Z`),
    closedAt: cierre,
    expectedAmount: esperado,
    closingAmount: contado,
    difference: Math.round((contado - esperado) * 100) / 100,
    notes,
  };
}
const sinConteo = (dia: string, esperado: number) => caja(dia, esperado, esperado, "Cierre automático (sin conteo)");

function resumen(dia: string, creadoPor: string, extra: Partial<ResumenGuardado> = {}): ResumenGuardado {
  return {
    id: `${dia}-${creadoPor}`,
    fecha: new Date(`${dia}T00:00:00.000Z`),
    fiadosCobrados: 0,
    fiadosNuevos: 0,
    fiadosVencidos: 0,
    mejorHora: null,
    productoTop: null,
    stockAlertas: null,
    notas: null,
    creadoPor,
    createdAt: new Date(`${dia}T21:07:00.000Z`),
    ...extra,
  };
}

describe("cuadreDeCajas", () => {
  it("la caja sin conteo no suma a esperado, contado ni diferencia: se cuenta aparte", () => {
    expect(cuadreDeCajas([sinConteo("2026-09-28", 150)])).toEqual({
      cajas: 1, sinConteo: 1, esperado: 0, contado: 0, diferencia: 0, faltante: 0, sobrante: 0, peor: 0,
    });
  });

  it("+5 y −5 dan 0 de neto pero el día se juzga por la peor caja", () => {
    const c = cuadreDeCajas([caja("2026-09-28", 100, 105), caja("2026-09-28", 100, 95)]);
    expect(c).toMatchObject({ cajas: 2, esperado: 200, contado: 200, diferencia: 0, faltante: 5, sobrante: 5, peor: 5 });
  });

  it("main 28/09: esperado S/ 55, contado S/ 0 → faltan S/ 55", () => {
    const c = cuadreDeCajas([caja("2026-09-28", 55, 0), sinConteo("2026-09-28", 10)]);
    expect(c).toMatchObject({ cajas: 2, sinConteo: 1, esperado: 55, contado: 0, diferencia: -55, faltante: 55, peor: 55 });
  });
});

describe("camposDeCajaDelResumen (lo que guarda el cron)", () => {
  it("con cajas contadas copia el cuadre", () => {
    expect(camposDeCajaDelResumen(cuadreDeCajas([caja("2026-09-28", 55, 0)]))).toEqual({
      efectivoEsperado: 55, efectivoContado: 0, diferenciaCaja: -55,
    });
  });

  it("sin ninguna contada: contado null («Sin contar»), no 0", () => {
    expect(camposDeCajaDelResumen(cuadreDeCajas([sinConteo("2026-09-28", 150)]))).toEqual({
      efectivoEsperado: 0, efectivoContado: null, diferenciaCaja: 0,
    });
  });
});

describe("armarDiasDeCaja", () => {
  const base = { cajas: [], ventas: [], pedidos: [], resumenes: [], desde: "2026-09-01" };

  it("la caja cerrada a las 20:00 de Lima cuenta en SU día, no en el siguiente de UTC", () => {
    const { dias } = armarDiasDeCaja({ ...base, cajas: [caja("2026-09-28", 55, 0)] });
    expect(dias.map((d) => d.dia)).toEqual(["2026-09-28"]);
  });

  it("ventas = POS + pedidos que entran; el pedido pendiente no suma", () => {
    const { dias } = armarDiasDeCaja({
      ...base,
      ventas: [{ createdAt: "2026-09-28T15:00:00.000Z", total: 30 }],
      pedidos: [
        { createdAt: "2026-09-28T16:00:00.000Z", total: 20, status: "entregado" },
        { createdAt: "2026-09-28T17:00:00.000Z", total: 999, status: "pendiente" },
      ],
    });
    expect(dias[0]).toMatchObject({ dia: "2026-09-28", ventas: { total: 50, cantidad: 2, ticket: 25 } });
  });

  it("el cierre hecho a mano gana al del cron; el del cron solo no hace fila", () => {
    const { dias } = armarDiasDeCaja({
      ...base,
      cajas: [caja("2026-09-28", 10, 10)],
      resumenes: [
        resumen("2026-09-28", "cron"),
        resumen("2026-09-28", "Ana", { notas: "faltó cambio", createdAt: new Date("2026-09-28T12:00:00.000Z") }),
        resumen("2026-09-27", "cron"),
      ],
    });
    expect(dias.map((d) => d.dia)).toEqual(["2026-09-28"]);
    expect(dias[0].resumen).toMatchObject({ creadoPor: "Ana", notas: "faltó cambio" });
  });

  it("totales sólo de días con cajas: recaudado = contado, discrepancia = faltante + sobrante", () => {
    const { dias, totales } = armarDiasDeCaja({
      ...base,
      cajas: [caja("2026-09-28", 100, 105), caja("2026-09-28", 100, 95), sinConteo("2026-09-27", 40)],
      ventas: [{ createdAt: "2026-09-26T15:00:00.000Z", total: 12 }],
    });
    expect(dias.map((d) => d.dia)).toEqual(["2026-09-28", "2026-09-27", "2026-09-26"]);
    expect(totales).toEqual({ dias: 2, sinConteo: 1, recaudado: 200, discrepancia: 10 });
  });

  it("lo anterior a `desde` queda afuera", () => {
    const { dias } = armarDiasDeCaja({ ...base, desde: "2026-09-28", cajas: [caja("2026-09-27", 5, 5)] });
    expect(dias).toEqual([]);
  });
});

describe("camposDeCajaDelCierreAMano («Cerrar el día»)", () => {
  it("fondo 100 + 300 vendidos, se cuentan 400 → diferencia 0 (no «sobran 100»)", () => {
    expect(camposDeCajaDelCierreAMano(400, CUADRE_VACIO, 400)).toEqual({
      efectivoEsperado: 400, efectivoContado: 400, diferenciaCaja: 0,
    });
  });

  it("las cajas ya cerradas suman con su propio conteo: no se vuelven a contar", () => {
    const cerradas = cuadreDeCajas([caja("2026-09-28", 55, 0)]);
    expect(camposDeCajaDelCierreAMano(100, cerradas, 98)).toEqual({
      efectivoEsperado: 155, efectivoContado: 98, diferenciaCaja: -57,
    });
  });

  it("sin conteo quedan sólo las cerradas, como el resumen del cron", () => {
    const cerradas = cuadreDeCajas([caja("2026-09-28", 55, 0)]);
    expect(camposDeCajaDelCierreAMano(100, cerradas, null)).toEqual(camposDeCajaDelResumen(cerradas));
    expect(camposDeCajaDelCierreAMano(100, CUADRE_VACIO, null)).toEqual({ efectivoEsperado: 0, efectivoContado: null, diferenciaCaja: 0 });
  });
});
