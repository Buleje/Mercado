/**
 * «Descontar la madera usada» desde la ficha del permiso.
 *
 * Lo que se prueba: el agrupado por especie, qué trozas se ofrecen y —sobre
 * todo, desde la revisión del 25-09 con los datos de Blas— lo que FRENA:
 *  · la troza recibida DESPUÉS de la corrida (regla 4, que estaba muerta);
 *  · la troza anotada en la fila de guía de OTRA especie, y la que haría pasar
 *    lo que declara su fila (I2 es por fila: el servidor cortaba la tanda);
 *  · la troza de otro permiso que un lote «de todos» trae;
 * y que la corrida que pasa el 56 % quede marcada antes de firmar.
 */

import { describe, expect, it } from "vitest";
import { fechaIngresoDeTroza, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  bloqueadasDelLote,
  clasificarTrozas,
  corridaEnTanda,
  notaDelLoteDelPermiso,
  ordenarTrozas,
  permisoDeTrozas,
  planDescontar,
  repartoDelGrupo,
  trozaAVincular,
  type FilaDeGuia,
} from "@/lib/forestal/vincular-desde-permiso";
import { lineasDeFreno, rangoDeFechas } from "@/lib/forestal/vincular-desde-permiso-frenos";
import { repartirEnTanda } from "@/lib/forestal/vincular-en-tanda";
import type { CorridaDelPermiso } from "@/lib/forestal/volumen-del-permiso";

const corrida = (o: Partial<CorridaDelPermiso> = {}): CorridaDelPermiso => ({
  id: "c1",
  lineNo: 1,
  fecha: "2026-09-20T00:00:00.000Z",
  especie: "Capirona",
  tipo: "MADERA ASERRADA (COMERCIAL)",
  cantidad: 0.9,
  unidad: "m3",
  piezas: 30,
  m3: 0.9,
  origen: "atada",
  parte: 1,
  m3DelPermiso: 0.9,
  consumidoM3: 0,
  guias: [],
  lote: null,
  despachadoM3: 0,
  ...o,
});

const troza = (o: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id: "t1",
  woodEntryId: "w1",
  codificacion: null,
  codigoPlanta: "310",
  especieComun: "Capirona",
  largoM: 5,
  volumenM3: 1,
  gtfNumber: "001-0000203",
  fechaRecepcion: "2026-08-06",
  guiaRecepcionada: true,
  permiso: "CON-25-PAS-0033",
  loteAserrioId: null,
  consumidaEnId: null,
  ...o,
});

/** La fila de guía de Capirona con cupo de sobra, salvo que se diga otra cosa. */
const FILA: FilaDeGuia = { id: "w1", gtf: "001-0000203", especie: "Capirona", m3: 100, consumidoM3: 0 };

const lote = (o: Partial<LoteAserrio> = {}): LoteAserrio =>
  ({ id: "L1", code: "LA-2026-060", speciesCommon: "Capirona", status: "abierto", trozas: [], ...o }) as LoteAserrio;

/* Las cinco trozas de Capirona de CON-25-PAS-0033 en `main` (SELECT 25-09). */
const CINCO = [
  troza({ id: "a", codigoPlanta: "310", volumenM3: 1.0799 }),
  troza({ id: "b", codigoPlanta: "311", volumenM3: 0.8808 }),
  troza({ id: "c", codigoPlanta: "312", volumenM3: 1.48 }),
  troza({ id: "d", codigoPlanta: "313", volumenM3: 0.7406 }),
  troza({ id: "e", codigoPlanta: "314", volumenM3: 0.6055 }),
];

describe("planDescontar — agrupado por especie", () => {
  it("junta las corridas por especie aunque la escriban distinto", () => {
    const p = planDescontar([corrida({ id: "x" }), corrida({ id: "y", especie: "CAPIRONA " })], CINCO, [], [FILA]);
    expect(p.grupos).toHaveLength(1);
    expect(p.grupos[0]!.corridas.map((c) => c.id)).toEqual(["x", "y"]);
    expect(p.grupos[0]!.declaradoM3).toBe(1.8);
  });

  it("aparta las que no pasan a m³ y las que no dicen especie", () => {
    const p = planDescontar(
      [corrida({ id: "kg", m3: null, unidad: "kg" }), corrida({ id: "sin", especie: null }), corrida()],
      CINCO,
      [],
      [FILA],
    );
    expect(p.apartadas.map((a) => [a.id, a.motivo])).toEqual([
      ["kg", "sin-volumen"],
      ["sin", "sin-especie"],
    ]);
  });

  it("dice las trozas sin corrida de su especie (Huayruro ≠ Huayruro Negro)", () => {
    const p = planDescontar(
      [corrida({ especie: "Huayruro Negro" })],
      [troza({ id: "h1", especieComun: "Huayruro", volumenM3: 3.2 }), troza({ id: "h2", especieComun: "Huayruro", volumenM3: 3.5 })],
      [],
      [{ ...FILA, especie: "Huayruro" }],
    );
    expect(p.grupos[0]!.ofrecibles).toEqual([]);
    expect(p.trozasSinCorrida).toEqual([{ especie: "Huayruro", trozas: 2, m3: 6.7 }]);
    expect(lineasDeFreno(p.grupos[0]!).map((l) => l.clave)).toEqual(["sin-trozas"]);
  });
});

