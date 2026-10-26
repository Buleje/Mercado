import { describe, expect, it } from "vitest";
import {
  aplicarPegado,
  COLUMNAS_PEGAR,
  conFilasDeSobra,
  destinosSinTitulos,
  FILAS_DE_ARRANQUE,
  filaVacia,
  leerEncabezado,
  leerFila,
  partirPegado,
  pareceTabla,
  rangoATexto,
  resumirPegado,
  UNIDADES_DE_FABRICA,
  type FilaPegar,
} from "@/lib/forestal/cubicacion-pegar";

const vacio = () => ({ filas: conFilasDeSobra([]), unidades: { ...UNIDADES_DE_FABRICA } });
const col = (c: (typeof COLUMNAS_PEGAR)[number]) => COLUMNAS_PEGAR.indexOf(c);
const leerTodo = (filas: FilaPegar[], especies: string[] = []) =>
  resumirPegado(filas.map((f, i) => leerFila(f, i, UNIDADES_DE_FABRICA, especies)));

describe("partirPegado — el portapapeles de Excel", () => {
  it("parte por tab y no por coma: «1,5» es un número, no dos celdas", () => {
    expect(partirPegado("1,5\t6\t12\r\n2\t8\t10\r\n")).toEqual([["1,5", "6", "12"], ["2", "8", "10"]]);
  });
  it("conserva la celda vacía del medio de una columna y quita la fila vacía del final", () => {
    expect(partirPegado("10\n\n12\n\n")).toEqual([["10"], [""], ["12"]]);
  });
  it("una celda entre comillas puede traer un salto de línea", () => {
    expect(partirPegado('2\t"tabla\ncon nudo"\n3\tok')).toEqual([["2", "tabla\ncon nudo"], ["3", "ok"]]);
  });
  it("comillas que no cierran son parte del dato (2\" de espesor)", () => {
    expect(partirPegado('"2\t8\n1\t6')).toEqual([['"2', "8"], ["1", "6"]]);
  });
});

describe("leerEncabezado", () => {
  it("lee los títulos en otro orden y con su unidad", () => {
    const e = leerEncabezado(["Largo (m)", "Esp. cm", "Ancho", "Especie", "PT"]);
    expect(e?.destinos).toEqual(["largo", "espesor", "ancho", "especie", null]);
    expect(e?.unidades).toEqual({ largo: "m", espesor: "cm" });
    expect(e?.sinUsar).toEqual([{ titulo: "PT", motivo: "sale solo de la medida" }]);
  });
  it("una fila con números no es encabezado", () => {
    expect(leerEncabezado(["Tornillo", "2", "8"])).toBeNull();
  });
  it("texto que no nombra columnas no es encabezado (son datos de especie y dueño)", () => {
    expect(leerEncabezado(["Tornillo", "Juan Pérez"])).toBeNull();
  });
  it("«Tipo» y «Especie» juntas: gana la que se llama Especie", () => {
    const e = leerEncabezado(["Tipo", "Especie", "Largo"]);
    expect(e?.destinos).toEqual([null, "especie", "largo"]);
  });
  it("«N°» es el número de fila, no la cantidad", () => {
    expect(leerEncabezado(["N°", "Cant.", "Esp.", "Anc.", "Largo"])?.destinos).toEqual([null, "cantidad", "espesor", "ancho", "largo"]);
  });
});

