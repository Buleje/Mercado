/**
 * El expediente del lote de aserrío: armado → consumo → producción → salida.
 *
 * Lo que se fija acá es lo que un fiscalizador cruza y lo que, mal hecho,
 * inventa trazabilidad:
 *
 *  · **No se prorratea.** Un despacho sale de una corrida, y una corrida puede
 *    haber comido trozas de DOS pilas. Cuando eso pasa no existe ningún dato
 *    que diga qué mitad del camión salió de cuál — repartirlo por regla de tres
 *    fabricaría el número que la trazabilidad tiene que probar. Se marca
 *    compartida y se declara el hueco (misma razón por la que I1-I5 usan `≤`).
 *  · **Una corrida anulada devolvió la madera al patio**: no consume, no
 *    produce y su despacho no cuenta.
 *  · **Sin producción declarada el rendimiento es `null`, nunca 0 %**: un 0 %
 *    acusa una pérdida donde hay una jornada a medio terminar.
 *  · **El total de la guía se explica entero**: lo que no salió de este lote se
 *    nombra por el lote del que sí salió, y lo que no tiene lote va bajo `null`
 *    en vez de desaparecer.
 */
import { describe, expect, it } from "vitest";

import {
  construirHistoriaLote,
  type EntradaHistoriaLote,
  type CorridaHistoriaInput,
  type TrozaHistoriaInput,
} from "@/lib/forestal/historia-lote";

const lote = {
  id: "L1",
  code: "17-2026",
  speciesCommon: "TORNILLO",
  speciesScientific: "Cedrelinga cateniformis",
  status: "abierto",
  notes: null,
  tipoProductoConsumir: "rolliza",
  fechaApertura: "2026-09-01",
  fechaConsumo: null,
  inicioProceso: "2026-09-01",
  finProceso: null,
  createdBy: "blasadmin",
};

const troza = (over: Partial<TrozaHistoriaInput> = {}): TrozaHistoriaInput => ({
  id: Math.random().toString(36).slice(2),
  codificacion: "T-1",
  codigoPlanta: "P-1",
  especieComun: "TORNILLO",
  gtfNumber: "GTF-001",
  permiso: "PERM-1",
  d1Cm: 40,
  d2Cm: 42,
  largoM: 3,
  volumenM3: 0.5,
  consumidaEnId: null,
  despachadaEnId: null,
  noRecepcionada: false,
  descarte: false,
  ...over,
});

const corrida = (over: Partial<CorridaHistoriaInput> = {}): CorridaHistoriaInput => ({
  id: "C1",
  lineNo: 9,
  entryDate: "2026-09-02",
  productType: "MADERA ASERRADA (COMERCIAL)",
  speciesCommon: "TORNILLO",
  quantity: 2.5,
  unit: "m3",
  volumeInputM3: 5,
  status: "registrado",
  observations: null,
  paquetes: [{ id: "P1", codigo: "S1", productType: "MADERA ASERRADA (COMERCIAL)", presentacion: "PIEZAS", cantidad: 40, volumenM3: 2.5 }],
  ...over,
});

const base = (over: Partial<EntradaHistoriaLote> = {}): EntradaHistoriaLote => ({
  lote,
  trozas: [],
  corridas: [],
  origenes: [],
  despachos: [],
  corridasDeLotes: [],
  ...over,
});

describe("① armado: la pila que se apartó", () => {
  it("cuenta piezas, volumen y las guías sin repetir", () => {
    const h = construirHistoriaLote(
      base({
        trozas: [
          troza({ gtfNumber: "GTF-001", volumenM3: 0.5 }),
          troza({ gtfNumber: "GTF-001", volumenM3: 0.25 }),
          troza({ gtfNumber: "GTF-002", volumenM3: 1 }),
        ],
      }),
    );
    expect(h.armado.piezas).toBe(3);
    expect(h.armado.m3).toBe(1.75);
    expect(h.armado.guias).toEqual(["GTF-001", "GTF-002"]);
  });

  it("nombra las piezas que están en la pila pero no pueden ir a la sierra", () => {
    const h = construirHistoriaLote(
      base({
        trozas: [
          troza({ codigoPlanta: "A", noRecepcionada: true }),
          troza({ codigoPlanta: "B", descarte: true }),
          troza({ codigoPlanta: "C", despachadaEnId: "D9" }),
          troza({ codigoPlanta: "D" }),
        ],
      }),
    );
    expect(h.armado.fueraDeJuego.map((f) => f.codigo)).toEqual(["A", "B", "C"]);
    expect(h.armado.fueraDeJuego[0].motivo).toContain("no llegó");
  });
});

