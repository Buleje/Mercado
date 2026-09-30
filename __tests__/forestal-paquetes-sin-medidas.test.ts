/**
 * Paquetes sin medidas → aviso del libro: qué medida falta y cómo se agrupa.
 *
 * El caso real (Blas, 30/09/2026): 34 de 835 paquetes sin alguna medida en 15
 * corridas de 2025-10, 2026-06, 2026-08 y 2026-09. Lo que no puede fallar:
 *   · «falta» es null, cero o negativa — igual que `escuadriaCompleta`;
 *   · un paquete con las tres medidas no entra, aunque la fila venga del servidor;
 *   · la corrida más reciente primero, y `SL-2` antes de `SL-10`;
 *   · un bloque por corrida, con sus paquetes juntos;
 *   · el texto dice QUÉ medida falta, y el año sólo aparece cuando no es el actual.
 */
import { describe, expect, it } from "vitest";
import {
  agruparPorCorrida,
  avisoDeRecorte,
  medidasQueFaltan,
  paquetesSinMedidas,
  resumenPaquetesSinMedidas,
  rotuloDeCorrida,
  textoMedidaQueFalta,
  type PaqueteConMedidas,
} from "@/lib/forestal/paquetes-sin-medidas";
import { escuadriaCompleta } from "@/lib/forestal/escuadria-del-paquete";

/** 30/09/2026 al mediodía en Lima. */
const HOY = new Date("2026-09-30T12:00:00-05:00");

const paquete = (x: Partial<PaqueteConMedidas> = {}): PaqueteConMedidas => ({
  id: "pq-1",
  codigo: "SL-7",
  ctpEntryId: "corrida-29",
  lineNo: 29,
  fecha: "2026-09-22",
  especie: "Cachimbo",
  producto: "MADERA ASERRADA (COMERCIAL)",
  cantidad: 12,
  volumenM3: 1.25,
  espesorCm: null,
  anchoCm: null,
  largoM: null,
  periodoCerrado: false,
  ...x,
});

describe("medidasQueFaltan — cuáles de las tres no están", () => {
  it("sin ninguna faltan las tres, en el orden en que se tipean", () => {
    expect(medidasQueFaltan({ espesorCm: null, anchoCm: null, largoM: null })).toEqual([
      "espesor",
      "ancho",
      "largo",
    ]);
  });

  it("dice exactamente cuál falta", () => {
    expect(medidasQueFaltan({ espesorCm: 5.08, anchoCm: 20.32, largoM: null })).toEqual(["largo"]);
    expect(medidasQueFaltan({ espesorCm: null, anchoCm: 20.32, largoM: 1.52 })).toEqual(["espesor"]);
    expect(medidasQueFaltan({ espesorCm: 5.08, anchoCm: null, largoM: null })).toEqual(["ancho", "largo"]);
  });

  it("completa → nada falta", () => {
    expect(medidasQueFaltan({ espesorCm: 5.08, anchoCm: 20.32, largoM: 1.52 })).toEqual([]);
  });

  it("cero y negativa no son una medida (la vara de escuadriaCompleta)", () => {
    expect(medidasQueFaltan({ espesorCm: 0, anchoCm: -1, largoM: 1.52 })).toEqual(["espesor", "ancho"]);
    expect(medidasQueFaltan({ espesorCm: Number.NaN, anchoCm: 20, largoM: 1 })).toEqual(["espesor"]);
  });

  it("coincide con escuadriaCompleta: el aviso y el resto del libro no se contradicen", () => {
    const casos = [
      { espesorCm: null, anchoCm: null, largoM: null },
      { espesorCm: 5.08, anchoCm: null, largoM: 1.52 },
      { espesorCm: 0, anchoCm: 20.32, largoM: 1.52 },
      { espesorCm: 5.08, anchoCm: 20.32, largoM: 1.52 },
    ];
    for (const c of casos) {
      expect(medidasQueFaltan(c).length === 0).toBe(escuadriaCompleta(c));
    }
  });
});