describe("FRENA por fecha: la troza recibida después de la corrida no se ofrece", () => {
  it("guía recibida el 23/09 contra corrida del 07/09 → no se ofrece, con motivo y camino", () => {
    const p = planDescontar(
      [corrida({ id: "n32", lineNo: 32, fecha: "2026-09-07", m3: 1 })],
      [troza({ id: "232A", fechaRecepcion: null, guiaFechaRecepcion: "2026-09-23T05:00:00.000Z", fechaIngreso: "2026-09-05", volumenM3: 3 })],
      [],
      [FILA],
    );
    const g = p.grupos[0]!;
    expect(g.ofrecibles).toEqual([]);
    expect(g.reparto[0]!.frena).toBe("fecha");
    expect(g.sugeridas).toEqual([]);
    const [linea] = lineasDeFreno(g);
    expect(linea!.texto).toBe(
      "Las trozas de Capirona figuran recibidas el 23/09, después de esta corrida (07/09). Corrige la fecha de recepción de la guía en Ingresos.",
    );
  });

  it("prefiere las trozas que sí pueden ir: la vieja a la corrida vieja, la nueva a la nueva", () => {
    const p = planDescontar(
      [corrida({ id: "vieja", lineNo: 1, fecha: "2026-09-08", m3: 1 }), corrida({ id: "nueva", lineNo: 2, fecha: "2026-09-24", m3: 1 })],
      [
        troza({ id: "tarde", codigoPlanta: "1", fechaRecepcion: "2026-09-23", volumenM3: 2 }),
        troza({ id: "temprano", codigoPlanta: "2", fechaRecepcion: "2026-09-01", volumenM3: 2 }),
      ],
      [],
      [FILA],
    );
    const g = p.grupos[0]!;
    expect(g.ofrecibles.map((c) => c.id)).toEqual(["vieja", "nueva"]);
    const r = repartirEnTanda(
      g.ofrecibles,
      { code: "L", especie: "Capirona", status: "abierto" },
      g.libres.map((t) => trozaAVincular(t, fechaIngresoDeTroza(t))),
      { rendimientoMeta: 0.56 },
    );
    expect(r.filas.map((f) => f.trozas.map((t) => t.id))).toEqual([["temprano"], ["tarde"]]);
    expect(r.filas.every((f) => f.revision.puedeVincular)).toBe(true);
  });

  it("la fecha de ingreso es la de la troza, si no la de su guía, si no el asiento", () => {
    expect(fechaIngresoDeTroza({ fechaRecepcion: "2026-09-10", guiaFechaRecepcion: "2026-09-23", fechaIngreso: "2026-09-01" })).toBe("2026-09-10");
    expect(fechaIngresoDeTroza({ fechaRecepcion: null, guiaFechaRecepcion: "2026-09-23T05:00:00Z", fechaIngreso: "2026-09-01" })).toBe("2026-09-23");
    expect(fechaIngresoDeTroza({ fechaRecepcion: null, guiaFechaRecepcion: null, fechaIngreso: "2026-09-01" })).toBe("2026-09-01");
  });

  it("una fecha leída directo de la base (Date) se normaliza al día UTC, como el servidor", () => {
    const deLaBase = new Date("2026-09-23T05:00:00.000Z") as unknown as string;
    expect(fechaIngresoDeTroza({ fechaRecepcion: deLaBase, guiaFechaRecepcion: null, fechaIngreso: null })).toBe("2026-09-23");
    expect(fechaIngresoDeTroza({ fechaRecepcion: null, guiaFechaRecepcion: null, fechaIngreso: null })).toBeNull();
  });

  it("en la tanda, sin madera por fecha se dice como fecha, no como «se acabó»", () => {
    const r = repartirEnTanda(
      [corridaEnTanda(corrida({ fecha: "2026-09-07" }))],
      { code: "L", especie: "Capirona", status: "abierto" },
      [trozaAVincular(troza(), "2026-09-23")],
    );
    expect(r.filas[0]!.alcanzo).toBe(false);
    expect(r.filas[0]!.sinMadera).toBe("fecha");
  });
});

