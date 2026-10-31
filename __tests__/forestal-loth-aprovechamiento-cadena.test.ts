/**
 * La cadena del aprovechamiento, el patio y la fecha de término (08-10 tarde).
 * Los dos casos grandes son las cifras REALES medidas el 08-10:
 *   · Blas 19-SEC/REG-PLT-2025-096 (plantación): 161,258 m³ registrados, 0
 *     talas, 22 trozas 20,303 m³ trozadas y despachadas, 0 recibidas.
 *   · main PO 12 (bosque): 185 m³ autorizados, 5,003 talados, 4,887 trozados,
 *     2,761 despachados, 2 trozas en patio (2,126 m³, la más vieja 133 días),
 *     despacho en la semana del 25/05, vigencia 15/01/2026 → 14/01/2027.
 */

import { describe, expect, it } from "vitest";
import { analizarAprovechamiento } from "@/lib/forestal/loth-aprovechamiento";
import {
  HECHOS_VACIOS,
  cadenaDelAprovechamiento,
  diaConAnio,
  entroConGuiaDe,
  hechosDeExtraccion,
  patioPasado,
  terminoDelAprovechamiento,
  type HechosAprovechamiento,
} from "@/lib/forestal/loth-aprovechamiento-cadena";
import type { ExtraccionResponse } from "@/lib/forestal/loth-extraccion-tipos";
import { cascadaDelPlan, type FilaBalanceCascada } from "@/lib/forestal/loth-saldo-cascada";

const fila = (species: string, autorizado: number, talado: number, trozado: number, movilizado: number, consumido = 0): FilaBalanceCascada => ({
  species, cites: false, autorizado, talado, trozado, movilizado, consumido,
});
const HOY = new Date("2026-10-08T17:00:00Z"); // mediodía en Lima
const paso = (a: { cadena: { id: string }[] }, id: string) => a.cadena.find((p) => p.id === id);

describe("Blas: 0 talas y 22 trozas que entraron con guía", () => {
  const hechos: HechosAprovechamiento = {
    recibidoM3: 0,
    recibidas: 0,
    patioTrozas: 0,
    patioDiasMasVieja: null,
    semanas: [{ semana: "2025-10-06", taladoM3: 0, trozadoM3: 20.303, despachadoM3: 20.303 }],
  };
  const a = analizarAprovechamiento({
    modo: "plantacion",
    cascada: cascadaDelPlan([fila("Tornillo", 161.258, 0, 20.303, 20.303)]),
    vigenciaDesde: null,
    vigenciaHasta: null,
    hechos,
    hoy: HOY,
  });

  it("la cadena no arranca en 0: «Entró con guía» lleva los 20,303 m³", () => {
    expect(a.entroConGuia).toBe(20.303);
    expect(a.cadena.map((p) => p.id)).toEqual(["base", "talado", "conGuia", "trozado", "despachado", "recibido"]);
    expect(paso(a, "base")).toMatchObject({ label: "Registrado", m3: 161.258, pctBase: 100 });
    expect(paso(a, "talado")).toMatchObject({ m3: 0, pctAnterior: 0, pctBase: 0 });
    expect(paso(a, "conGuia")).toMatchObject({ m3: 20.303, pctAnterior: null, pctBase: 12.6, entrada: true });
    // Trozado contra lo talado MÁS lo que entró: 100 %, no «—» por dividir entre 0.
    expect(paso(a, "trozado")).toMatchObject({ m3: 20.303, pctAnterior: 100, pctBase: 12.6 });
    expect(paso(a, "despachado")).toMatchObject({ m3: 20.303, pctAnterior: 100 });
    expect(paso(a, "recibido")).toMatchObject({ label: "Recibido en CTP", m3: 0, pctAnterior: 0 });
  });

  it("el % grande y el saldo cuentan lo que entró con guía (antes: 0 % con la barra pintada)", () => {
    expect(a.pct).toBe(12.6);
    expect(a.avance).toBe(20.303);
    expect(a.rotuloAvance).toBe("aprovechado");
    expect(a.saldo).toBe(140.955);
    // El saldo es el mismo tramo «En pie» de la barra.
    expect(a.tramos.find((t) => t.id === "enPie")?.m3).toBe(140.955);
  });

  it("patio vacío y término sin vigencia contra qué medir", () => {
    expect(a.patio).toEqual({ m3: 0, trozas: 0, diasMasVieja: null });
    expect(patioPasado(a.patio, 30)).toBe(false);
    // 20,303 m³ desde la semana del 06/10/2025: 368 días → 0,386 m³/semana.
    expect(a.termino.m3PorSemana).toBe(0.386);
    expect(a.termino.llega).toBeNull();
    expect(a.termino.detalle).toBe("Sin vigencia cargada: no hay cierre contra qué medir.");
    expect(a.estadoHechos).toBe("ok");
  });
});

