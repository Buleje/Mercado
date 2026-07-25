/**
 * ANEXO N° 04 (SERFOR) — "Lista de productos transformados". El caso base
 * reproduce una GTF real llenada a mano (Tornillo: paquetería larga, corta y
 * larga angosta): si los subtotales del código coinciden con los del papel,
 * el formato sirve para presentar.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  construirAnexo04, geometriaHoja, fmtAnexo, fmtMedida, siguienteCorrelativo,
  FILAS_OFICIAL, PAGINA,
} from "@/lib/forestal/anexo04-serfor";
import { formulaV } from "@/lib/forestal/anexo04-excel";

let seq = 0;
function pieza(cantidad: number, espesor: number, ancho: number, largo: number, especie = "Tornillo"): PiezaCubicada {
  const dims = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id: `p${++seq}`, ...dims, especie, ...cubicarPieza(dims) };
}

/** El lote del anexo llenado a mano (18 medidas, 3 tipos de producto). */
const LOTE: PiezaCubicada[] = [
  // Paquetería larga (6×6, largo ≥ 6)
  pieza(23, 6, 6, 6), pieza(19, 6, 6, 7), pieza(34, 6, 6, 8), pieza(30, 6, 6, 10),
  // Paquetería corta (6×6, largo < 6)
  pieza(44, 6, 6, 1.5), pieza(33, 6, 6, 2), pieza(27, 6, 6, 2.5), pieza(23, 6, 6, 3),
  pieza(18, 6, 6, 3.5), pieza(15, 6, 6, 4), pieza(20, 6, 6, 4.5), pieza(32, 6, 6, 5),
  // Larga angosta (esp ≤ 5, anc ≤ 5, largo ≥ 6)
  pieza(1, 4, 5, 6), pieza(1, 5, 5, 6), pieza(1, 2, 5, 6),
  pieza(1, 4, 5, 8), pieza(1, 2, 5, 7), pieza(1, 3, 5, 9),
];

const OFICIAL = { unidadV: "pt", modo: "oficial" } as const;

