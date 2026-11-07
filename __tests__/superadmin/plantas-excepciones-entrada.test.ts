import { describe, expect, it } from "vitest";
import { entradaDeExcepciones, esLoteAnejo } from "@/lib/forestal/ctp-saldos-excepciones-entrada";
import { DIAS_LOTE_ANEJO } from "@/lib/forestal/lotes-aserrio";

const SALDOS = {
  materiaPrima: { pendienteM3: 0 },
  porEspecie: [],
  productos: [],
} as unknown as Parameters<typeof entradaDeExcepciones>[0]["saldos"];

describe("entrada de «Qué revisar» (un solo armado para el libro y el superadmin)", () => {
  it("sin conciliación ni curva no afirma existencia final ni valle", () => {
    const e = entradaDeExcepciones({
      saldos: SALDOS,
      curva: null,
      concil: null,
      origen: { corridas: [], m3SinCertificar: 0 },
      lotes: [],
      antiguedad: null,
    });
    expect(e.existenciaFinal).toBeUndefined();
    expect(e.valleDelPeriodo).toBeNull();
    expect(e.guiasVaradas).toBeUndefined();
    expect(e.sinCosto).toBeUndefined();
  });

  it("la existencia final y el origen incompleto pasan tal cual; los lotes se parten en vencidos y añejos", () => {
    const e = entradaDeExcepciones({
      saldos: SALDOS,
      curva: { valle: { fecha: "2026-10-03", saldo: -2 } },
      concil: { materiaPrima: [{ especie: "Cumala", final: -1.5 }] },
      origen: { corridas: [{}, {}], m3SinCertificar: 4.2 },
      lotes: [
        { code: "L1", status: "abierto", vencido: true, diasParado: 90 },
        { code: "L2", status: "abierto", vencido: false, diasParado: DIAS_LOTE_ANEJO + 1 },
        { code: "L3", status: "cerrado", vencido: false, diasParado: DIAS_LOTE_ANEJO + 1 },
      ],
      antiguedad: { varadas: { guias: 2, m3: 7 }, m3SinCosto: 3, guiasSinCosto: 1 },
    });
    expect(e.existenciaFinal).toEqual([{ especie: "Cumala", final: -1.5 }]);
    expect(e.valleDelPeriodo).toEqual({ fecha: "2026-10-03", saldo: -2 });
    expect(e.origenIncompleto).toEqual({ corridas: 2, m3: 4.2 });
    expect(e.lotes?.vencidos).toEqual(["L1"]);
    expect(e.lotes?.anejos).toEqual(["L2"]);
    expect(e.guiasVaradas).toMatchObject({ guias: 2, m3: 7 });
    expect(e.sinCosto).toEqual({ m3: 3, guias: 1 });
  });

  it("un lote vencido no es además añejo", () => {
    expect(esLoteAnejo({ code: "L", status: "abierto", vencido: true, diasParado: 999 })).toBe(false);
  });
});
