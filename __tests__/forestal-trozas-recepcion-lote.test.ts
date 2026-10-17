import { describe, it, expect } from "vitest";
import {
  codigosRepetidos,
  fecharRecepcion,
  limpiarCodigos,
  marcarRecepcion,
  numerarTrozas,
  ordenarTrozas,
  resumenRecepcion,
} from "@/lib/forestal/trozas-recepcion";
import type { TrozaImportada } from "@/lib/forestal/trozas-import";

/**
 * ADR-336 — las tres cosas que se hacen con el camión en el patio, EN LOTE:
 * cuáles llegaron, qué día llegaron y con qué número las marca el centro.
 *
 * Lo que estos tests protegen no es la comodidad: es que el código de planta
 * sea ÚNICO. Es la marca física que se pinta sobre la troza — dos piezas con el
 * mismo número son dos piezas que el patio no puede distinguir, y el libro
 * quedó con 61 códigos repetidos por no tener este guard.
 */

const troza = (over: Partial<TrozaImportada> = {}): TrozaImportada => ({
  orden: 1,
  codificacion: "85/A",
  especieComun: "Copaiba",
  especieCientifica: "Copaifera reticulata Ducke",
  dimensiones: null,
  largoM: 3.2,
  diametroCm: 88,
  d1Cm: 91,
  d2Cm: 85,
  cantidad: 1,
  volumenM3: 1.946,
  ...over,
});

const lista = (n: number, over: (i: number) => Partial<TrozaImportada> = () => ({})): TrozaImportada[] =>
  Array.from({ length: n }, (_, i) => troza({ orden: i + 1, codificacion: `85/${i + 1}`, ...over(i) }));

describe("numerar con el correlativo del centro", () => {
  it("asigna correlativos desde el próximo libre y no pisa lo tipeado a mano", () => {
    const t = [troza({ orden: 1 }), troza({ orden: 2, codigoPlanta: "3037999" }), troza({ orden: 3 })];
    const r = numerarTrozas(t, { desde: 3037752 });
    expect(r.trozas.map((x) => x.codigoPlanta)).toEqual(["3037752", "3037999", "3037753"]);
    expect(r.asignados).toBe(2);
  });

  it("SALTEA los códigos que ya existen en el libro", () => {
    const t = lista(3);
    const r = numerarTrozas(t, { desde: 100, ocupados: ["100", "101"] });
    expect(r.trozas.map((x) => x.codigoPlanta)).toEqual(["102", "103", "104"]);
  });

  it("no numera lo que no llegó: el código se pinta sobre la troza", () => {
    const t = [troza({ orden: 1 }), troza({ orden: 2, noRecepcionada: true }), troza({ orden: 3 })];
    const r = numerarTrozas(t, { desde: 10 });
    expect(r.trozas.map((x) => x.codigoPlanta)).toEqual(["10", undefined, "11"]);
    expect(r.asignados).toBe(2);
  });

  it("numera SOLO la selección cuando se pide", () => {
    const t = lista(4);
    const r = numerarTrozas(t, { desde: 50, seleccion: new Set([1, 3]) });
    expect(r.trozas.map((x) => x.codigoPlanta)).toEqual([undefined, "50", undefined, "51"]);
  });

  it("con pisarExistentes renumera y libera el código viejo para reusarlo", () => {
    const t = [troza({ orden: 1, codigoPlanta: "7" }), troza({ orden: 2, codigoPlanta: "9" })];
    const r = numerarTrozas(t, { desde: 7, pisarExistentes: true });
    expect(r.trozas.map((x) => x.codigoPlanta)).toEqual(["7", "8"]);
  });

  it("nunca genera dos veces el mismo número en la misma lista", () => {
    const t = lista(60);
    const r = numerarTrozas(t, { desde: 1, ocupados: ["5", "6", "7"] });
    const codigos = r.trozas.map((x) => x.codigoPlanta!);
    expect(new Set(codigos).size).toBe(60);
    expect(codigos).not.toContain("5");
  });
});

describe("códigos repetidos dentro de la lista", () => {
  it("detecta el mismo código en dos piezas, ignorando mayúsculas y espacios", () => {
    const t = [
      troza({ orden: 1, codigoPlanta: "a-12" }),
      troza({ orden: 2, codigoPlanta: " A-12 " }),
      troza({ orden: 3, codigoPlanta: "b-1" }),
    ];
    expect([...codigosRepetidos(t)]).toEqual(["A-12"]);
  });

  it("los vacíos no cuentan como repetidos", () => {
    const t = [troza({ orden: 1 }), troza({ orden: 2, codigoPlanta: "" }), troza({ orden: 3, codigoPlanta: null })];
    expect(codigosRepetidos(t).size).toBe(0);
  });
});