describe("② consumo: qué entró a la sierra", () => {
  it("atribuye las piezas a la corrida que se las comió", () => {
    const h = construirHistoriaLote(
      base({
        trozas: [troza({ consumidaEnId: "C1", volumenM3: 2 }), troza({ consumidaEnId: "C1", volumenM3: 3 }), troza()],
        corridas: [corrida()],
      }),
    );
    expect(h.consumo.piezasConsumidas).toBe(2);
    expect(h.consumo.corridas[0].piezasDelLote).toBe(2);
    expect(h.consumo.corridas[0].m3DelLote).toBe(5);
  });

  it("una corrida ANULADA no consume: la madera volvió a la pila", () => {
    const h = construirHistoriaLote(
      base({
        trozas: [troza({ consumidaEnId: "C1", volumenM3: 2 })],
        corridas: [corrida({ status: "anulado" })],
      }),
    );
    expect(h.consumo.corridas).toHaveLength(0);
    expect(h.consumo.m3Total).toBe(0);
    expect(h.consumo.piezasConsumidas).toBe(0);
  });

  it("una corrida abierta se marca y se declara como hueco", () => {
    const h = construirHistoriaLote(base({ corridas: [corrida({ quantity: null, lineNo: 9 })] }));
    expect(h.consumo.corridas[0].abierta).toBe(true);
    expect(h.huecos.join(" ")).toContain("N° 9");
  });
});

describe("③ producción: qué salió", () => {
  it("suma paquetes, piezas y calcula el rendimiento", () => {
    const h = construirHistoriaLote(base({ corridas: [corrida({ quantity: 2.5, volumeInputM3: 5 })] }));
    expect(h.produccion.paquetes).toBe(1);
    expect(h.produccion.piezas).toBe(40);
    expect(h.produccion.total).toEqual({ cantidad: 2.5, unit: "m3" });
    expect(h.produccion.rendimientoPct).toBe(50);
  });

  it("sin producción declarada el rendimiento es null, no 0 %", () => {
    const h = construirHistoriaLote(base({ corridas: [corrida({ quantity: null, paquetes: [] })] }));
    expect(h.produccion.rendimientoPct).toBeNull();
  });

  it("con unidades mezcladas no hay total ni rendimiento — y se dice", () => {
    const h = construirHistoriaLote(
      base({ corridas: [corrida({ id: "C1", unit: "m3" }), corrida({ id: "C2", unit: "pt", lineNo: 10 })] }),
    );
    expect(h.produccion.total).toBeNull();
    expect(h.produccion.rendimientoPct).toBeNull();
    expect(h.huecos.join(" ")).toContain("unidades distintas");
  });
});

