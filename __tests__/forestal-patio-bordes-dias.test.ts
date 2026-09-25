/**
 * Un tronco, un color (ADR-431, C2): en los bordes 14/15/29/30/59/60 días, la
 * KPI de Consumos (`resumenPatio.anejas`), el tramo de la columna/filtro
 * (`tramoDeDias`), la pestaña Trozas (`tramoDe`, `antiguedadDelPatio`) y la
 * tira de pendientes (`TROZAS_VARADAS_DIAS`) tienen que decir lo mismo.
 *
 * Antes: una troza de 15 días era «añeja» en la KPI y «fresca» en el tramo;
 * una de 30 caía en «16-30» en un lado y en «30 a 59» en el otro; una de 60 era
 * «varada» en la tira y no en el Aging.
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  DIAS_PATIO_ANEJO,
  SEVERIDAD_TRAMO_DIAS,
  TRAMOS_DIAS_PATIO,
  diasEnPatio,
  filtrarPatio,
  resumenPatio,
  tramoDeDias,
  tramoDeTroza,
} from "@/lib/forestal/patio-resumen";
import {
  TRAMOS_ANTIGUEDAD,
  antiguedadDelPatio,
  estadoDeTroza,
  resumirPatio,
  tramoDe,
  type TrozaPatio,
} from "@/lib/forestal/trozas-patio";
import { TROZAS_VARADAS_DIAS } from "@/lib/forestal/ctp-pendientes";

/** 12:00 en Lima = 17:00 UTC: el día UTC y el de Lima coinciden. */
const AHORA = new Date("2026-09-24T12:00:00-05:00");
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString();

const consumible = (dias: number, over: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id: `c${dias}`,
  woodEntryId: "w1",
  codificacion: "1",
  especieComun: "Tornillo",
  volumenM3: 1,
  fechaIngreso: haceDias(dias),
  ...over,
});

const pieza = (dias: number, over: Partial<TrozaPatio> = {}): TrozaPatio => ({
  id: `p${dias}`,
  especieComun: "Tornillo",
  volumenM3: 1,
  gtfNumber: "G-1",
  fechaIngreso: haceDias(dias),
  consumidaEnId: null,
  despachadaEnId: null,
  noRecepcionada: false,
  descarte: false,
  retrozos: 0,
  trozaOrigenId: null,
  loteAserrioCode: null,
  ...over,
});

describe("los bordes coinciden en todas las superficies", () => {
  it.each([
    [14, "hasta15", false, false],
    [15, "16a30", true, false],
    [29, "16a30", true, false],
    [30, "31a60", true, false],
    [59, "31a60", true, false],
    [60, "mas60", true, true],
  ] as const)("%i días → %s (añeja=%s, varada=%s)", (dias, tramo, anejo, varada) => {
    const t = consumible(dias);
    expect(diasEnPatio(t, AHORA)).toBe(dias);
    expect(tramoDeDias(dias)).toBe(tramo);
    expect(tramoDeTroza(t, AHORA)).toBe(tramo);
    // KPI de Consumos
    expect(resumenPatio([t], AHORA).anejas).toBe(anejo ? 1 : 0);
    // Pestaña Trozas: el mismo tramo, por la misma clave
    expect(tramoDe(dias)).toBe(tramo);
    const edad = antiguedadDelPatio([pieza(dias)], AHORA);
    expect(edad.tramos.find((x) => x.piezas === 1)?.key).toBe(tramo);
    // Tira de pendientes: «varada» desde el MISMO día que el último tramo
    expect(dias >= TROZAS_VARADAS_DIAS).toBe(varada);
    expect(SEVERIDAD_TRAMO_DIAS[tramo]).toBe(varada ? "varada" : anejo ? "añeja" : "fresca");
  });

  it("las constantes salen de UNA escala", () => {
    expect(TRAMOS_DIAS_PATIO).toEqual([15, 30, 60]);
    expect(DIAS_PATIO_ANEJO).toBe(TRAMOS_DIAS_PATIO[0]);
    expect(TROZAS_VARADAS_DIAS).toBe(TRAMOS_DIAS_PATIO[2]);
    expect(TRAMOS_ANTIGUEDAD.map((x) => [x.key, x.desde, x.hasta])).toEqual([
      ["hasta15", 0, 14],
      ["16a30", 15, 29],
      ["31a60", 30, 59],
      ["mas60", 60, Number.POSITIVE_INFINITY],
    ]);
  });

  it("por día UTC, no por milisegundos: recibida ayer a última hora son 1 día, no 0", () => {
    const t = consumible(0, { fechaIngreso: null, fechaRecepcion: "2026-09-23T23:30:00.000Z" });
    expect(diasEnPatio(t, AHORA)).toBe(1);
  });
});

describe("lo por recepcionar no cuenta días en el patio (C7)", () => {
  const t = consumible(70, { guiaRecepcionada: false });

  it("sin días ni tramo, y fuera de cualquier filtro de tramo", () => {
    expect(diasEnPatio(t, AHORA)).toBeNull();
    expect(tramoDeTroza(t, AHORA)).toBeNull();
    expect(filtrarPatio([t], { tramos: ["mas60"] }, AHORA)).toEqual([]);
  });

  it("no suma añejas ni la espera máxima de la KPI", () => {
    const r = resumenPatio([t, consumible(3)], AHORA);
    expect(r.anejas).toBe(0);
    expect(r.esperaMaxDias).toBe(3);
    expect(r.sinRecepcionar).toBe(1);
    expect(r.enPatioPiezas).toBe(1);
  });

  it("la pestaña Trozas la llama «Por recepcionar» y no la cuenta en el patio (C1)", () => {
    const p = pieza(70, { guiaRecepcionada: false });
    expect(estadoDeTroza(p)).toBe("por_recepcionar");
    expect(resumirPatio([p, pieza(3)]).enPatio.piezas).toBe(1);
    expect(antiguedadDelPatio([p], AHORA).tramos.every((x) => x.piezas === 0)).toBe(true);
  });
});
