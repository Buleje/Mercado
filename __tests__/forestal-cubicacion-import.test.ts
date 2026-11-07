/**
 * Importación de piezas desde Excel/CSV: el operario arma su archivo como le
 * sale y el parser se adapta; lo que no puede leer lo reporta, no lo inventa.
 */
import { describe, expect, it } from "vitest";
import { interpretarDictadoAudio, parsearFilasImportadas } from "@/lib/forestal/cubicacion-import";
import { COMANDOS_DEFAULT } from "@/lib/forestal/cubicacion";

const H = ["Especie", "Espesor", "Ancho", "Largo", "Cantidad"];

describe("parsearFilasImportadas", () => {
  it("lee el formato base y cubica cada fila", () => {
    const r = parsearFilasImportadas([H, ["Tornillo", 2, 8, 10, 5]]);
    expect(r.errores).toEqual([]);
    expect(r.piezas).toHaveLength(1);
    const p = r.piezas[0];
    expect(p).toMatchObject({ especie: "Tornillo", espesor: 2, ancho: 8, largo: 10, cantidad: 5 });
    expect(p.pieTablar).toBeCloseTo(66.67, 1); // 2*8*10/12 * 5
  });

  it("acepta las columnas en cualquier orden", () => {
    const r = parsearFilasImportadas([
      ["Largo", "Especie", "Cantidad", "Espesor", "Ancho"],
      [10, "Cedro", 2, 2, 6],
    ]);
    expect(r.piezas[0]).toMatchObject({ especie: "Cedro", espesor: 2, ancho: 6, largo: 10, cantidad: 2 });
  });

  it("tolera acentos, mayúsculas y sinónimos en los títulos", () => {
    const r = parsearFilasImportadas([
      ["ESPÉCIE", "GROSOR", "anchura", "Longitud"],
      ["shihuahuaco", 3, 10, 8],
    ]);
    expect(r.errores).toEqual([]);
    expect(r.piezas[0]).toMatchObject({ especie: "Shihuahuaco", espesor: 3, ancho: 10, largo: 8, cantidad: 1 });
  });

  it("sin columna Cantidad asume 1 por fila", () => {
    const r = parsearFilasImportadas([["Especie", "Espesor", "Ancho", "Largo"], ["Cumala", 2, 8, 10]]);
    expect(r.piezas[0].cantidad).toBe(1);
  });

  it("saltea filas vacías sin marcarlas como error", () => {
    const r = parsearFilasImportadas([H, ["Tornillo", 2, 8, 10, 1], [null, null, null, null, null], ["Cedro", 2, 6, 8, 1]]);
    expect(r.piezas).toHaveLength(2);
    expect(r.errores).toEqual([]);
  });

  it("reporta la fila con medidas inválidas, con su número", () => {
    const r = parsearFilasImportadas([H, ["Tornillo", 2, 8, 10, 1], ["Cedro", "abc", 6, 8, 1], ["Moena", 2, 6, 8, 1]]);
    expect(r.piezas).toHaveLength(2);
    expect(r.errores).toEqual([{ fila: 3, motivo: expect.stringContaining("no es un número") }]);
  });

  it("rechaza medidas cero o negativas", () => {
    const r = parsearFilasImportadas([H, ["Tornillo", 2, 0, 10, 1]]);
    expect(r.piezas).toHaveLength(0);
    expect(r.errores[0].motivo).toContain("mayores que cero");
  });

  it("interpreta números en formato peruano y fracciones", () => {
    const r = parsearFilasImportadas([H, ["Bolaina", "1,5", "2 1/2", "3.5", "2"]]);
    expect(r.piezas[0]).toMatchObject({ espesor: 1.5, ancho: 2.5, largo: 3.5 });
  });

  it("respeta columnas de unidad si vienen", () => {
    const r = parsearFilasImportadas([
      ["Especie", "Espesor", "u.Esp", "Ancho", "u.Anc", "Largo", "u.Lar"],
      ["Catahua", 5, "cm", 20, "cm", 3, "m"],
    ]);
    expect(r.piezas[0]).toMatchObject({ uEspesor: "cm", uAncho: "cm", uLargo: "m" });
  });

  it("marca medidas raras pero las importa igual", () => {
    const r = parsearFilasImportadas([H, ["Tornillo", 2, 8, 1, 1]]); // largo de 1 pie
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0].sospechosa).toBe(true);
  });

  it("sin encabezado reconocible avisa qué falta", () => {
    const r = parsearFilasImportadas([["hola", "mundo"], [1, 2]]);
    expect(r.piezas).toHaveLength(0);
    expect(r.errores[0].motivo).toContain("Especie, Espesor, Ancho y Largo");
  });

  it("con encabezado pero sin una columna obligatoria lo dice", () => {
    const r = parsearFilasImportadas([["Especie", "Espesor", "Ancho"], ["Cedro", 2, 6]]);
    expect(r.errores[0].motivo).toContain("Faltan columnas");
    expect(r.errores[0].motivo).toContain("largo");
  });

  it("una especie desconocida se respeta tal cual", () => {
    const r = parsearFilasImportadas([H, ["Pino radiata", 2, 8, 10, 1]]);
    expect(r.piezas[0].especie).toBe("Pino radiata");
  });

  it("encuentra el encabezado aunque haya filas de título arriba", () => {
    const r = parsearFilasImportadas([
      ["ASERRADERO SAN MARTÍN", null, null, null],
      ["Lote del 20 de julio", null, null, null],
      H,
      ["Tornillo", 2, 8, 10, 4],
    ]);
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0].filaOrigen).toBe(4);
  });
});

