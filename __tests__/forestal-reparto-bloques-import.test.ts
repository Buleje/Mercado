import { describe, expect, it } from "vitest";
import {
  PLANTILLA_BLOQUES,
  parsearBloquesImportados,
} from "@/lib/forestal/reparto-bloques-import";
import { leerTextoAFilas } from "@/lib/forestal/cubicacion-import-file";
import type { Celda } from "@/lib/forestal/cubicacion-import";

/**
 * El importador de bloques de la distribución.
 *
 * La regla que gobierna estos tests: **ninguna fila desaparece en silencio**.
 * El importador de trozas se comió 51 de 60 sin que nadie lo viera
 * ([[ctp-import-inventarios-2026-08-05]]); acá cada descarte tiene que llegar
 * a la lista de descartadas con su número de fila y su motivo.
 */
const fila = (...c: Celda[]): Celda[] => c;

describe("parsearBloquesImportados · la cabecera se reconoce por nombre", () => {
  it("lee la plantilla propia, en su orden", () => {
    const r = parsearBloquesImportados([
      PLANTILLA_BLOQUES.headers,
      ...PLANTILLA_BLOQUES.ejemplo,
    ]);
    expect(r.conCabecera).toBe(true);
    expect(r.descartadas).toEqual([]);
    expect(r.bloques).toHaveLength(2);
    expect(r.bloques[0]).toMatchObject({ etiqueta: "GTF-0231", tipo: "rolliza", especie: "Tornillo", m3: 20, aprovechablePct: 55 });
    expect(r.bloques[1]).toMatchObject({ etiqueta: "Compra 12/08", tipo: "aserrada", m3: 1.5, piezasManual: 30 });
  });

  it("no le importa el ORDEN de las columnas ni las tildes ni las mayúsculas", () => {
    const r = parsearBloquesImportados([
      fila("ESPECIE", "Volumen m3", "GUÍA", "Cargado como"),
      fila("tornillo", 12, "GTF-99", "rolliza"),
    ]);
    expect(r.conCabecera).toBe(true);
    expect(r.bloques[0]).toMatchObject({ especie: "Tornillo", m3: 12, etiqueta: "GTF-99", tipo: "rolliza" });
  });

  it("sin cabecera reconocible asume el orden de la plantilla", () => {
    const r = parsearBloquesImportados([fila("GTF-1", "rolliza", "Cedro", "", 8)]);
    expect(r.conCabecera).toBe(false);
    expect(r.bloques[0]).toMatchObject({ etiqueta: "GTF-1", especie: "Cedro", m3: 8, tipo: "rolliza" });
  });

  it("avisa qué columnas de la cabecera no entendió, en vez de tragárselas", () => {
    const r = parsearBloquesImportados([
      fila("Etiqueta", "m3", "Color del camión"),
      fila("GTF-1", 5, "rojo"),
    ]);
    expect(r.columnasIgnoradas).toEqual(["Color del camión"]);
    expect(r.bloques).toHaveLength(1);
  });
});

describe("parsearBloquesImportados · el tipo de bloque", () => {
  const conTipo = (t: string) =>
    parsearBloquesImportados([fila("Etiqueta", "Cargado como", "m3"), fila("X", t, 5)]).bloques[0];

  it("reconoce la madera ya aserrada escrita de varias formas", () => {
    for (const t of ["aserrada", "Aserrada directa", "ASERRADO", "ya aserrada", "A"]) {
      expect(conTipo(t).tipo, t).toBe("aserrada");
    }
  });

  it("todo lo demás —y el vacío— es rolliza: una planilla vieja no cambia de significado", () => {
    for (const t of ["", "rolliza", "Rolliza (troza)", "troza", "R"]) {
      expect(conTipo(t).tipo, t).toBe("rolliza");
    }
  });

  it("un bloque de aserrada directa NO se lleva un % aprovechable de la planilla", () => {
    const r = parsearBloquesImportados([
      fila("Etiqueta", "Cargado como", "m3", "% aprovechable"),
      fila("X", "aserrada", 5, 55),
    ]);
    // El % no aplica a la aserrada directa: guardarlo dejaría un número muerto
    // que reaparece si alguien pasa la fila a rolliza.
    expect(r.bloques[0].aprovechablePct).toBeNull();
  });
});

describe("parsearBloquesImportados · ninguna fila se pierde en silencio", () => {
  it("la fila sin m³ se DESCARTA y se reporta con su número y su motivo", () => {
    const r = parsearBloquesImportados([
      fila("Etiqueta", "m3"),
      fila("GTF-1", 10),
      fila("GTF-2", ""),
      fila("GTF-3", "no es un número"),
      fila("GTF-4", 0),
      fila("GTF-5", -3),
    ]);
    expect(r.bloques).toHaveLength(1);
    expect(r.descartadas.map((d) => d.fila)).toEqual([3, 4, 5, 6]);
    expect(r.descartadas[0].motivo).toContain("sin m³");
    expect(r.descartadas[2].motivo).toContain("0 o negativo");
    // El crudo permite reconocer la fila sin volver a abrir el archivo.
    expect(r.descartadas[0].crudo).toContain("GTF-2");
  });

  it("leídas + descartadas = las filas con contenido del archivo", () => {
    const filas = [fila("Etiqueta", "m3"), fila("A", 1), fila("B", ""), fila("", ""), fila("C", 2)];
    const r = parsearBloquesImportados(filas);
    const conContenido = filas.filter((f) => f.some((c) => String(c ?? "").trim() !== "")).length - 1;
    expect(r.bloques.length + r.descartadas.length).toBe(conContenido);
  });

  it("una planilla vacía no explota", () => {
    expect(parsearBloquesImportados([])).toEqual({ bloques: [], descartadas: [], conCabecera: false, columnasIgnoradas: [] });
    expect(parsearBloquesImportados([fila("", "", "")]).bloques).toEqual([]);
  });
});