describe("FRENA por la fila de la guía (I2 es por fila)", () => {
  it("dos trozas colgadas de una fila que declara 1,752 m³: la que la haría pasar queda fuera", () => {
    const fila: FilaDeGuia = { id: "w5", gtf: "0000005", especie: "Cachimbo", m3: 1.752, consumidoM3: 0 };
    const { aptas, fuera } = clasificarTrozas(
      [
        troza({ id: "115-A", codigoPlanta: "115-A", woodEntryId: "w5", especieComun: "Cachimbo", volumenM3: 1.2 }),
        troza({ id: "115-B", codigoPlanta: "115-B", woodEntryId: "w5", especieComun: "Cachimbo", volumenM3: 0.9 }),
      ],
      [fila],
    );
    expect(aptas.map((t) => t.id)).toEqual(["115-A"]);
    expect(fuera.map((t) => [t.id, t.motivo])).toEqual([["115-B", "fila-llena"]]);
  });

  it("la troza de Cachimbo colgada de la fila de Copal no se ofrece, y se dice dónde se arregla", () => {
    const p = planDescontar(
      [corrida({ especie: "Cachimbo", m3: 1 })],
      [troza({ id: "115-A", woodEntryId: "w5", especieComun: "Cachimbo", volumenM3: 2.808, gtfNumber: "0000005" })],
      [],
      [{ id: "w5", gtf: "0000005", especie: "Copal", m3: 1.752, consumidoM3: 0 }],
    );
    const g = p.grupos[0]!;
    expect(g.ofrecibles).toEqual([]);
    expect(g.fuera.map((t) => t.motivo)).toEqual(["otra-fila"]);
    expect(lineasDeFreno(g).map((l) => l.texto)).toEqual([
      "1 troza de Cachimbo está anotada en la fila de Copal de su guía: acomódalas con «Acomodar trozas» en Ingresos antes de descontarlas.",
    ]);
  });

  it("cuenta lo que la fila ya consumió", () => {
    const { fuera } = clasificarTrozas([troza({ volumenM3: 1 })], [{ ...FILA, m3: 5, consumidoM3: 4.5 }]);
    expect(fuera.map((t) => t.motivo)).toEqual(["fila-llena"]);
  });
});

describe("FRENA por otro permiso", () => {
  it("una troza cuya guía no es de este contrato queda fuera", () => {
    const { aptas, fuera } = clasificarTrozas([troza({ id: "ajena", woodEntryId: "w-otro" })], [FILA]);
    expect(aptas).toEqual([]);
    expect(fuera.map((t) => [t.id, t.motivo])).toEqual([["ajena", "otro-permiso"]]);
  });

  it("en un lote «de todos», la tanda recibe bloqueada la pieza de otro permiso", () => {
    const l = lote({
      trozas: [
        { id: "mia", codificacion: null, codigoPlanta: "1", volumenM3: 2, consumidaEnId: null },
        { id: "ajena", codificacion: null, codigoPlanta: "2", volumenM3: 2, consumidaEnId: null },
      ],
    });
    const p = planDescontar([corrida()], [troza({ id: "mia", loteAserrioId: "L1", volumenM3: 2 })], [l], [FILA]);
    expect(bloqueadasDelLote(l, p)).toEqual({ ajena: "es de otro permiso" });
    expect(p.grupos[0]!.lotes).toEqual([{ id: "L1", code: "LA-2026-060", piezas: 1, m3: 2 }]);
  });

  it("en un lote, la pieza del permiso que NO está en el patio (guía por recepcionar) llega bloqueada", () => {
    const l = lote({
      trozas: [
        { id: "mia", codificacion: null, codigoPlanta: "1", volumenM3: 2, consumidaEnId: null },
        { id: "sin-recibir", codificacion: null, codigoPlanta: "2", volumenM3: 2, consumidaEnId: null },
      ],
    });
    const p = planDescontar(
      [corrida()],
      [
        troza({ id: "mia", loteAserrioId: "L1", volumenM3: 2 }),
        troza({ id: "sin-recibir", loteAserrioId: "L1", volumenM3: 2, guiaRecepcionada: false }),
      ],
      [l],
      [FILA],
    );
    expect(bloqueadasDelLote(l, p)).toEqual({
      "sin-recibir": "no está en el patio (por recepcionar, ya salió o no se puede aserrar)",
    });
  });
});

