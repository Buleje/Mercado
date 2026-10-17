/**
 * «Para poner al día» (ficha del permiso): qué paso toca, cuántos faltan en
 * cada uno y —sobre todo— qué corridas «esperan» a los pasos 1-2 y cuáles no
 * tienen arreglo acá. Los números del escenario grande son los de Blas,
 * 10-HUA-PUE/PER-FMP-2026-007, medidos el 25-09 (sólo lectura).
 */

import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { ContextoDeLlegada } from "@/lib/forestal/fecha-de-llegada";
import {
  armarPuestaAlDia,
  guiasRecibidasDelPermiso,
  hayGuiasDeVariasEspecies,
  resumirDescontar,
  resumirFecha,
  resumirPrecio,
  resumirTrozas,
  textoDelActual,
  TROZAS_SIN_NADA,
  type EntradaPuestaAlDia,
  type ResumenDescontar,
  type ResumenFecha,
} from "@/lib/forestal/puesta-al-dia-del-permiso";
import { planDescontar, type FilaDeGuia } from "@/lib/forestal/vincular-desde-permiso";
import type { CorridaDelPermiso } from "@/lib/forestal/volumen-del-permiso";

const ctx = (o: Partial<ContextoDeLlegada> = {}): ContextoDeLlegada => ({
  gtfNumber: "010-001-0000005",
  asientos: 1,
  guia: "2026-08-31",
  asiento: "2026-09-08",
  recepcion: "2026-09-23",
  recepcionPareja: true,
  filasSinRecibir: [],
  registradoEl: "2026-09-08T15:33:00.000Z",
  especies: ["Cachimbo"],
  permiso: "10-HUA-PUE/PER-FMP-2026-007",
  corridas: [{ especie: "Cachimbo", dia: "2026-09-07" }],
  piezasAserradas: [],
  mesesDeAsientos: ["2026-09"],
  mesesCerrados: [],
  congelado: false,
  ...o,
});

const listo = <T,>(valor: T) => ({ estado: "listo" as const, valor });
const FECHA_OK: ResumenFecha = { sospechosas: [], sinRecibir: [], recibidasEl: [], sierraDesde: null, sinRevisar: 0 };
const NADA_QUE_DESCONTAR: ResumenDescontar = { corridas: 0, ya: 0, porFecha: 0, porFila: 0, sinMadera: 0, otras: 0 };

/** Blas, FMP-2026-007 (25-09): 8 guías, 29 trozas, 21 filas sin precio, 30 corridas y ninguna se puede ya. */
const BLAS: EntradaPuestaAlDia = {
  fecha: listo({
    sospechosas: ["0000005", "0000006", "0000007", "0000008", "0000009", "0000010", "0000013", "0000014"],
    sinRecibir: [],
    recibidasEl: ["2026-09-11", "2026-09-23"],
    sierraDesde: "2026-09-07",
    sinRevisar: 0,
  }),
  trozas: listo({ mover: 29, m3: 76.706, guias: 8, quietas: 0, sinFila: 0 }),
  precio: { sinPrecio: 21, m3SinPrecio: 135.587, filas: 21 },
  descontar: listo({ corridas: 30, ya: 0, porFecha: 20, porFila: 1, sinMadera: 9, otras: 0 }),
};

describe("resumirFecha — paso 1", () => {
  it("cuenta como sospechosa la guía recibida DESPUÉS de una corrida de su especie", () => {
    const r = resumirFecha(["010-001-0000005"], [ctx()]);
    expect(r.sospechosas).toEqual(["010-001-0000005"]);
    expect(r.recibidasEl).toEqual(["2026-09-23"]);
    expect(r.sierraDesde).toBe("2026-09-07");
  });

  it("el mismo día no es sospechoso (se descarga a la mañana, se asierra a la tarde)", () => {
    const r = resumirFecha(["g"], [ctx({ gtfNumber: "g", recepcion: "2026-09-07" })]);
    expect(r.sospechosas).toEqual([]);
  });

  it("una corrida de OTRA especie no vuelve sospechosa a la guía", () => {
    const r = resumirFecha(["g"], [ctx({ gtfNumber: "g", corridas: [{ especie: "Tornillo", dia: "2026-09-01" }] })]);
    expect(r.sospechosas).toEqual([]);
  });

  it("separa las que siguen sin recibir y no da por buena la que no se pudo revisar", () => {
    const r = resumirFecha(["a", "b", "c"], [ctx({ gtfNumber: "a", recepcion: null }), ctx({ gtfNumber: "b" })]);
    expect(r.sinRecibir).toEqual(["a"]);
    expect(r.sospechosas).toEqual(["b"]);
    expect(r.sinRevisar).toBe(1);
  });
});