describe("④ salida: con qué guía y junto a quién", () => {
  const conDespacho = (over: Partial<EntradaHistoriaLote> = {}) =>
    construirHistoriaLote(
      base({
        corridas: [corrida({ id: "C1", quantity: 10, volumeInputM3: 20 })],
        despachos: [
          { id: "D1", lineNo: 20, entryDate: "2026-09-12", gtfNumber: "019-001-0000123", destino: "Pucallpa", unit: "m3", status: "registrado" },
        ],
        origenes: [
          { despachoEntryId: "D1", produccionEntryId: "C1", quantity: 2.1 },
          { despachoEntryId: "D1", produccionEntryId: "C9", quantity: 12.4 },
          { despachoEntryId: "D1", produccionEntryId: "C8", quantity: 3.2 },
        ],
        corridasDeLotes: [
          { produccionEntryId: "C1", loteId: "L1", loteCode: "17-2026" },
          { produccionEntryId: "C9", loteId: "L2", loteCode: "15-2026" },
          { produccionEntryId: "C8", loteId: "L3", loteCode: "13-2026" },
        ],
        ...over,
      }),
    );

  it("separa lo de este lote del total de la guía", () => {
    const s = conDespacho().salida.despachos[0];
    expect(s.deEsteLote).toBe(2.1);
    expect(s.totalDeLaGuia).toBe(17.7);
    expect(s.gtfNumber).toBe("019-001-0000123");
    expect(s.destino).toBe("Pucallpa");
  });

  it("nombra a los compañeros de viaje, del que más llevó al que menos", () => {
    expect(conDespacho().salida.despachos[0].companeros).toEqual([
      { loteCode: "15-2026", cantidad: 12.4 },
      { loteCode: "13-2026", cantidad: 3.2 },
    ]);
  });

  it("una corrida sin lote de aserrío viaja bajo `null`, no desaparece", () => {
    const h = conDespacho({ corridasDeLotes: [{ produccionEntryId: "C1", loteId: "L1", loteCode: "17-2026" }] });
    const comp = h.salida.despachos[0].companeros;
    expect(comp).toEqual([{ loteCode: null, cantidad: 15.6 }]);
    // Y el total sigue cerrando: 2.1 propios + 15.6 ajenos = 17.7.
    expect(comp[0].cantidad + h.salida.despachos[0].deEsteLote).toBeCloseTo(17.7, 4);
  });

  it("un despacho ANULADO no cuenta: el producto sigue en la planta", () => {
    const h = conDespacho({
      despachos: [{ id: "D1", lineNo: 20, entryDate: "2026-09-12", gtfNumber: "G", destino: null, unit: "m3", status: "anulado" }],
    });
    expect(h.salida.despachos).toHaveLength(0);
    expect(h.salida.total).toBe(0);
  });

  it("una guía que no tocó este lote no aparece", () => {
    const h = conDespacho({ origenes: [{ despachoEntryId: "D1", produccionEntryId: "C9", quantity: 12.4 }] });
    expect(h.salida.despachos).toHaveLength(0);
  });

  it("con la corrida COMPARTIDA se marca y se declara el hueco — nunca se prorratea", () => {
    const h = conDespacho({
      corridasDeLotes: [
        { produccionEntryId: "C1", loteId: "L1", loteCode: "17-2026" },
        { produccionEntryId: "C1", loteId: "L2", loteCode: "15-2026" },
        { produccionEntryId: "C9", loteId: "L2", loteCode: "15-2026" },
        { produccionEntryId: "C8", loteId: "L3", loteCode: "13-2026" },
      ],
    });
    const s = h.salida.despachos[0];
    expect(s.compartida).toBe(true);
    // El número NO se reparte: sigue siendo el bruto de la atribución.
    expect(s.deEsteLote).toBe(2.1);
    expect(h.huecos.join(" ")).toContain("techo, no una medición");
  });

  it("el stock es lo producido menos lo salido, y nunca negativo", () => {
    expect(conDespacho().salida.enStock).toBe(7.9);
    const sobreDespacho = conDespacho({
      origenes: [{ despachoEntryId: "D1", produccionEntryId: "C1", quantity: 999 }],
    });
    expect(sobreDespacho.salida.enStock).toBe(0);
  });
});

describe("el caso real del tenant: lote 17-2026", () => {
  it("21 trozas, 5.411 m³ a la sierra, 2.5448 producidos, nada despachado", () => {
    const trozas = Array.from({ length: 21 }, () => troza({ consumidaEnId: "C1", volumenM3: 5.411 / 21 }));
    const h = construirHistoriaLote(
      base({ trozas, corridas: [corrida({ id: "C1", quantity: 2.5448, volumeInputM3: 5.411 })] }),
    );
    expect(h.armado.piezas).toBe(21);
    expect(h.consumo.m3Total).toBe(5.411);
    expect(h.produccion.total?.cantidad).toBe(2.5448);
    expect(h.produccion.rendimientoPct).toBeCloseTo(47.03, 1);
    expect(h.salida.despachos).toHaveLength(0);
    expect(h.salida.enStock).toBe(2.5448);
  });
});