describe("el 56 % se mira corrida por corrida", () => {
  it("la corrida que rinde 70 % queda marcada (se firma igual, pero se ve antes)", () => {
    /* 1,4 m³ de aserrada y una sola troza de 2 m³: 70 %. */
    const p = planDescontar([corrida({ m3: 1.4 })], [troza({ volumenM3: 2 })], [], [FILA]);
    const r = p.grupos[0]!.reparto[0]!;
    expect(r.frena).toBeNull();
    expect(r.rendimientoPct).toBe(70);
    expect(r.pasaElTope).toBe(true);
    expect(p.grupos[0]!.alcanza).toBe(false);
  });

  it("elige las que cubren lo declarado ÷ 0,56 y no el patio entero", () => {
    const p = planDescontar(
      [corrida({ id: "c1", lineNo: 1, m3: 0.9 }), corrida({ id: "c2", lineNo: 2, fecha: "2026-09-22", m3: 1.05 })],
      CINCO,
      [],
      [FILA],
    );
    const g = p.grupos[0]!;
    expect(g.sugeridas).toEqual(["a", "b", "c", "d"]);
    expect(g.sugeridasM3).toBe(4.1813);
    expect(g.alcanza).toBe(true);
    expect(g.reparto.map((r) => r.rendimientoPct)).toEqual([49.44, 44.48]);
    expect(g.reparto.some((r) => r.pasaElTope)).toBe(false);
  });

  it("dos pasadas: con madera justa las tres quedan vinculadas, aunque pasen el 56 %", () => {
    const corridas = ["c1", "c2", "c3"].map((id, k) =>
      corridaEnTanda(corrida({ id, lineNo: k + 1, m3: 1, fecha: `2026-09-0${k + 1}` })),
    );
    const r = repartirEnTanda(
      corridas,
      { code: "L", especie: "Capirona", status: "abierto" },
      ["x", "y", "z"].map((id) => trozaAVincular({ id, volumenM3: 1.5, largoM: 5 })),
      { rendimientoMeta: 0.56 },
    );
    expect(r.vinculables).toBe(3);
    expect(r.filas.map((f) => f.trozas.map((t) => t.id))).toEqual([["x"], ["y"], ["z"]]);
  });

  it("sin la meta, el reparto de Producción no cambia: cubre lo producido y nada más", () => {
    const r = repartirEnTanda(
      [corridaEnTanda(corrida({ m3: 0.9 }))],
      { code: "L", especie: "Capirona", status: "abierto" },
      ordenarTrozas(CINCO).map((t) => trozaAVincular(t)),
    );
    expect(r.filas[0]!.trozas.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("orden, permiso, nota y fechas", () => {
  it("ordena por fecha de ingreso y después por código numérico", () => {
    const o = ordenarTrozas([
      troza({ id: "n10", codigoPlanta: "10", fechaRecepcion: "2026-09-11" }),
      troza({ id: "n9", codigoPlanta: "9", fechaRecepcion: "2026-09-11" }),
      troza({ id: "vieja", codigoPlanta: "99", fechaRecepcion: "2026-08-01" }),
    ]);
    expect(o.map((t) => t.id)).toEqual(["vieja", "n9", "n10"]);
  });

  it("el permiso del lote es el de sus trozas, o ninguno si mezclan", () => {
    expect(permisoDeTrozas([troza(), troza({ id: "t2" })])).toBe("CON-25-PAS-0033");
    expect(permisoDeTrozas([troza(), troza({ id: "t2", permiso: "OTRO" })])).toBeNull();
  });

  it("la nota nombra el permiso y las corridas que se vinculan", () => {
    const g = { ofrecibles: [corridaEnTanda(corrida({ lineNo: 95101 })), corridaEnTanda(corrida({ id: "c2", lineNo: 95102 }))] };
    expect(notaDelLoteDelPermiso("CON-25-PAS-0033", g, 4, 4.18134)).toBe(
      "Armado desde la ficha del permiso CON-25-PAS-0033 para 2 corridas sin materia prima (N° 95101, 95102) · 4 trozas · 4.1813 m³",
    );
  });

  it("el rango de fechas se escribe como en el aserradero", () => {
    expect(rangoDeFechas(["2026-09-22", "2026-09-07"])).toBe("07-22/09");
    expect(rangoDeFechas(["2026-08-28", "2026-09-05"])).toBe("28/08 al 05/09");
    expect(rangoDeFechas(["2026-09-07"])).toBe("07/09");
  });
});

describe("la tarjeta recalcula con lo tildado sin mentir el motivo", () => {
  it("una selección vacía no dice «no hay trozas» si las hay: dice la fecha", () => {
    const p = planDescontar(
      [corrida({ lineNo: 95098, fecha: "2026-09-22", m3: 0.2 })],
      [troza({ id: "t1", fechaRecepcion: "2026-09-24", volumenM3: 0.7 })],
      [],
      [FILA],
    );
    const g = p.grupos[0]!;
    expect(g.reparto[0]!.frena).toBe("fecha");
    const { reparto } = repartoDelGrupo(g.corridas, g.especie, [], undefined, { desde: g.trozasDesde, hayAptas: true });
    expect(reparto[0]!.frena).toBe("fecha");
    expect(lineasDeFreno({ ...g, reparto }).map((l) => l.clave)).toEqual(["fecha"]);
  });
});