describe("resúmenes de los pasos 2 y 3", () => {
  it("«Acomodar» sólo tiene a dónde mover en una GTF de dos o más filas", () => {
    expect(hayGuiasDeVariasEspecies([{ gtf: "A" }, { gtf: "B" }])).toBe(false);
    expect(hayGuiasDeVariasEspecies([{ gtf: "A" }, { gtf: "B" }, { gtf: " A " }])).toBe(true);
  });

  it("toma los totales de la vista previa", () => {
    const r = resumirTrozas({
      totales: {
        guias: 8, guiasConCambios: 8, trozas: 46, mover: 29, m3Mover: 76.706, quietas: 2, sinFila: 1,
        bienPuestas: 17, filasQueCuadranAntes: 0, filasQueCuadranDespues: 21, filas: 21,
      },
    });
    expect(r).toEqual({ mover: 29, m3: 76.706, guias: 8, quietas: 2, sinFila: 1 });
  });

  it("sin precio = costo null (como `balance().madera.sinValorizar`); un 0 cargado no es «sin precio»", () => {
    const r = resumirPrecio([
      { m3: 1.5, costo: null },
      { m3: 2.25, costo: undefined },
      { m3: 3, costo: 0 },
      { m3: 4, costo: 720 },
    ]);
    expect(r).toEqual({ sinPrecio: 2, m3SinPrecio: 3.75, filas: 4 });
  });
});

describe("resumirDescontar — paso 4, con el plan real de «Descontar la madera usada»", () => {
  const corrida = (o: Partial<CorridaDelPermiso>): CorridaDelPermiso => ({
    id: "c1", lineNo: 1, fecha: "2026-09-07T00:00:00.000Z", especie: "Cachimbo", tipo: null, cantidad: 0.5,
    unidad: "m3", piezas: 10, m3: 0.5, origen: "atada", parte: 1, m3DelPermiso: 0.5, consumidoM3: 0,
    guias: [], lote: null, despachadoM3: 0, ...o,
  });
  const troza = (o: Partial<TrozaConsumible>): TrozaConsumible => ({
    id: "t1", woodEntryId: "w-cach", codificacion: null, codigoPlanta: "115-A", especieComun: "Cachimbo",
    largoM: 5, volumenM3: 2.808, gtfNumber: "0000005", fechaRecepcion: "2026-09-23", guiaRecepcionada: true,
    permiso: "FMP-2026-007", loteAserrioId: null, consumidaEnId: null, ...o,
  });
  const filas: FilaDeGuia[] = [
    { id: "w-cach", gtf: "0000005", especie: "Cachimbo", m3: 20, consumidoM3: 0 },
    { id: "w-copal", gtf: "0000005", especie: "Copal", m3: 20, consumidoM3: 0 },
  ];

  it("la madera recibida DESPUÉS de la corrida → espera al paso 1", () => {
    const plan = planDescontar([corrida({})], [troza({})], [], filas);
    expect(resumirDescontar(plan)).toMatchObject({ corridas: 1, ya: 0, porFecha: 1 });
  });

  it("sus trozas colgadas de la fila de otra especie → espera al paso 2", () => {
    const plan = planDescontar(
      [corrida({ fecha: "2026-09-24T00:00:00.000Z" })],
      [troza({ woodEntryId: "w-copal" })],
      [],
      filas,
    );
    expect(resumirDescontar(plan)).toMatchObject({ corridas: 1, ya: 0, porFila: 1 });
  });

  it("especie que no entró por este permiso → sin madera (no la arregla ni el 1 ni el 2)", () => {
    const plan = planDescontar([corrida({ especie: "Tacho" })], [troza({})], [], filas);
    expect(resumirDescontar(plan)).toMatchObject({ corridas: 1, ya: 0, sinMadera: 1 });
  });

  it("troza de su especie, en su fila y ya en el patio → se puede ya", () => {
    const plan = planDescontar([corrida({ fecha: "2026-09-24T00:00:00.000Z" })], [troza({})], [], filas);
    expect(resumirDescontar(plan)).toMatchObject({ corridas: 1, ya: 1 });
  });

  it("una corrida sin volumen cuenta en el total, apartada", () => {
    const plan = planDescontar([corrida({ m3: null })], [], [], filas);
    expect(resumirDescontar(plan)).toMatchObject({ corridas: 1, otras: 1 });
  });
});