describe("main PO 12 (bosque): cadena, patio viejo y no llega al cierre", () => {
  const hechos: HechosAprovechamiento = {
    recibidoM3: 0,
    recibidas: 0,
    patioTrozas: 2,
    patioDiasMasVieja: 133,
    semanas: [
      { semana: "2026-05-18", taladoM3: 0, trozadoM3: 0, despachadoM3: 0 },
      { semana: "2026-05-25", taladoM3: 5.003, trozadoM3: 4.887, despachadoM3: 2.761 },
    ],
  };
  const a = analizarAprovechamiento({
    modo: "bosque",
    cascada: cascadaDelPlan([fila("Tornillo", 185, 5.003, 4.887, 2.761)]),
    baseM3: 185,
    vigenciaDesde: "2026-01-15T00:00:00.000Z",
    vigenciaHasta: "2027-01-14T00:00:00.000Z",
    hechos,
    hoy: HOY,
  });

  it("cada paso con su % del anterior y de lo autorizado; sin «Entró con guía»", () => {
    expect(a.entroConGuia).toBe(0);
    expect(a.cadena.map((p) => p.id)).toEqual(["base", "talado", "trozado", "despachado", "recibido"]);
    expect(paso(a, "base")).toMatchObject({ label: "Autorizado", m3: 185 });
    expect(paso(a, "talado")).toMatchObject({ m3: 5.003, pctAnterior: 2.7, pctBase: 2.7 });
    expect(paso(a, "trozado")).toMatchObject({ m3: 4.887, pctAnterior: 97.7, pctBase: 2.6 });
    expect(paso(a, "despachado")).toMatchObject({ m3: 2.761, pctAnterior: 56.5, pctBase: 1.5 });
    expect(paso(a, "recibido")).toMatchObject({ m3: 0, pctAnterior: 0 });
    expect(a.rotuloAvance).toBe("movilizado");
  });

  it("patio: 2,126 m³ en 2 trozas; la más vieja (133 días) pasa el tope de 30", () => {
    expect(a.patio).toEqual({ m3: 2.126, trozas: 2, diasMasVieja: 133 });
    expect(patioPasado(a.patio, 30)).toBe(true);
    expect(patioPasado(a.patio, 133)).toBe(false); // el tope mismo no es «pasado»
  });

  it("término: 0,141 m³/semana desde el 25/05; no llega al 14/01/2027 y dice cuánto haría falta", () => {
    const t = a.termino;
    expect(t.desde).toBe("2026-05-25");
    expect(t.m3PorSemana).toBe(0.141);
    expect(t.llega).toBe(false);
    // 182,239 m³ en 98 días (14 semanas) hasta el cierre.
    expect(t.necesarioPorSemana).toBe(13.017);
    expect(t.titular).toMatch(/^0\.14 m³\/semana · terminas el \w+ \d\d\/\d\d\/2051$/);
    expect(t.detalle).toBe("No llegas al cierre (jueves 14/01/2027): te hacen falta 13.02 m³/semana.");
  });
});