describe("marcar y fechar en lote", () => {
  it("marcar «no llegó» borra la fecha de recepción", () => {
    const t = [troza({ orden: 1, fechaRecepcion: "2026-08-05" })];
    expect(marcarRecepcion(t, undefined, false)[0]!.fechaRecepcion).toBeNull();
    expect(marcarRecepcion(t, undefined, false)[0]!.noRecepcionada).toBe(true);
  });

  it("la fecha no se le pone a lo que no llegó", () => {
    const t = [troza({ orden: 1 }), troza({ orden: 2, noRecepcionada: true })];
    const r = fecharRecepcion(t, undefined, "2026-08-05");
    expect(r[0]!.fechaRecepcion).toBe("2026-08-05");
    expect(r[1]!.fechaRecepcion).toBeUndefined();
  });

  it("sin selección aplica a todas; con selección solo a esas", () => {
    const t = lista(3);
    expect(fecharRecepcion(t, new Set([2]), "2026-08-05").map((x) => x.fechaRecepcion))
      .toEqual([undefined, undefined, "2026-08-05"]);
  });

  it("limpiar códigos deja la selección lista para renumerar", () => {
    const t = [troza({ orden: 1, codigoPlanta: "1" }), troza({ orden: 2, codigoPlanta: "2" })];
    expect(limpiarCodigos(t, new Set([0])).map((x) => x.codigoPlanta)).toEqual([null, "2"]);
  });
});

describe("orden de la lista", () => {
  it("ordena los códigos como los lee una persona (2 antes que 10)", () => {
    const t = [
      troza({ orden: 1, codificacion: "10/A" }),
      troza({ orden: 2, codificacion: "2/A" }),
      troza({ orden: 3, codificacion: "1/A" }),
    ];
    expect(ordenarTrozas(t, "codificacion", "asc").map((x) => x.codificacion)).toEqual(["1/A", "2/A", "10/A"]);
  });

  it("los vacíos van al final en las DOS direcciones", () => {
    const t = [
      troza({ orden: 1, codigoPlanta: null }),
      troza({ orden: 2, codigoPlanta: "5" }),
      troza({ orden: 3, codigoPlanta: "1" }),
    ];
    expect(ordenarTrozas(t, "codigoPlanta", "asc").map((x) => x.codigoPlanta)).toEqual(["1", "5", null]);
    expect(ordenarTrozas(t, "codigoPlanta", "desc").map((x) => x.codigoPlanta)).toEqual(["5", "1", null]);
  });

  it("no muta la lista original: el orden del documento se tiene que poder recuperar", () => {
    const t = lista(3, (i) => ({ volumenM3: 3 - i }));
    const antes = t.map((x) => x.orden);
    ordenarTrozas(t, "volumenM3", "asc");
    expect(t.map((x) => x.orden)).toEqual(antes);
  });

  it("«pendientes primero» pone arriba las que no llegaron", () => {
    const t = [troza({ orden: 1 }), troza({ orden: 2, noRecepcionada: true }), troza({ orden: 3 })];
    expect(ordenarTrozas(t, "recepcion", "asc").map((x) => x.orden)).toEqual([2, 1, 3]);
  });
});

describe("resumen de la recepción", () => {
  it("cuenta lo que entra, lo que falta y lo que quedó sin marcar", () => {
    const t = [
      troza({ orden: 1, volumenM3: 2, codigoPlanta: "1", fechaRecepcion: "2026-08-05" }),
      troza({ orden: 2, volumenM3: 3 }),
      troza({ orden: 3, volumenM3: 1.5, noRecepcionada: true }),
      troza({ orden: 4, volumenM3: 1, codigoPlanta: "1" }),
    ];
    const r = resumenRecepcion(t);
    expect(r.declaradas).toBe(4);
    expect(r.recibidas).toBe(3);
    expect(r.faltantes).toBe(1);
    expect(r.m3Declarado).toBe(7.5);
    expect(r.m3Recibido).toBe(6);
    expect(r.sinCodigo).toBe(1);
    expect(r.sinFecha).toBe(2);
    expect(r.repetidos).toEqual(["1"]);
  });
});