describe("parsearBloquesImportados · números y fechas como se escriben acá", () => {
  it("lee el decimal con coma peruana", () => {
    const r = parsearBloquesImportados([fila("Etiqueta", "m3"), fila("X", "23,5")]);
    expect(r.bloques[0].m3).toBeCloseTo(23.5, 4);
  });

  it("lee dd/mm/aaaa y deja AAAA-MM-DD sin correr el día", () => {
    const r = parsearBloquesImportados([
      fila("Etiqueta", "m3", "Fecha"),
      fila("A", 1, "01/09/2026"),
      fila("B", 1, "2026-09-01"),
      fila("C", 1, "cualquier cosa"),
    ]);
    expect(r.bloques.map((b) => b.fecha)).toEqual(["2026-09-01", "2026-09-01", null]);
  });

  it("los días quedan en null cuando no se dijeron: 0 jornadas no existe", () => {
    const r = parsearBloquesImportados([fila("Etiqueta", "m3", "Días"), fila("A", 1, ""), fila("B", 1, 3)]);
    expect(r.bloques[0].dias).toBeNull();
    expect(r.bloques[1].dias).toBe(3);
  });

  it("el costo vacío es null, NUNCA 0: un 0 diría que la madera fue gratis", () => {
    const r = parsearBloquesImportados([fila("Etiqueta", "m3", "S/ por m³"), fila("A", 1, "")]);
    expect(r.bloques[0].costoM3).toBeNull();
  });

  it("las piezas vacías son null (todas las que entren), no 0", () => {
    const r = parsearBloquesImportados([fila("Etiqueta", "m3", "Piezas"), fila("A", 1, ""), fila("B", 1, 0)]);
    expect(r.bloques[0].piezasManual).toBeNull();
    expect(r.bloques[1].piezasManual).toBe(0);
  });
});

/**
 * El separador del texto pegado.
 *
 * Se ganó con un bug real: pegar un rango de Excel (TSV) con decimales
 * peruanos («14,5») partía el número en dos celdas porque el partidor aceptaba
 * tab, `;` y `,` a la vez — y todas las columnas siguientes se corrían una
 * posición, así que el % aprovechable aparecía en la columna de piezas. `tsc`,
 * `lint` y los tests estaban en verde: era semántica de datos, no de tipos.
 */
describe("leerTextoAFilas · el separador no puede comerse el decimal", () => {
  it("un pegado TSV con coma decimal NO se parte por la coma", () => {
    const r = parsearBloquesImportados(leerTextoAFilas(
      "Etiqueta\tEspecie\tm3\t% aprovechable\n" +
      "GTF-0450\tCedro\t14,5\t52",
    ));
    expect(r.descartadas).toEqual([]);
    expect(r.bloques[0].m3).toBeCloseTo(14.5, 4);
    expect(r.bloques[0].aprovechablePct).toBe(52);
    expect(r.bloques[0].especie).toBe("Cedro");
  });

  it("un CSV peruano de verdad (`;` + coma decimal) tampoco", () => {
    const r = parsearBloquesImportados(leerTextoAFilas(
      "Etiqueta;Especie;m3;Piezas\nCompra Yarina;Capirona;2,25;44",
    ));
    expect(r.bloques[0].m3).toBeCloseTo(2.25, 4);
    expect(r.bloques[0].piezasManual).toBe(44);
  });

  it("un CSV con comas de verdad sigue funcionando (no hay tab ni `;`)", () => {
    const r = parsearBloquesImportados(leerTextoAFilas("Etiqueta,Especie,m3\nGTF-1,Cedro,8"));
    expect(r.bloques[0]).toMatchObject({ etiqueta: "GTF-1", especie: "Cedro", m3: 8 });
  });

  it("el separador se decide por el ARCHIVO, no por la línea: una fila sin comas no cambia la de al lado", () => {
    const r = parsearBloquesImportados(leerTextoAFilas(
      "Etiqueta\tm3\nSin coma\t8\nCon coma\t3,5",
    ));
    expect(r.bloques.map((b) => b.m3)).toEqual([8, 3.5]);
  });

  it("las comillas protegen el contenido, no definen el separador", () => {
    const r = parsearBloquesImportados(leerTextoAFilas(
      'Etiqueta;m3\n"Lote A; el del fondo";7,5',
    ));
    expect(r.bloques[0].etiqueta).toBe("Lote A; el del fondo");
    expect(r.bloques[0].m3).toBeCloseTo(7.5, 4);
  });
});