describe("aplicarPegado", () => {
  it("una columna pegada en una celda llena esa columna hacia abajo desde esa fila", () => {
    const r = aplicarPegado(vacio(), "10\n12\n14\n", { fila: 2, col: col("largo") });
    expect(r.filas.slice(2, 5).map((f) => f.largo)).toEqual(["10", "12", "14"]);
    expect(r.filas[2].espesor).toBe("");
    expect(r.rango).toEqual({ f0: 2, f1: 4, c0: col("largo"), c1: col("largo") });
    expect(r.aviso).toContain("desde Largo pies (fila 3)");
  });
  it("varias columnas pegadas van a la derecha y hacia abajo, como Excel", () => {
    const r = aplicarPegado(vacio(), "2\t8\t10\n1,5\t6\t12", { fila: 0, col: col("espesor") });
    expect(r.filas.slice(0, 2).map((f) => [f.espesor, f.ancho, f.largo])).toEqual([["2", "8", "10"], ["1,5", "6", "12"]]);
  });
  it("con títulos en otro orden, cada columna cae en la suya y lo dice", () => {
    const r = aplicarPegado(vacio(), "Largo\tEspesor\tAncho\tCant\n10\t2\t8\t3", null);
    expect(r.filas[0]).toMatchObject({ largo: "10", espesor: "2", ancho: "8", cantidad: "3" });
    expect(r.aviso).toContain("puse «Largo» en Largo pies");
  });
  it("los títulos con unidad cambian la unidad de la columna", () => {
    const r = aplicarPegado(vacio(), "Espesor cm\tAncho cm\tLargo m\n5\t20\t3", null);
    expect(r.unidades).toEqual({ espesor: "cm", ancho: "cm", largo: "m" });
  });
  it("sin títulos ni celda: 3 columnas de números = espesor · ancho · largo", () => {
    const r = aplicarPegado(vacio(), "2\t8\t10\n1,5\t6\t12", null);
    expect(r.filas[1]).toMatchObject({ espesor: "1,5", ancho: "6", largo: "12", cantidad: "" });
    expect(r.aviso).toContain("Sin títulos");
  });
  it("sin títulos: 4 columnas = cant · espesor · ancho · largo; el texto va a especie y dueño", () => {
    const r = aplicarPegado(vacio(), "3\t2\t8\t10\tTornillo\tJuan", null);
    expect(r.filas[0]).toMatchObject({ cantidad: "3", espesor: "2", ancho: "8", largo: "10", especie: "Tornillo", dueno: "Juan" });
  });
  it("sin títulos: si la 4.ª columna es el PT de las tres primeras, no es la cantidad", () => {
    const destinos = destinosSinTitulos([["2", "8", "10", "13,33"], ["1", "6", "12", "6"]]);
    expect(destinos).toEqual(["espesor", "ancho", "largo", null]);
  });
  it("celdas vacías se pegan vacías (no corren las de abajo)", () => {
    const r = aplicarPegado(vacio(), "2\t\t10\n\t6\t", { fila: 0, col: col("espesor") });
    expect(r.filas.slice(0, 2).map((f) => [f.espesor, f.ancho, f.largo])).toEqual([["2", "", "10"], ["", "6", ""]]);
  });
  it("filas de más: la tabla crece y siempre deja 5 vacías debajo", () => {
    const texto = Array.from({ length: 30 }, (_, i) => `2\t8\t${i + 1}`).join("\n");
    const r = aplicarPegado(vacio(), texto, { fila: 0, col: col("espesor") });
    expect(r.filas).toHaveLength(35);
    expect(r.filas[29].largo).toBe("30");
  });
  it("columnas de más a la derecha de Observación no entran y se avisa", () => {
    const r = aplicarPegado(vacio(), "a\tb\tc", { fila: 0, col: col("observacion") });
    expect(r.filas[0].observacion).toBe("a");
    expect(r.aviso).toContain("2 columnas sobraron");
  });
  it("un valor solo sobre un rango marcado llena el rango", () => {
    const r = aplicarPegado(vacio(), "Tornillo", { fila: 0, col: col("especie") }, { f0: 0, f1: 3, c0: col("especie"), c1: col("especie") });
    expect(r.filas.slice(0, 4).every((f) => f.especie === "Tornillo")).toBe(true);
  });
  it("nunca quita filas que ya tenían datos", () => {
    const filas = conFilasDeSobra([]);
    filas[18] = { ...filaVacia(), largo: "9" };
    const r = aplicarPegado({ filas, unidades: UNIDADES_DE_FABRICA }, "1", { fila: 0, col: 0 });
    expect(r.filas[18].largo).toBe("9");
    expect(r.filas.length).toBeGreaterThanOrEqual(FILAS_DE_ARRANQUE + 4);
  });
});

describe("leerFila y resumirPegado", () => {
  it("coma decimal y «2 1/2»: PT con la fórmula del cubicador y m³ del PT total", () => {
    const filas = [
      { ...filaVacia(), cantidad: "2", espesor: "2 1/2", ancho: "8", largo: "10" },
      { ...filaVacia(), espesor: "1,5", ancho: "6", largo: "12" },
    ];
    const r = leerTodo(filas);
    expect(r.piezas.map((p) => p.pieTablar)).toEqual([33.33, 9]);
    expect(r.totalPiezas).toBe(3);
    expect(r.pt).toBe(42.33);
    expect(r.m3).toBeCloseTo(42.33 / 424, 4);
  });
  it("la fila en rojo dice por qué y no entra al lote", () => {
    const l = leerFila({ ...filaVacia(), cantidad: "1,5", espesor: "x", ancho: "8" }, 0, UNIDADES_DE_FABRICA);
    expect(l.errores).toEqual({ cantidad: "Las piezas van sin decimales", espesor: "«x» no es una medida", largo: "Falta la medida" });
    expect(l.pieza).toBeNull();
    expect(leerTodo([{ ...filaVacia(), espesor: "x" }]).filasConError).toBe(1);
  });
  it("la especie que no está en la lista entra igual con aviso; la conocida se escribe como en la lista", () => {
    const base = { ...filaVacia(), espesor: "2", ancho: "8", largo: "10" };
    expect(leerFila({ ...base, especie: "torn" }, 0, UNIDADES_DE_FABRICA, ["Tornillo"]).pieza?.especie).toBe("Tornillo");
    const rara = leerFila({ ...base, especie: "quinilla" }, 0, UNIDADES_DE_FABRICA, ["Tornillo"]);
    expect(rara.pieza?.especie).toBe("Quinilla");
    expect(rara.avisos.especie).toContain("no está en tu lista");
  });
  it("dueño y observación viajan con la pieza; la fila vacía no cuenta", () => {
    const r = leerTodo([filaVacia(), { ...filaVacia(), espesor: "2", ancho: "8", largo: "10", dueno: "Juan", observacion: "nudo" }]);
    expect(r.piezas[0]).toMatchObject({ dueno: "Juan", observacion: "nudo", filaOrigen: 2 });
    expect(r.filasConError).toBe(0);
  });
});

describe("rangoATexto y pareceTabla", () => {
  it("Ctrl+C de un rango sale como TSV que Excel entiende", () => {
    const filas = [{ ...filaVacia(), espesor: "2", ancho: "8" }, { ...filaVacia(), espesor: "1", ancho: "6" }];
    expect(rangoATexto(filas, { f0: 0, f1: 1, c0: col("espesor"), c1: col("ancho") })).toBe("2\t8\n1\t6");
  });
  it("una palabra suelta no abre la tabla; una tabla sí", () => {
    expect(pareceTabla("Tornillo")).toBe(false);
    expect(pareceTabla("2\t8\t10")).toBe(true);
    expect(pareceTabla("10\n12")).toBe(true);
  });
});
