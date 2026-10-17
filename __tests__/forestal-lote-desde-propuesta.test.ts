/**
 * De la propuesta al lote, y del lote al rendimiento — con las filas de Blas.
 *
 * Los números salen del tenant real `inversiones-agroforestales-blas-sociedad-anonima`
 * medido el 2026-09-15 (`SELECT` sobre `WoodEntryTroza` + `ForestCtpEntry`):
 *
 *   · 160 trozas / 197,646 m³ en el patio, TODAS sin `loteAserrioId`.
 *   · el Tornillo sin lote viene de DOS títulos habilitantes:
 *     `19-SEC/REG-PLT-2018-020` (49 trozas) y `19-SEC/REG-PLT-2021-017` (65).
 *   · las corridas 15-19 declaran `volumeInputM3` y rinden 52,66 a 55,27 %.
 *   · las corridas 20-28 declaran producto y no tienen entrada ni rendimiento.
 */
import { describe, expect, it } from "vitest";

import { proponerVinculacion } from "@/lib/forestal/propuesta-de-vinculacion";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  notaDelLote,
  planearLoteDesdePropuesta,
  type LoteDestino,
} from "@/lib/forestal/lote-desde-propuesta";
import { pasaElTope, rendimientoDeCorrida, TOPE_RENDIMIENTO_PCT } from "@/lib/forestal/vincular-produccion";

const PERMISO_2018 = "19-SEC/REG-PLT-2018-020";
const PERMISO_2021 = "19-SEC/REG-PLT-2021-017";
const PERMISO_FMP = "10-HUA-PUE/PER-FMP-2026-007";

/** La whitelist real de `/trozas/patio`, con los campos que deciden. */
const troza = (
  p: Partial<TrozaConsumible> & { id: string; codificacion: string; volumenM3: number },
): TrozaConsumible => ({
  woodEntryId: "we-13",
  codigoPlanta: null,
  especieComun: "Tornillo",
  largoM: 8.5,
  gtfNumber: "019-001-0000013",
  permiso: PERMISO_2018,
  guiaRecepcionada: true,
  fechaIngreso: "2026-08-20",
  noRecepcionada: false,
  descarte: false,
  retrozos: 0,
  consumidaEnId: null,
  despachadaEnId: null,
  loteAserrioId: null,
  loteAserrioCode: null,
  ...p,
});

const CORRIDA = { lineNo: 20, especie: "Tornillo", fecha: "2026-08-01" };