describe("paquetesSinMedidas — sólo los incompletos, en orden de lectura", () => {
  it("descarta los que tienen las tres medidas, aunque la fila venga del servidor", () => {
    const r = paquetesSinMedidas([
      paquete({ id: "completo", codigo: "SL-1", espesorCm: 5.08, anchoCm: 20.32, largoM: 1.52 }),
      paquete({ id: "sin-largo", codigo: "SL-2", espesorCm: 5.08, anchoCm: 20.32 }),
    ]);
    expect(r.map((p) => p.id)).toEqual(["sin-largo"]);
    expect(r[0].faltan).toEqual(["largo"]);
  });

  it("la corrida más reciente primero (la madera que todavía se puede medir)", () => {
    const r = paquetesSinMedidas([
      paquete({ id: "oct-25", ctpEntryId: "c-12", lineNo: 12, fecha: "2025-10-14" }),
      paquete({ id: "sep-26", ctpEntryId: "c-29", lineNo: 29, fecha: "2026-09-22" }),
      paquete({ id: "jun-26", ctpEntryId: "c-20", lineNo: 20, fecha: "2026-06-03" }),
    ]);
    expect(r.map((p) => p.id)).toEqual(["sep-26", "jun-26", "oct-25"]);
  });

  it("dentro de la corrida, por código con los números en su orden natural", () => {
    const r = paquetesSinMedidas([
      paquete({ id: "a", codigo: "SL-10" }),
      paquete({ id: "b", codigo: "SL-2" }),
      paquete({ id: "c", codigo: "SL-1" }),
    ]);
    expect(r.map((p) => p.codigo)).toEqual(["SL-1", "SL-2", "SL-10"]);
  });

  it("dos corridas del mismo día se separan por N.º, sin intercalar sus paquetes", () => {
    const r = paquetesSinMedidas([
      paquete({ id: "a1", codigo: "A-1", ctpEntryId: "c-3", lineNo: 3 }),
      paquete({ id: "b1", codigo: "B-1", ctpEntryId: "c-4", lineNo: 4 }),
      paquete({ id: "a2", codigo: "A-2", ctpEntryId: "c-3", lineNo: 3 }),
    ]);
    expect(r.map((p) => p.id)).toEqual(["b1", "a1", "a2"]);
  });

  it("sin filas → sin avisos", () => {
    expect(paquetesSinMedidas([])).toEqual([]);
  });
});

describe("agruparPorCorrida — un bloque por corrida", () => {
  it("junta los paquetes de la misma corrida y conserva el orden", () => {
    const grupos = agruparPorCorrida(
      paquetesSinMedidas([
        paquete({ id: "a", codigo: "SL-7", ctpEntryId: "c-29", lineNo: 29, fecha: "2026-09-22" }),
        paquete({ id: "b", codigo: "55", ctpEntryId: "c-15", lineNo: 15, fecha: "2025-10-14" }),
        paquete({ id: "c", codigo: "SL-8", ctpEntryId: "c-29", lineNo: 29, fecha: "2026-09-22" }),
      ]),
    );
    expect(grupos.map((g) => [g.lineNo, g.paquetes.map((p) => p.codigo)])).toEqual([
      [29, ["SL-7", "SL-8"]],
      [15, ["55"]],
    ]);
    expect(grupos[0]).toMatchObject({ ctpEntryId: "c-29", fecha: "2026-09-22", especie: "Cachimbo" });
  });

  it("el total de paquetes se conserva al agrupar", () => {
    const filas = Array.from({ length: 7 }, (_, i) =>
      paquete({ id: `p${i}`, codigo: `P-${i}`, ctpEntryId: `c-${i % 3}`, lineNo: i % 3 }),
    );
    const grupos = agruparPorCorrida(paquetesSinMedidas(filas));
    expect(grupos).toHaveLength(3);
    expect(grupos.reduce((n, g) => n + g.paquetes.length, 0)).toBe(7);
  });
});

describe("los textos que lee el operador", () => {
  it("dice qué medida falta, con concordancia", () => {
    expect(textoMedidaQueFalta(["largo"])).toBe("Falta el largo");
    expect(textoMedidaQueFalta(["espesor"])).toBe("Falta el espesor");
    expect(textoMedidaQueFalta(["espesor", "ancho"])).toBe("Faltan el espesor y el ancho");
    expect(textoMedidaQueFalta(["ancho", "largo"])).toBe("Faltan el ancho y el largo");
    expect(textoMedidaQueFalta(["espesor", "ancho", "largo"])).toBe("Faltan las tres medidas");
  });

  it("el resumen, en singular y plural", () => {
    expect(resumenPaquetesSinMedidas(1)).toBe("1 paquete sin medidas");
    expect(resumenPaquetesSinMedidas(34)).toBe("34 paquetes sin medidas");
  });

  it("el rótulo de la corrida: N.º y día con nombre; el año sólo si no es el actual", () => {
    expect(rotuloDeCorrida({ lineNo: 29, fecha: "2026-09-22" }, HOY)).toBe("Corrida N.º 29 · martes 22/09");
    expect(rotuloDeCorrida({ lineNo: 12, fecha: "2025-10-14" }, HOY)).toBe(
      "Corrida N.º 12 · martes 14/10/2025",
    );
  });

  it("el año actual se mide en Lima: a las 23:30 del 31/12 en Pucallpa ya es 2027 en UTC", () => {
    const finDeAnio = new Date("2026-12-31T23:30:00-05:00");
    expect(finDeAnio.toISOString().slice(0, 4)).toBe("2027"); // la trampa
    expect(rotuloDeCorrida({ lineNo: 1, fecha: "2026-12-30" }, finDeAnio)).toBe(
      "Corrida N.º 1 · miércoles 30/12",
    );
  });

  it("avisa cuando la lista está recortada, y calla cuando entra entera", () => {
    expect(avisoDeRecorte(100, 240)).toMatch(/100 de 240/);
    expect(avisoDeRecorte(34, 34)).toBeNull();
  });
});