describe("construirAnexo04 — bloques y subtotales", () => {
  const anexo = construirAnexo04(LOTE, OFICIAL);

  it("una hoja con 3 bloques: un tipo de producto por bloque, sin mezclar", () => {
    expect(anexo.hojas).toHaveLength(1);
    const bloques = anexo.hojas[0].bloques;
    expect(bloques.map((b) => b.tipo)).toEqual(["PAQUETERÍA LARGA", "PAQUETERÍA CORTA", "LARGA ANGOSTA"]);
    expect(bloques.every((b) => b.especie === "TORNILLO")).toBe(true);
    expect(bloques.map((b) => b.filas.length)).toEqual([4, 8, 6]);
  });

  it("subtotales (11) idénticos al formato llenado a mano", () => {
    expect(anexo.hojas[0].bloques.map((b) => b.subtotal)).toEqual([2529, 1924.5, 57.917]);
  });

  it("volumen total (3) en m³ y correlativo por bloque", () => {
    expect(anexo.totalM3).toBeCloseTo(10.646, 2);
    expect(anexo.totalPiezas).toBe(324);
    expect(anexo.hojas[0].bloques[1].filas.map((f) => f.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("la fila lleva las medidas en pulgadas y pies, y V en pie tablar", () => {
    const f = anexo.hojas[0].bloques[0].filas[0];
    expect(f).toMatchObject({ cantidad: 23, e: 6, a: 6, l: 6, v: 414 });
  });

  it("convierte cm/m a la unidad de comercio antes de imprimir", () => {
    const cm = [{ ...pieza(1, 0, 0, 0), espesor: 15.24, ancho: 15.24, largo: 1.8288, uEspesor: "cm", uAncho: "cm", uLargo: "m" } as PiezaCubicada];
    const f = construirAnexo04(cm, OFICIAL).hojas[0].bloques[0].filas[0];
    expect(f.e).toBeCloseTo(6, 1);
    expect(f.l).toBeCloseTo(6, 1);
  });
});

describe("construirAnexo04 — paginación", () => {
  it("un grupo de más de 35 piezas sigue en el bloque siguiente (cont.)", () => {
    const largo = Array.from({ length: 37 }, (_, i) => pieza(1, 6, 6, 8 + (i % 3)));
    const bloques = construirAnexo04(largo, OFICIAL).hojas[0].bloques;
    expect(bloques).toHaveLength(2);
    expect(bloques[0].filas).toHaveLength(FILAS_OFICIAL);
    expect(bloques[1].filas).toHaveLength(2);
    expect(bloques[1].continuacion).toBe(true);
    expect(bloques[0].continuacion).toBe(false);
  });

  it("más de 4 bloques abren hoja nueva (4 por hoja)", () => {
    const especies = ["Tornillo", "Cedro", "Capirona", "Cumala", "Bolaina"];
    const rows = especies.map((e) => pieza(2, 6, 6, 8, e));
    const anexo = construirAnexo04(rows, OFICIAL);
    expect(anexo.hojas.map((h) => h.bloques.length)).toEqual([4, 1]);
  });

  it("sin piezas igual imprime una hoja en blanco para llenar a mano", () => {
    const anexo = construirAnexo04([], OFICIAL);
    expect(anexo.hojas).toHaveLength(1);
    expect(anexo.hojas[0].bloques).toHaveLength(0);
    expect(anexo.totalM3).toBe(0);
  });

  it("modo compacto: solo las filas usadas (con un piso para no quedar raquítico)", () => {
    expect(construirAnexo04(LOTE, { unidadV: "pt", modo: "compacto" }).hojas[0].filasPorBloque).toBe(8);
    expect(construirAnexo04([pieza(1, 6, 6, 8)], { unidadV: "pt", modo: "compacto" }).hojas[0].filasPorBloque).toBe(6);
  });

  it("unidadV m³ cambia la columna V y el subtotal, no el volumen total", () => {
    const anexo = construirAnexo04(LOTE, { unidadV: "m3", modo: "oficial" });
    expect(anexo.hojas[0].bloques[0].subtotal).toBeCloseTo(5.968, 2);
    expect(anexo.totalM3).toBeCloseTo(10.646, 2);
  });
});

describe("formato numérico del anexo (coma decimal, sin miles)", () => {
  it("volumen con 3 decimales", () => {
    expect(fmtAnexo(414)).toBe("414,000");
    expect(fmtAnexo(2529)).toBe("2529,000");
    expect(fmtAnexo(57.9166)).toBe("57,917");
    expect(fmtAnexo(10.646)).toBe("10,646");
  });

  it("medidas sin ceros de relleno", () => {
    expect(fmtMedida(6)).toBe("6");
    expect(fmtMedida(1.5)).toBe("1,5");
    expect(fmtMedida(0.75)).toBe("0,75");
  });
});

describe("siguienteCorrelativo — el N° avanza solo entre guías", () => {
  it("incrementa el último tramo numérico conservando el formato", () => {
    expect(siguienteCorrelativo("2-19-0461363")).toBe("2-19-0461364");
    expect(siguienteCorrelativo("0009")).toBe("0010");
    expect(siguienteCorrelativo("A-99")).toBe("A-100");   // se pasa de largo: crece
    expect(siguienteCorrelativo("19-001-0000052")).toBe("19-001-0000053");
  });

  it("respeta un sufijo no numérico y no rompe sin números", () => {
    expect(siguienteCorrelativo("N-0007/A")).toBe("N-0008/A");
    expect(siguienteCorrelativo("")).toBe("");
    expect(siguienteCorrelativo("SIN-NUMERO")).toBe("SIN-NUMERO");
  });
});

describe("geometriaHoja — todo entra en la A4", () => {
  it("35 filas + subtotal quedan sobre el recuadro de observaciones", () => {
    const g = geometriaHoja(FILAS_OFICIAL);
    expect(g.ySub + g.hSub).toBeLessThan(g.yObs);
    expect(g.yObs + g.hObs).toBeLessThanOrEqual(g.yLegal);
    expect(g.yLegal + 24).toBeLessThan(PAGINA.h);
  });

  it("las 6 columnas suman el ancho del bloque y los 4 bloques el ancho útil", () => {
    const g = geometriaHoja(FILAS_OFICIAL);
    expect(g.cols.reduce((a, c) => a + c, 0)).toBeCloseTo(g.bloqueW, 6);
    expect(g.bloqueW * 4).toBeCloseTo(PAGINA.w - PAGINA.margen * 2, 6);
    expect(g.xCol(3, 5) + g.cols[5]).toBeCloseTo(PAGINA.w - PAGINA.margen, 6);
  });

  it("el logo no pisa la razón social ni el título del centro", () => {
    const g = geometriaHoja(FILAS_OFICIAL);
    expect(g.logoBox.x + g.logoBox.w).toBeLessThanOrEqual(g.xEmpresa(true));
    expect(g.xEmpresa(true) + g.wEmpresa(true)).toBeLessThanOrEqual(PAGINA.margen + 150);
    expect(g.logoBox.y + g.logoBox.h).toBeLessThanOrEqual(g.yBloqueHead);
  });

  it("en compacto la fila es más alta y el recuadro estira hasta el pie", () => {
    const g = geometriaHoja(6);
    expect(g.hFila).toBeGreaterThan(geometriaHoja(FILAS_OFICIAL).hFila);
    expect(g.yObs + g.hObs).toBeCloseTo(g.yLegal - 8, 6);
  });
});

describe("Excel del anexo — la fórmula de V apunta a las columnas correctas", () => {
  it("bloque 1: cantidad B, espesor C, ancho D, largo E (N° es A)", () => {
    expect(formulaV(0, 11, "pt")).toBe('IF(B11="",0,ROUND(B11*C11*D11*E11/12,3))');
  });

  it("bloque 3 arranca en la columna M: las referencias se corren de a 6", () => {
    expect(formulaV(12, 11, "pt")).toBe('IF(N11="",0,ROUND(N11*O11*P11*Q11/12,3))');
  });

  it("en m³ multiplica por los factores de conversión, no divide por 12", () => {
    expect(formulaV(0, 12, "m3")).toBe('IF(B12="",0,ROUND(B12*(C12*0.0254)*(D12*0.0254)*(E12*0.3048),3))');
  });
});
