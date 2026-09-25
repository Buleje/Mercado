/**
 * __tests__/ctp-recepcion-en-bloque.test.ts
 *
 * Recibir en bloque existe porque en el tenant real **21 de 24 guías** estaban
 * sin recepcionar y eso dejaba 153 de 160 trozas (181 m³) fuera del alcance del
 * cubicador. Pero recibir es declarar que alguien miró la pila, así que el
 * bloque no puede ser un «marcar todo y listo»: lo que se fija acá es qué NO
 * deja pasar y que la plata cierre al céntimo.
 */
import { describe, expect, it } from "vitest";

import {
  MARCA_VACIA,
  problemaDeFecha,
  problemasDelBloque,
  repartirCosto,
  resumenDelBloque,
  type GuiaDelBloque,
  type Marcas,
} from "@/lib/forestal/recepcion-bloque";

const guia = (clave: string, over: Partial<GuiaDelBloque> = {}): GuiaDelBloque => ({
  clave,
  gtfNumber: `001-000${clave}`,
  volumenM3: 10,
  trozasM3: 10,
  trozasCount: 4,
  trozasDecididas: 0,
  lineas: [{ id: `${clave}-a`, volumeM3: 6 }, { id: `${clave}-b`, volumeM3: 4 }],
  ...over,
});
const marcar = (clave: string, over: Partial<Marcas[string]> = {}): Marcas => ({
  [clave]: { ...MARCA_VACIA, marcada: true, ...over },
});

describe("la fecha en que bajó la madera", () => {
  it("es obligatoria y con formato", () => {
    expect(problemaDeFecha("")).toContain("Falta la fecha");
    expect(problemaDeFecha("15/09/2026")).toContain("Falta la fecha");
  });

  it("no puede ser de un día que todavía no llegó", () => {
    expect(problemaDeFecha("2026-09-20", "2026-09-15")).toContain("todavía no llegó");
  });

  it("hoy sirve, y ayer también", () => {
    expect(problemaDeFecha("2026-09-15", "2026-09-15")).toBeNull();
    expect(problemaDeFecha("2026-09-01", "2026-09-15")).toBeNull();
  });
});

describe("lo que el bloque no deja pasar", () => {
  it("una guía que no cuadra con sus piezas se puede recibir, pero no en silencio", () => {
    const g = guia("1", { volumenM3: 10, trozasM3: 6 });
    expect(problemasDelBloque([g], marcar("1"))[0]?.motivo).toContain("escribe qué pasó");
    expect(problemasDelBloque([g], marcar("1", { observacion: "vinieron 2 trozas menos" }))).toHaveLength(0);
  });

  it("un «ok» de dos letras no es una explicación", () => {
    const g = guia("1", { volumenM3: 10, trozasM3: 6 });
    expect(problemasDelBloque([g], marcar("1", { observacion: "ok" }))).toHaveLength(1);
  });

  it("el costo o es un número mayor que cero, o queda vacío", () => {
    expect(problemasDelBloque([guia("1")], marcar("1", { costoTotal: "abc" }))[0]?.motivo).toContain("mayor que cero");
    expect(problemasDelBloque([guia("1")], marcar("1", { costoTotal: "0" }))).toHaveLength(1);
    expect(problemasDelBloque([guia("1")], marcar("1", { costoTotal: "" }))).toHaveLength(0);
    expect(problemasDelBloque([guia("1")], marcar("1", { costoTotal: "1500.50" }))).toHaveLength(0);
  });

  it("una guía sin marcar no se revisa: el tilde es la declaración", () => {
    const g = guia("1", { volumenM3: 10, trozasM3: 6 });
    expect(problemasDelBloque([g], {})).toHaveLength(0);
  });
});

describe("el costo repartido entre los asientos de la guía", () => {
  it("va por volumen y suma EXACTAMENTE lo que dice la factura", () => {
    const partes = repartirCosto(guia("1"), 1000);
    expect(partes).toEqual([
      { id: "1-a", costoTotal: 600 },
      { id: "1-b", costoTotal: 400 },
    ]);
    expect(partes.reduce((a, p) => a + p.costoTotal, 0)).toBe(1000);
  });

  it("el céntimo suelto de un tercio no se pierde: se lo lleva el último", () => {
    const g = guia("1", { lineas: [{ id: "a", volumeM3: 1 }, { id: "b", volumeM3: 1 }, { id: "c", volumeM3: 1 }] });
    const partes = repartirCosto(g, 100);
    expect(partes.reduce((a, p) => a + p.costoTotal, 0)).toBe(100);
  });

  it("sin costo no reparte nada", () => {
    expect(repartirCosto(guia("1"), 0)).toEqual([]);
  });
});

describe("el resumen que se ve antes de apretar", () => {
  it("cuenta sólo lo marcado", () => {
    const guias = [guia("1"), guia("2")];
    const r = resumenDelBloque(guias, marcar("1", { costoTotal: "500" }));
    expect(r.guias).toBe(1);
    expect(r.m3).toBe(10);
    expect(r.conCosto).toBe(1);
    expect(r.soles).toBe(500);
    expect(resumenDelBloque(guias, {}).guias).toBe(0);
  });
});