describe("armarPuestaAlDia", () => {
  it("Blas FMP-2026-007: 1 de 4, con las cuatro cifras y el paso 4 esperando", () => {
    const l = armarPuestaAlDia(BLAS);
    expect(textoDelActual(l)).toBe("1 de 4: corrige la fecha de llegada de 8 guías");
    expect(l.pasos.map((p) => [p.estado, p.faltan])).toEqual([
      ["pendiente", 8],
      ["pendiente", 29],
      ["pendiente", 21],
      ["espera", 30],
    ]);
    expect(l.pasos[0]!.detalle).toBe("Figuran recibidas el 11/09 y 23/09, y la sierra ya cortaba su madera desde el 07/09");
    expect(l.pasos[3]!.detalle).toBe(
      "0 se pueden ya · 21 esperan los pasos 1 y 2 · 9 sin madera de este permiso que les alcance",
    );
    expect(l.pasos[3]!.accion).toBe("Ver por qué");
    expect(l.pasos.filter((p) => p.soloAdmin).map((p) => p.numero)).toEqual([1, 2, 3]);
  });

  it("hecho el paso 1, pasa a «2 de 4» y ya no cuenta la fecha como espera", () => {
    const l = armarPuestaAlDia({ ...BLAS, fecha: listo(FECHA_OK) });
    expect(l.pasos[0]!.estado).toBe("hecho");
    expect(textoDelActual(l)).toBe("2 de 4: acomoda 29 trozas en la fila de su especie");
    /* Si la fecha ya está bien y la corrida sigue antes de su madera, salió de otra guía: no «espera». */
    expect(l.pasos[3]!.detalle).toBe("0 se pueden ya · 1 espera el paso 2 · 29 sin madera de este permiso que les alcance");
  });

  it("el precio es aparte: con 1 y 2 hechos y corridas que ya se pueden, toca el 3 y el 4 ofrece descontar", () => {
    const l = armarPuestaAlDia({
      ...BLAS,
      fecha: listo(FECHA_OK),
      trozas: listo(TROZAS_SIN_NADA),
      descontar: listo({ corridas: 30, ya: 21, porFecha: 0, porFila: 0, sinMadera: 9, otras: 0 }),
    });
    expect(textoDelActual(l)).toBe("3 de 4: pon precio a 21 ingresos");
    expect(l.pasos[3]).toMatchObject({ estado: "pendiente", accion: "Descontar 21" });
  });

  it("sólo lo que no se arregla acá → el paso 4 queda «revisar», no «espera»", () => {
    const l = armarPuestaAlDia({
      fecha: listo(FECHA_OK),
      trozas: listo(TROZAS_SIN_NADA),
      precio: { sinPrecio: 0, m3SinPrecio: 0, filas: 3 },
      descontar: listo({ corridas: 9, ya: 0, porFecha: 0, porFila: 0, sinMadera: 9, otras: 0 }),
    });
    expect(l.actual?.clave).toBe("descontar");
    expect(l.pasos[3]!.estado).toBe("revisar");
  });

  it("todo hecho: al día, sin paso actual", () => {
    const l = armarPuestaAlDia({
      fecha: listo(FECHA_OK),
      trozas: listo(TROZAS_SIN_NADA),
      precio: { sinPrecio: 0, m3SinPrecio: 0, filas: 21 },
      descontar: listo(NADA_QUE_DESCONTAR),
    });
    expect(l.alDia).toBe(true);
    expect(l.actual).toBeNull();
    expect(textoDelActual(l)).toBeNull();
  });

  it("mientras la fecha carga, el «n de 4» no salta al paso 2 (dice que revisa)", () => {
    const l = armarPuestaAlDia({ ...BLAS, fecha: { estado: "cargando" } });
    expect(l.actual?.clave).toBe("fecha");
    expect(textoDelActual(l)).toBe("Revisando el permiso…");
    expect(l.alDia).toBe(false);
  });

  it("un error de lectura se dice, no se da el paso por hecho", () => {
    const l = armarPuestaAlDia({ ...BLAS, trozas: { estado: "error", mensaje: "HTTP 500" } });
    expect(l.pasos[1]).toMatchObject({ estado: "error", detalle: "No se pudo revisar: HTTP 500" });
  });

  it("guías sin recibir: el paso 1 lo dice sin botón (se reciben en Ingresos)", () => {
    const l = armarPuestaAlDia({ ...BLAS, fecha: listo({ ...FECHA_OK, sinRecibir: ["019-001-0000004"] }) });
    expect(l.pasos[0]).toMatchObject({ estado: "revisar", faltan: 1, accion: null });
  });
});

describe("guiasRecibidasDelPermiso — las candidatas de «Corregir la recepción»", () => {
  it("una por GTF, sólo las recibidas, con las fechas del servidor", () => {
    const guias = [
      { id: "w1", gtf: "0000005", proveedor: "Comunidad Puerto", fecha: "2026-09-23T00:00:00.000Z" },
      { id: "w2", gtf: "0000005", proveedor: null, fecha: "2026-09-23T00:00:00.000Z" },
      { id: "w3", gtf: "0000009", proveedor: "Comunidad Puerto", fecha: "2026-09-08T00:00:00.000Z" },
    ];
    const r = guiasRecibidasDelPermiso(guias, [
      ctx({ gtfNumber: "0000005" }),
      ctx({ gtfNumber: "0000009", recepcion: null }),
    ]);
    expect(r).toEqual([
      {
        clave: "0000005",
        gtfNumber: "0000005",
        providerName: "Comunidad Puerto",
        gtfDate: "2026-08-31",
        entryDate: "2026-09-08",
        lineas: [
          { id: "w1", fechaRecepcion: "2026-09-23" },
          { id: "w2", fechaRecepcion: "2026-09-23" },
        ],
      },
    ]);
  });
});
