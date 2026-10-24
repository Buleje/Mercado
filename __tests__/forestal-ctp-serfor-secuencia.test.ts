import { describe, expect, it } from "vitest";
import { describirPlan, ordenarSecciones, seccionesAusentes } from "@/lib/forestal/ctp-serfor-secuencia";
import type { FormatoCtp } from "@/lib/forestal/ctp-formatos-serfor";

const seccion = (formato: FormatoCtp, filas = 1, malas = 0) => ({
  formato,
  nombreHoja: formato,
  filaCabecera: 6,
  parseadas: [
    ...Array.from({ length: filas }, (_, i) => ({ fila: i + 7, datos: {}, problemas: [] })),
    ...Array.from({ length: malas }, (_, i) => ({ fila: 100 + i, datos: {}, problemas: ["Falta Cantidad"] })),
  ] as never,
});

describe("ordenarSecciones · el orden es la cadena de custodia", () => {
  it("los ingresos van primero aunque el Excel los traiga últimos", () => {
    // La producción se atribuye contra las guías de los ingresos: si entran
    // después, la corrida no encuentra su origen y queda sin consumos.
    const r = ordenarSecciones([seccion("salidas"), seccion("produccion"), seccion("ingresos")]);
    expect(r.map((s) => s.formato)).toEqual(["ingresos", "produccion", "salidas"]);
  });

  it("el retrozado va antes que los consumos: un consumo puede apuntar a un retrozo", () => {
    const r = ordenarSecciones([seccion("consumos"), seccion("retrozado")]);
    expect(r.map((s) => s.formato)).toEqual(["retrozado", "consumos"]);
  });

  it("el libro completo sale en el orden de la cadena", () => {
    const r = ordenarSecciones([
      seccion("salidas"), seccion("consumos"), seccion("ingresos"), seccion("retrozado"), seccion("produccion"),
    ]);
    expect(r.map((s) => s.formato)).toEqual(["ingresos", "retrozado", "consumos", "produccion", "salidas"]);
  });

  it("una hoja de la plantilla sin llenar no es un error: se ignora", () => {
    const r = ordenarSecciones([seccion("ingresos", 3), seccion("salidas", 0)]);
    expect(r.map((s) => s.formato)).toEqual(["ingresos"]);
  });

  it("un archivo sin secciones no rompe", () => {
    expect(ordenarSecciones([])).toEqual([]);
  });
});

describe("describirPlan · qué va a pasar, antes de tocar nada", () => {
  it("dice cuántas filas por sección, en orden de escritura", () => {
    const r = describirPlan([seccion("produccion", 4), seccion("ingresos", 10)]);
    expect(r[0]).toContain("10 filas");
    expect(r[1]).toContain("4 filas");
  });

  it("las incompletas se nombran aparte: no se esconden en el total", () => {
    expect(describirPlan([seccion("ingresos", 8, 2)])[0]).toContain("2 incompletas");
  });

  it("una sola fila se dice en singular", () => {
    expect(describirPlan([seccion("ingresos", 1)])[0]).toContain("1 fila");
    expect(describirPlan([seccion("ingresos", 1)])[0]).not.toContain("1 filas");
  });
});

describe("seccionesAusentes", () => {
  it("lista lo que el archivo no trae, para avisar sin alarmar", () => {
    expect(seccionesAusentes([seccion("ingresos")])).toEqual(["consumos", "retrozado", "produccion", "salidas"]);
  });

  it("con el libro completo no falta nada", () => {
    const todas = (["ingresos", "consumos", "retrozado", "produccion", "salidas"] as FormatoCtp[]).map((f) => seccion(f));
    expect(seccionesAusentes(todas)).toEqual([]);
  });
});