describe("armar el lote desde la propuesta", () => {
  it("todas las trozas sueltas: propone CREAR el lote con su especie y su permiso", () => {
    const patio = [
      troza({ id: "t1", codificacion: "115-A", volumenM3: 2.808 }),
      troza({ id: "t2", codificacion: "115-B", volumenM3: 2.153 }),
    ];
    const propuesta = proponerVinculacion({ especie: "Tornillo", producidoM3: 2.5 }, ["115-A", "115-B"], patio);
    expect(propuesta.sinLote).toHaveLength(2);

    const { plan, impedimento, avisos } = planearLoteDesdePropuesta(propuesta, CORRIDA, []);
    expect(impedimento).toBeNull();
    expect(avisos).toEqual([]);
    expect(plan).toMatchObject({
      accion: "crear",
      loteId: null,
      especie: "Tornillo",
      permiso: PERMISO_2018,
      trozaIds: ["t1", "t2"],
      volumenM3: 4.961,
      guias: ["019-001-0000013"],
    });
    /* La nota dice de dónde salió: un lote sin explicación nadie lo borra. */
    expect(notaDelLote(plan!, CORRIDA)).toContain("corrida N° 20");
    expect(notaDelLote(plan!, CORRIDA)).toContain("019-001-0000013");
  });

  it("si alguna troza YA está en un lote abierto, agrega las sueltas ahí (no abre otro)", () => {
    const patio = [
      troza({ id: "t1", codificacion: "115-A", volumenM3: 2.808, loteAserrioId: "L1", loteAserrioCode: "LA-2026-010" }),
      troza({ id: "t2", codificacion: "115-B", volumenM3: 2.153 }),
    ];
    const lotes: LoteDestino[] = [{ id: "L1", code: "LA-2026-010", speciesCommon: "Tornillo", status: "abierto" }];
    const propuesta = proponerVinculacion({ especie: "Tornillo", producidoM3: 2.5 }, ["115-A", "115-B"], patio);

    const { plan, impedimento } = planearLoteDesdePropuesta(propuesta, CORRIDA, lotes);
    expect(impedimento).toBeNull();
    expect(plan).toMatchObject({ accion: "agregar", loteId: "L1", loteCode: "LA-2026-010", trozaIds: ["t2"] });
    /* Repartir la vinculación en dos lotes no se puede deshacer: por eso se
       juntan en el que ya tiene madera en vez de abrir uno nuevo. */
    expect(plan?.volumenM3).toBe(2.153);
  });

  it("dos títulos habilitantes NO se mezclan en un lote y los dos se nombran (ADR-393)", () => {
    const patio = [
      troza({ id: "t1", codificacion: "115-A", volumenM3: 2.808 }),
      troza({ id: "t2", codificacion: "220-C", volumenM3: 3.1, permiso: PERMISO_2021, gtfNumber: "019-001-0000003" }),
    ];
    const propuesta = proponerVinculacion({ especie: "Tornillo", producidoM3: 2.5 }, ["115-A", "220-C"], patio);

    const { plan, impedimento } = planearLoteDesdePropuesta(propuesta, CORRIDA, []);
    expect(plan).toBeNull();
    expect(impedimento).toContain(PERMISO_2018);
    expect(impedimento).toContain(PERMISO_2021);
    expect(impedimento).toMatch(/Un lote es de un permiso/i);
  });

  it("dos maderas tampoco: un lote es de una especie (L-A1)", () => {
    const patio = [
      troza({ id: "t1", codificacion: "115-A", volumenM3: 2.808, especieComun: null, permiso: PERMISO_FMP }),
      troza({ id: "t2", codificacion: "300-K", volumenM3: 2.149, especieComun: "Cachimbo", permiso: PERMISO_FMP }),
      troza({ id: "t3", codificacion: "300-L", volumenM3: 1.752, especieComun: "Copal", permiso: PERMISO_FMP }),
    ];
    /* Sin especie declarada en la corrida: la comparación cae sobre las trozas. */
    const propuesta = proponerVinculacion({ especie: null, producidoM3: 1 }, ["300-K", "300-L"], patio);
    const { plan, impedimento } = planearLoteDesdePropuesta(propuesta, { ...CORRIDA, especie: null }, []);
    expect(plan).toBeNull();
    expect(impedimento).toContain("Cachimbo");
    expect(impedimento).toContain("Copal");
  });

  it("una troza de otra madera que la corrida frena el armado, no lo hace en silencio", () => {
    const patio = [troza({ id: "t9", codificacion: "300-K", volumenM3: 2.149, especieComun: "Cachimbo", permiso: PERMISO_FMP })];
    const propuesta = proponerVinculacion({ especie: "Tornillo", producidoM3: 1 }, ["300-K"], patio);
    const { plan, impedimento } = planearLoteDesdePropuesta(propuesta, CORRIDA, []);
    expect(plan).toBeNull();
    expect(impedimento).toMatch(/otra madera/i);
  });

  it("sin trozas sueltas no hay nada que armar y no se inventa un botón", () => {
    const patio = [
      troza({ id: "t1", codificacion: "115-A", volumenM3: 2.808, loteAserrioId: "L1", loteAserrioCode: "LA-2026-010" }),
    ];
    const lotes: LoteDestino[] = [{ id: "L1", code: "LA-2026-010", speciesCommon: "Tornillo", status: "abierto" }];
    const propuesta = proponerVinculacion({ especie: "Tornillo", producidoM3: 1 }, ["115-A"], patio);
    const { plan, impedimento } = planearLoteDesdePropuesta(propuesta, CORRIDA, lotes);
    expect(plan).toBeNull();
    expect(impedimento).toMatch(/ya están apartadas/i);
  });

  it("las trozas apartadas en un lote CERRADO quedan fuera, y se dice", () => {
    const patio = [
      troza({ id: "t1", codificacion: "115-A", volumenM3: 2.808, loteAserrioId: "L9", loteAserrioCode: "17-2026" }),
      troza({ id: "t2", codificacion: "115-B", volumenM3: 2.153 }),
    ];
    /* `17-2026` existe en Blas y está consumido: no admite piezas nuevas. */
    const lotes: LoteDestino[] = [{ id: "L9", code: "17-2026", speciesCommon: "Tornillo", status: "consumido" }];
    const propuesta = proponerVinculacion({ especie: "Tornillo", producidoM3: 1 }, ["115-A", "115-B"], patio);
    const { plan, avisos } = planearLoteDesdePropuesta(propuesta, CORRIDA, lotes);
    expect(plan?.accion).toBe("crear");
    expect(avisos.join(" ")).toMatch(/quedan fuera de esta vinculación/i);
  });

  it("trozas sin título habilitante: el lote nace sin permiso y lo avisa", () => {
    const patio = [troza({ id: "t1", codificacion: "115-A", volumenM3: 2.808, permiso: null })];
    const propuesta = proponerVinculacion({ especie: "Tornillo", producidoM3: 1 }, ["115-A"], patio);
    const { plan, avisos } = planearLoteDesdePropuesta(propuesta, CORRIDA, []);
    expect(plan?.permiso).toBeNull();
    expect(avisos.join(" ")).toMatch(/sin permiso/i);
  });
});