describe("interpretarDictadoAudio", () => {
  it("arma tríos desde un dictado simple sin comandos (caso base verificado E2E)", () => {
    const r = interpretarDictadoAudio("dos ocho once, dos ocho diez, tres seis doce");
    expect(r.errores).toEqual([]);
    expect(r.piezas.map((p) => [p.espesor, p.ancho, p.largo])).toEqual([[2, 8, 11], [2, 8, 10], [3, 6, 12]]);
    expect(r.piezas.every((p) => p.cantidad === 1 && p.especie === undefined)).toBe(true);
  });

  it("entiende la cantidad dictada (\"N piezas/tablas de\")", () => {
    const r = interpretarDictadoAudio("cinco tablas de dos por ocho por diez.");
    expect(r.errores).toEqual([]);
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0]).toMatchObject({ cantidad: 5, espesor: 2, ancho: 8, largo: 10 });
  });

  it("aplica la especie dictada a las piezas siguientes, hasta que cambie", () => {
    const r = interpretarDictadoAudio("especie cedro. dos ocho once. dos ocho diez. especie tornillo. tres seis doce.");
    expect(r.errores).toEqual([]);
    expect(r.piezas.map((p) => p.especie)).toEqual(["Cedro", "Cedro", "Tornillo"]);
  });

  it("tolera el plural \"especies\" (Whisper real transcribió así \"especie cedro\")", () => {
    const r = interpretarDictadoAudio("Especies cedro. 2, 8, 11.");
    expect(r.errores).toEqual([]);
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0]).toMatchObject({ espesor: 2, ancho: 8, largo: 11, especie: "Cedro" });
  });

  it("una especie no reconocida deja un aviso pero no corta el resto del dictado", () => {
    const r = interpretarDictadoAudio("especie pinotea. dos ocho once.");
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0].especie).toBeUndefined();
    expect(r.errores[0].motivo).toContain("pinotea");
  });

  it("medidas fijas: pide menos números por pieza y se liberan con \"quitá el fijo\"", () => {
    const r = interpretarDictadoAudio("pon fijo el largo a diez. dos ocho. dos seis. quitá el fijo. tres seis doce.");
    expect(r.errores).toEqual([]);
    expect(r.piezas.map((p) => [p.espesor, p.ancho, p.largo])).toEqual([[2, 8, 10], [2, 6, 10], [3, 6, 12]]);
  });

  it("corrige un dictado equivocado con \"eliminá el último\"", () => {
    const r = interpretarDictadoAudio("dos ocho once. eliminá el último. tres seis doce.");
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0]).toMatchObject({ espesor: 3, ancho: 6, largo: 12 });
  });

  it("\"eliminá el último\" sin piezas previas avisa en vez de fallar en silencio", () => {
    const r = interpretarDictadoAudio("eliminá el último.");
    expect(r.piezas).toHaveLength(0);
    expect(r.errores[0].motivo).toContain("ninguna pieza");
  });

  it("números sueltos que no cierran una pieza se reportan con el resto exacto (no se inventa una medida)", () => {
    const r = interpretarDictadoAudio("dos ocho once, dos ocho");
    expect(r.piezas).toHaveLength(1);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].motivo).toContain("2, 8");
  });

  it("un comando en el medio del audio no arrastra los números sueltos de la oración anterior — los reporta y arranca limpio", () => {
    const r = interpretarDictadoAudio("dos ocho. pon fijo el largo a diez. tres seis.");
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0]).toMatchObject({ espesor: 3, ancho: 6, largo: 10 });
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].motivo).toContain("2, 8");
  });

  it("respeta el vocabulario de comandos personalizado en Ajustes, no sólo el DEFAULT", () => {
    const cfgPersonalizado = { ...COMANDOS_DEFAULT, fijar: ["trábalo"], especie: ["tipo"] };
    const r = interpretarDictadoAudio("tipo tornillo. trábalo el largo a diez. dos ocho.", cfgPersonalizado);
    expect(r.errores).toEqual([]);
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0]).toMatchObject({ espesor: 2, ancho: 8, largo: 10, especie: "Tornillo" });
  });

  it("sin un cfg explícito usa el vocabulario DEFAULT (compatibilidad hacia atrás)", () => {
    const r = interpretarDictadoAudio("tipo tornillo. dos ocho once.");
    // "tipo" no es gatillo DEFAULT de especie ("especie"/"especies"/"madera") →
    // no se reconoce como comando, se ignora como ruido; la medida sí entra.
    expect(r.piezas).toHaveLength(1);
    expect(r.piezas[0].especie).toBeUndefined();
  });

  it("un archivo sin ningún número reconocible avisa en vez de devolver una lista vacía sin explicación", () => {
    const r = interpretarDictadoAudio("ruido de fondo, no se entendió nada");
    expect(r.piezas).toHaveLength(0);
    expect(r.errores[0].motivo).toContain("No se reconoció ningún número");
  });
});