describe("terminoDelAprovechamiento", () => {
  const base = { modo: "bosque" as const, nombreAvance: "movilizado", nombreBase: "autorizado", hoy: HOY };
  const semana = (s: string, desp: number) => ({ semana: s, taladoM3: 0, trozadoM3: 0, despachadoM3: desp });

  it("llega antes del cierre: cuántos días antes", () => {
    // 70 m³ en 10 semanas (desde el lunes 27/07 hasta el jueves 08/10 son 74 días) → 6,622 m³/semana.
    const t = terminoDelAprovechamiento({ ...base, avance: 70, saldo: 30, semanas: [semana("2026-07-27", 70)], vigenciaHasta: "2026-12-31" });
    expect(t.llega).toBe(true);
    expect(t.necesarioPorSemana).toBeNull();
    expect(t.detalle).toMatch(/^\d+ días antes del cierre \(jueves 31\/12\)\.$/);
  });

  it("menos de dos semanas desde el primer avance: ritmo en camino, sin fecha", () => {
    const t = terminoDelAprovechamiento({ ...base, avance: 5, saldo: 95, semanas: [semana("2026-10-05", 5)], vigenciaHasta: "2026-12-31" });
    expect(t.m3PorSemana).toBeNull();
    expect(t.fecha).toBeNull();
    expect(t.titular).toBe("Ritmo en camino");
  });

  it("sin avance: sin ritmo", () => {
    const t = terminoDelAprovechamiento({ ...base, avance: 0, saldo: 100, semanas: [], vigenciaHasta: "2026-12-31" });
    expect(t.titular).toBe("Sin ritmo todavía");
  });

  it("vigencia vencida: no llega y no pide un ritmo imposible", () => {
    const t = terminoDelAprovechamiento({ ...base, avance: 10, saldo: 90, semanas: [semana("2026-06-01", 10)], vigenciaHasta: "2026-09-30" });
    expect(t.llega).toBe(false);
    expect(t.necesarioPorSemana).toBeNull();
    expect(t.detalle).toBe("La vigencia cerró el miércoles 30/09.");
  });

  it("sin saldo: ya no queda", () => {
    const t = terminoDelAprovechamiento({ ...base, avance: 100, saldo: 0, semanas: [semana("2026-06-01", 100)], vigenciaHasta: "2026-12-31" });
    expect(t.titular).toMatch(/ya no queda saldo$/);
    expect(t.fecha).toBeNull();
  });

  it("plantación: el primer talado O trozado marca el inicio", () => {
    const t = terminoDelAprovechamiento({
      ...base,
      modo: "plantacion",
      avance: 20,
      saldo: 80,
      semanas: [{ semana: "2026-08-03", taladoM3: 0, trozadoM3: 20, despachadoM3: 0 }],
      vigenciaHasta: null,
    });
    expect(t.desde).toBe("2026-08-03");
  });
});

describe("piezas", () => {
  it("entró con guía: por especie, sobre la tolerancia; la merma de una no tapa a otra", () => {
    expect(entroConGuiaDe([{ taladoM3: 10, trozadoM3: 9 }, { taladoM3: 0, trozadoM3: 4 }])).toBe(4);
    expect(entroConGuiaDe([{ taladoM3: 10, trozadoM3: 10.005 }])).toBe(0);
  });

  it("recibido sin leer: «—» en la cadena, no un 0 inventado", () => {
    const c = cadenaDelAprovechamiento({ nombreBase: "autorizado", base: 100, talado: 50, conGuia: 0, trozado: 40, despachado: 30, recibido: null });
    expect(c.at(-1)).toMatchObject({ id: "recibido", m3: null, pctAnterior: null, pctBase: null });
  });

  it("sin `hechos`: el estado es «cargando» y el recibido queda sin dato", () => {
    const a = analizarAprovechamiento({
      modo: "bosque",
      cascada: cascadaDelPlan([fila("Tornillo", 100, 10, 10, 5)]),
      vigenciaDesde: null,
      vigenciaHasta: null,
      hoy: HOY,
    });
    expect(a.estadoHechos).toBe("cargando");
    expect(a.cadena.at(-1)?.m3).toBeNull();
    const conError = analizarAprovechamiento({
      modo: "bosque",
      cascada: cascadaDelPlan([fila("Tornillo", 100, 10, 10, 5)]),
      vigenciaDesde: null,
      vigenciaHasta: null,
      estadoHechos: "error",
      hoy: HOY,
    });
    expect(conError.estadoHechos).toBe("error");
  });

  it("hechosDeExtraccion toma recibido, patio y semanas de la Extracción", () => {
    const ex = {
      total: { recibido: { m3: 3.5, n: 4, sinVolumen: 0, m3Guia: 3.4 } },
      kpis: { trozasEnElMonte: { n: 2, m3: 2.126, diasMasVieja: 133 } },
      semanas: [{ semana: "2026-05-25", taladoM3: 5, trozadoM3: 4, despachadoM3: 2, taladoAcumM3: 5, metaAcumM3: null }],
    } as unknown as ExtraccionResponse;
    expect(hechosDeExtraccion(ex)).toEqual({
      recibidoM3: 3.5,
      recibidas: 4,
      patioTrozas: 2,
      patioDiasMasVieja: 133,
      semanas: [{ semana: "2026-05-25", taladoM3: 5, trozadoM3: 4, despachadoM3: 2 }],
    });
    expect(HECHOS_VACIOS.semanas).toEqual([]);
  });

  it("diaConAnio: el año sólo si no es el de hoy", () => {
    expect(diaConAnio("2026-09-10", "2026-10-08")).toBe("jueves 10/09");
    expect(diaConAnio("2027-01-14", "2026-10-08")).toBe("jueves 14/01/2027");
  });
});