describe("el rendimiento que se escribe al vincular", () => {
  it("reproduce el de las corridas ya asentadas en Blas (52-55 %)", () => {
    /* Las cinco filas del libro real: si la fórmula cambiara, esto lo grita. */
    expect(rendimientoDeCorrida(15.211, 27.522, "m3")).toBe(55.27);
    expect(rendimientoDeCorrida(2.982, 5.411, "m3")).toBe(55.11);
    expect(rendimientoDeCorrida(3.51, 6.381, "m3")).toBe(55.01);
    expect(rendimientoDeCorrida(35.647, 67.691, "m3")).toBe(52.66);
    expect(rendimientoDeCorrida(19.103, 35.257, "m3")).toBe(54.18);
    expect([55.27, 55.11, 55.01, 52.66, 54.18].every((r) => !pasaElTope(r))).toBe(true);
  });

  it("por encima del tope se GUARDA el número real: se avisa, no se corrige", () => {
    /* Corrida 20 de Blas (3,814 m³ declarados) contra una sola troza de 5,422. */
    const pct = rendimientoDeCorrida(3.814, 5.422, "m3");
    expect(pct).toBe(70.34);
    expect(pct).toBeGreaterThan(TOPE_RENDIMIENTO_PCT);
    expect(pasaElTope(pct)).toBe(true);
  });

  it("no inventa el número cuando no se puede dividir", () => {
    /* Declarada en pie tablar: PT ÷ m³ no es un rendimiento. */
    expect(rendimientoDeCorrida(3000, 27.522, "pt")).toBeNull();
    /* Corrida abierta (todavía sin declarar) y corrida sin materia prima. */
    expect(rendimientoDeCorrida(null, 27.522, "m3")).toBeNull();
    expect(rendimientoDeCorrida(15.211, 0, "m3")).toBeNull();
    expect(rendimientoDeCorrida(15.211, null, "m3")).toBeNull();
  });
});
