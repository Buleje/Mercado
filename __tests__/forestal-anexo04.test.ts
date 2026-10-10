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
  reconciliarTotales, FILAS_OFICIAL, PAGINA,
} from "@/lib/forestal/anexo04-serfor";
import { formulaV } from "@/lib/forestal/anexo04-excel";
import { validarAnexo04, anexoPresentable, type IdentidadCtp } from "@/lib/forestal/anexo04-validacion";
import {
  filtrarEmisiones, mesesDeEmisiones, emisionesDelMes, etiquetaMes, siguienteLibre, construirEmision,
  inicioDeEmision,
  type AnexoEmitido,
} from "@/lib/forestal/anexo04-registro";

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
    expect(anexo.totalM3).toBeCloseTo(10.64, 2); // m³ = PT ÷ 424 (no volumen geométrico)
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

  /**
   * El (3) VOLUMEN TOTAL es el de SU hoja (Brandon, 2026-08). Cada hoja se
   * muestra sola en un puesto de control: si las dos dijeran el total del
   * anexo, cualquiera de ellas ampararía el doble de lo que lleva.
   */
  describe("(3) VOLUMEN TOTAL por hoja", () => {
    const especies = ["Tornillo", "Cedro", "Capirona", "Cumala", "Bolaina"];
    const rows = especies.map((e, i) => pieza(i === 4 ? 1 : 10, 6, 6, 8, e));
    const anexo = construirAnexo04(rows, OFICIAL);

    it("cada hoja declara lo suyo, no el total del anexo", () => {
      expect(anexo.hojas).toHaveLength(2);
      const [h1, h2] = anexo.hojas;
      expect(h1!.totalM3).toBeGreaterThan(h2!.totalM3);
      expect(h1!.totalM3).not.toBe(anexo.totalM3);
      expect(h2!.totalM3).not.toBe(anexo.totalM3);
    });

    it("las hojas suman el total del anexo EXACTO (Brandon, 2026-08: sin desvío de 0,001-0,003 por hoja)", () => {
      const suma = anexo.hojas.reduce((a, h) => a + h.totalM3, 0);
      // En milésimos (enteros): el redondeo de punto flotante de sumar 2
      // hojas no puede dejar un resto de 0,0000000001 leyéndose como desvío.
      expect(Math.round(suma * 1000)).toBe(Math.round(anexo.totalM3 * 1000));
    });

    it("con una sola hoja, el total de la hoja ES el del anexo", () => {
      const uno = construirAnexo04(LOTE, OFICIAL);
      expect(uno.hojas).toHaveLength(1);
      expect(uno.hojas[0]!.totalM3).toBe(uno.totalM3);
    });

    it("el total de la hoja va en m³ aunque la columna V vaya en pies tablares", () => {
      const enPt = construirAnexo04(LOTE, { unidadV: "pt", modo: "oficial" });
      const enM3 = construirAnexo04(LOTE, { unidadV: "m3", modo: "oficial" });
      // El subtotal del bloque cambia de unidad; el (3) de la hoja, no.
      expect(enPt.hojas[0]!.bloques[0]!.subtotal).not.toBe(enM3.hojas[0]!.bloques[0]!.subtotal);
      expect(enPt.hojas[0]!.totalM3).toBe(enM3.hojas[0]!.totalM3);
    });
  });

  /**
   * Caso real que motivó el fix (Brandon, 2026-08-18): con varias hojas, cada
   * una redondea su propio total a 3 decimales por separado — sumarlas podía
   * quedar a 0,001-0,003 m³ del total del anexo. `reconciliarTotales` es la
   * pieza que lo cierra exacto, sin tocar de dónde salió cada valor.
   */
  describe("reconciliarTotales — cierre exacto contra un objetivo", () => {
    it("reparte el resto de milésimos cuando la suma redondeada queda corta", () => {
      // 10.6666 + 10.6667 + 6.4667 = 27.8000 real, pero r3 por separado da
      // 10.667 + 10.667 + 6.467 = 27.801 — 0,001 de más que el objetivo real.
      const out = reconciliarTotales([10.667, 10.667, 6.467], 27.8);
      expect(out.reduce((a, v) => a + v, 0)).toBeCloseTo(27.8, 6);
      expect(Math.round(out.reduce((a, v) => a + v, 0) * 1000)).toBe(27800);
    });

    it("ajusta primero el valor más grande (el desvío no se nota en una hoja chica)", () => {
      const out = reconciliarTotales([1, 10], 11.001);
      expect(out).toEqual([1, 10.001]);
    });

    it("sin diferencia, no toca nada", () => {
      expect(reconciliarTotales([5, 3.5], 8.5)).toEqual([5, 3.5]);
    });

    it("nunca deja un valor negativo aunque el objetivo sea menor que todos", () => {
      const out = reconciliarTotales([0.001, 0.001], 0);
      expect(out.every((v) => v >= 0)).toBe(true);
    });

    it("lista vacía: nada que reconciliar", () => {
      expect(reconciliarTotales([], 5)).toEqual([]);
    });
  });

  /**
   * (3) VOLUMEN TOTAL declarado a mano — Brandon, 2026-08-18: "el anexo da
   * 27,770 y quiero que sea 27,771, sin tocar medidas". `totalManualM3`
   * reemplaza el total impreso y reconcilia las hojas contra él; el total
   * REAL (sumado desde las piezas) sigue disponible en `totalCalculadoM3`
   * para no perder de vista cuánto se ajustó.
   */
  describe("totalManualM3 — declarar el total a mano", () => {
    it("con una sola hoja, la hoja pasa a declarar EXACTO lo tipeado", () => {
      const auto = construirAnexo04(LOTE, OFICIAL);
      const manual = construirAnexo04(LOTE, OFICIAL, { totalManualM3: auto.totalM3 + 0.003 });
      expect(manual.totalM3).toBeCloseTo(auto.totalM3 + 0.003, 6);
      expect(manual.hojas[0]!.totalM3).toBe(manual.totalM3);
      expect(manual.totalCalculadoM3).toBe(auto.totalM3); // el real no se pierde
    });

    it("con varias hojas, reconcilia contra el total a mano — no contra el calculado", () => {
      const especies = ["Tornillo", "Cedro", "Capirona", "Cumala", "Bolaina"];
      const rows = especies.map((e, i) => pieza(i === 4 ? 1 : 10, 6, 6, 8, e));
      const auto = construirAnexo04(rows, OFICIAL);
      const objetivo = auto.totalM3 + 0.002;
      const manual = construirAnexo04(rows, OFICIAL, { totalManualM3: objetivo });
      const suma = manual.hojas.reduce((a, h) => a + h.totalM3, 0);
      expect(Math.round(suma * 1000)).toBe(Math.round(objetivo * 1000));
      expect(manual.totalM3).toBeCloseTo(objetivo, 6);
    });

    it("NO toca las medidas ni los subtotales por bloque — sólo el total impreso", () => {
      const auto = construirAnexo04(LOTE, OFICIAL);
      const manual = construirAnexo04(LOTE, OFICIAL, { totalManualM3: auto.totalM3 + 0.5 });
      expect(manual.hojas[0]!.bloques).toEqual(auto.hojas[0]!.bloques);
    });

    it("sin piezas, un total a mano no se declara (la hoja en blanco sigue en 0)", () => {
      const manual = construirAnexo04([], OFICIAL, { totalManualM3: 27.771 });
      expect(manual.totalM3).toBe(0);
    });

    it("un valor inválido (negativo, no numérico) cae al calculado", () => {
      const auto = construirAnexo04(LOTE, OFICIAL);
      expect(construirAnexo04(LOTE, OFICIAL, { totalManualM3: -1 }).totalM3).toBe(auto.totalM3);
      expect(construirAnexo04(LOTE, OFICIAL, { totalManualM3: NaN }).totalM3).toBe(auto.totalM3);
      expect(construirAnexo04(LOTE, OFICIAL, { totalManualM3: null }).totalM3).toBe(auto.totalM3);
    });
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
    expect(anexo.totalM3).toBeCloseTo(10.64, 2); // m³ = PT ÷ 424 (no volumen geométrico)
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

  it("en m³ divide el pie tablar por 424 (la conversión comercial)", () => {
    expect(formulaV(0, 12, "m3")).toBe('IF(B12="",0,ROUND(B12*C12*D12*E12/12/424,3))');
  });
});

describe("validarAnexo04 — checklist antes de emitir", () => {
  const COMPLETO = {
    numero: "2-19-0461363", gtf: "19-001-0000052", empresa: "Maderera San Martín S.A.C.",
    observaciones: "", firmante: "Brandon Buleje", documento: "71234567", cargo: "Jefe de planta",
    unidadV: "pt", modo: "oficial",
  } as const;

  it("un anexo completo no tiene nada que reclamar", () => {
    const anexo = construirAnexo04(LOTE, COMPLETO);
    const avisos = validarAnexo04(COMPLETO, anexo, LOTE);
    expect(avisos).toEqual([]);
    expect(anexoPresentable(avisos)).toBe(true);
  });

  it("sin GTF, sin N° y sin firmante = errores que invalidan el papel", () => {
    const datos = { ...COMPLETO, gtf: "", numero: "", firmante: "  " };
    const avisos = validarAnexo04(datos, construirAnexo04(LOTE, datos), LOTE);
    expect(avisos.filter((a) => a.nivel === "error")).toHaveLength(3);
    expect(anexoPresentable(avisos)).toBe(false);
    expect(avisos[0].mensaje).toMatch(/GTF|N°|firma/i);
  });

  it("falta el DNI o el cargo: avisa pero el anexo sigue siendo presentable", () => {
    const datos = { ...COMPLETO, documento: "", cargo: "" };
    const avisos = validarAnexo04(datos, construirAnexo04(LOTE, datos), LOTE);
    expect(avisos.every((a) => a.nivel === "aviso")).toBe(true);
    expect(anexoPresentable(avisos)).toBe(true);
  });

  it("piezas sin especie = error (el bloque (4) quedaría sin rotular)", () => {
    const sinEspecie = [{ ...pieza(3, 2, 8, 10), especie: undefined }];
    const avisos = validarAnexo04(COMPLETO, construirAnexo04(sinEspecie, COMPLETO), sinEspecie);
    expect(avisos.some((a) => a.nivel === "error" && /Especie/.test(a.mensaje))).toBe(true);
  });

  it("lote vacío: avisa que la hoja sale en blanco", () => {
    const avisos = validarAnexo04(COMPLETO, construirAnexo04([], COMPLETO), []);
    expect(avisos.some((a) => /en blanco/.test(a.mensaje))).toBe(true);
  });

  it("medida dada vuelta (más gruesa que ancha): aviso, no error", () => {
    const raras = [pieza(1, 8, 2, 10)];   // espesor 8" con ancho 2"
    const avisos = validarAnexo04(COMPLETO, construirAnexo04(raras, COMPLETO), raras);
    expect(avisos.some((a) => a.nivel === "aviso" && /fuera de lo común/.test(a.mensaje))).toBe(true);
    expect(anexoPresentable(avisos)).toBe(true);
  });

  it("la paquetería corta legítima (6×6×1,5 pies) NO se marca como rara", () => {
    // El validador de la VOZ sí la marcaría (exige largo ≥ 2 pies): el del anexo
    // no puede, porque esa medida está en las GTF reales.
    const corta = [pieza(44, 6, 6, 1.5)];
    const avisos = validarAnexo04(COMPLETO, construirAnexo04(corta, COMPLETO), corta);
    expect(avisos).toEqual([]);
  });
});

describe("filtrarEmisiones — buscar en la bandeja", () => {
  const emision = (numero: string, gtf: string, firmante: string): AnexoEmitido => ({
    id: numero, numero, gtf, fecha: "2026-07-25", empresa: "Maderera SAC", firmante,
    documento: "", cargo: "", observaciones: "", unidadV: "pt", modo: "oficial",
    hojas: 1, totalPiezas: 10, totalPt: 100, totalM3: 0.24, piezas: [], createdAt: "2026-07-25T10:00:00Z",
  });
  const LISTA = [
    emision("2-19-0461363", "19-001-0000052", "Brandon Buleje"),
    emision("2-19-0461364", "19-001-0000053", "Rosa Laura"),
  ];

  it("busca por N°, GTF o firmante, sin importar mayúsculas", () => {
    expect(filtrarEmisiones(LISTA, "0461364")).toHaveLength(1);
    expect(filtrarEmisiones(LISTA, "0000052")[0].numero).toBe("2-19-0461363");
    expect(filtrarEmisiones(LISTA, "rosa")[0].firmante).toBe("Rosa Laura");
  });

  it("término vacío devuelve todo; sin coincidencias devuelve nada", () => {
    expect(filtrarEmisiones(LISTA, "   ")).toHaveLength(2);
    expect(filtrarEmisiones(LISTA, "camión")).toHaveLength(0);
  });
});

describe("cotejo anexo ↔ guía del Libro", () => {
  const DATOS = {
    numero: "2-19-0461363", gtf: "19-001-0000052", empresa: "Maderera SAC",
    observaciones: "", firmante: "Brandon", documento: "71234567", cargo: "Jefe",
    unidadV: "pt", modo: "oficial",
  } as const;
  const anexoDe = (piezas: PiezaCubicada[]) => construirAnexo04(piezas, DATOS);
  const UNA = [pieza(10, 2, 8, 12)];            // 10 × (2×8×12/12) = 160 PT
  const sinCotejo = validarAnexo04(DATOS, anexoDe(UNA), UNA).length;

  it("cuadra con la guía: no agrega nada", () => {
    const avisos = validarAnexo04(DATOS, anexoDe(UNA), UNA, { declarado: { cantidad: 160, unidad: "pt" } });
    expect(avisos).toHaveLength(sinCotejo);
  });

  it("el anexo detalla MÁS que la guía = error (blanqueo de volumen)", () => {
    const avisos = validarAnexo04(DATOS, anexoDe(UNA), UNA, { declarado: { cantidad: 100, unidad: "pt" } });
    const cotejo = avisos.find((a) => /amparando/.test(a.mensaje));
    expect(cotejo?.nivel).toBe("error");
    expect(cotejo?.mensaje).toContain("60");
    expect(anexoPresentable(avisos)).toBe(false);
  });

  it("el anexo detalla MENOS que la guía = aviso (puede haber producto sin cubicar)", () => {
    const avisos = validarAnexo04(DATOS, anexoDe(UNA), UNA, { declarado: { cantidad: 200, unidad: "pt" } });
    const cotejo = avisos.find((a) => /faltan/.test(a.mensaje));
    expect(cotejo?.nivel).toBe("aviso");
    expect(anexoPresentable(avisos)).toBe(true);
  });

  it("tolera el redondeo (0,5 %) y compara en m³ cuando la guía va en m³", () => {
    expect(validarAnexo04(DATOS, anexoDe(UNA), UNA, { declarado: { cantidad: 160.5, unidad: "pt" } })).toHaveLength(sinCotejo);
    const m3 = anexoDe(UNA).totalM3;
    expect(validarAnexo04(DATOS, anexoDe(UNA), UNA, { declarado: { cantidad: m3, unidad: "m3" } })).toHaveLength(sinCotejo);
    expect(validarAnexo04(DATOS, anexoDe(UNA), UNA, { declarado: { cantidad: m3 / 2, unidad: "m3" } })
      .some((a) => a.nivel === "error")).toBe(true);
  });

  it("sin unidad comparable o sin dato no inventa un cotejo", () => {
    expect(validarAnexo04(DATOS, anexoDe(UNA), UNA, { declarado: { cantidad: 1, unidad: "kg" } })).toHaveLength(sinCotejo);
    expect(validarAnexo04(DATOS, anexoDe(UNA), UNA, { declarado: { cantidad: 0, unidad: "pt" } })).toHaveLength(sinCotejo);
    expect(validarAnexo04(DATOS, anexoDe(UNA), UNA, { declarado: null })).toHaveLength(sinCotejo);
  });
});

describe("cotejo por piezas (se cuentan, no se miden)", () => {
  const DATOS = {
    numero: "1", gtf: "1", empresa: "X", observaciones: "", firmante: "Y",
    documento: "1", cargo: "Z", unidadV: "pt", modo: "oficial",
  } as const;
  const UNA = [pieza(10, 2, 8, 12)];             // 10 piezas, 160 PT
  const conCotejo = (piezasGuia: number) =>
    validarAnexo04(DATOS, construirAnexo04(UNA, DATOS), UNA, { declarado: { cantidad: 160, unidad: "pt", piezas: piezasGuia } });

  it("mismas piezas que la guía: nada que decir", () => {
    expect(conCotejo(10)).toEqual([]);
  });

  it("el anexo lista más piezas que la guía = error", () => {
    const a = conCotejo(4).find((x) => /piezas/.test(x.mensaje));
    expect(a?.nivel).toBe("error");
    expect(a?.mensaje).toContain("6 de más");
  });

  it("lista menos piezas = aviso (el despacho puede llevar producto sin cubicar)", () => {
    const a = conCotejo(25).find((x) => /piezas/.test(x.mensaje));
    expect(a?.nivel).toBe("aviso");
    expect(anexoPresentable(conCotejo(25))).toBe(true);
  });

  it("sin piezas declaradas no se coteja (null = no se sabe, nunca 0)", () => {
    expect(validarAnexo04(DATOS, construirAnexo04(UNA, DATOS), UNA, { declarado: { cantidad: 160, unidad: "pt", piezas: null } })).toEqual([]);
  });
});

describe("invariantes del conjunto de anexos", () => {
  const DATOS = {
    numero: "2-19-0000010", gtf: "GTF-1", empresa: "X", observaciones: "",
    firmante: "Y", documento: "1", cargo: "Z", unidadV: "pt", modo: "oficial",
  } as const;
  const UNA = [pieza(10, 2, 8, 12)];              // 160 PT · 10 piezas
  const anexo = construirAnexo04(UNA, DATOS);
  const emitido = (over: Partial<AnexoEmitido>): AnexoEmitido => ({
    id: "e1", numero: "2-19-0000009", gtf: "GTF-1", fecha: "2026-07-20", empresa: "X",
    firmante: "Y", documento: "1", cargo: "Z", observaciones: "", unidadV: "pt", modo: "oficial",
    hojas: 1, totalPiezas: 10, totalPt: 100, totalM3: 0.24, piezas: [], createdAt: "2026-07-20T10:00:00Z",
    ...over,
  });

  it("dos anexos de la misma guía no pueden amparar más que ella", () => {
    // La guía declara 200 PT; ya se emitió uno por 100 y este suma 160.
    const avisos = validarAnexo04(DATOS, anexo, UNA, {
      declarado: { cantidad: 200, unidad: "pt" },
      emitidos: [emitido({ ctpEntryId: "desp-1", totalPt: 100 })],
      ctpEntryId: "desp-1",
    });
    const acumulado = avisos.find((a) => /entre todos amparan/.test(a.mensaje));
    expect(acumulado?.nivel).toBe("error");
    expect(acumulado?.mensaje).toContain("260");
  });

  it("re-emitir el MISMO anexo (mismo N° + GTF) no se acusa a sí mismo", () => {
    const avisos = validarAnexo04(DATOS, anexo, UNA, {
      declarado: { cantidad: 160, unidad: "pt" },
      emitidos: [emitido({ numero: DATOS.numero, gtf: DATOS.gtf, ctpEntryId: "desp-1", totalPt: 160 })],
      ctpEntryId: "desp-1",
    });
    expect(avisos).toEqual([]);
  });

  it("los anexos de OTRO despacho no cuentan para esta guía", () => {
    const avisos = validarAnexo04(DATOS, anexo, UNA, {
      declarado: { cantidad: 160, unidad: "pt" },
      emitidos: [emitido({ ctpEntryId: "otro-despacho", totalPt: 5000 })],
      ctpEntryId: "desp-1",
    });
    expect(avisos).toEqual([]);
  });

  it("el mismo N° en otra GTF es un documento duplicado = error", () => {
    const avisos = validarAnexo04(DATOS, anexo, UNA, {
      emitidos: [emitido({ numero: DATOS.numero, gtf: "GTF-OTRA" })],
    });
    const dup = avisos.find((a) => /ya se usó/.test(a.mensaje));
    expect(dup?.nivel).toBe("error");
    expect(dup?.mensaje).toContain("GTF-OTRA");
  });

  it("el mismo N° en la MISMA GTF es la corrección del mismo papel", () => {
    const avisos = validarAnexo04(DATOS, anexo, UNA, {
      emitidos: [emitido({ numero: DATOS.numero, gtf: DATOS.gtf })],
    });
    expect(avisos).toEqual([]);
  });
});

describe("bandeja por mes", () => {
  const e = (fecha: string): AnexoEmitido => ({
    id: fecha, numero: fecha, gtf: "G", fecha, empresa: "", firmante: "", documento: "", cargo: "",
    observaciones: "", unidadV: "pt", modo: "oficial", hojas: 1, totalPiezas: 1, totalPt: 1, totalM3: 0.01,
    piezas: [], createdAt: `${fecha}T00:00:00Z`,
  });
  const LISTA = [e("2026-07-25"), e("2026-07-02"), e("2026-06-30")];

  it("lista los meses con emisiones, del más reciente al más viejo", () => {
    expect(mesesDeEmisiones(LISTA)).toEqual(["2026-07", "2026-06"]);
  });

  it("filtra por mes y sin mes devuelve todo", () => {
    expect(emisionesDelMes(LISTA, "2026-07")).toHaveLength(2);
    expect(emisionesDelMes(LISTA, "2026-06")).toHaveLength(1);
    expect(emisionesDelMes(LISTA, "")).toHaveLength(3);
  });

  it("etiqueta el mes en español", () => {
    expect(etiquetaMes("2026-07")).toMatch(/julio 2026/i);
  });
});

describe("siguienteLibre — el correlativo que sí se puede usar", () => {
  const e = (numero: string, gtf: string): AnexoEmitido => ({
    id: numero + gtf, numero, gtf, fecha: "2026-07-25", empresa: "", firmante: "", documento: "",
    cargo: "", observaciones: "", unidadV: "pt", modo: "oficial", hojas: 1, totalPiezas: 1,
    totalPt: 1, totalM3: 0.01, piezas: [], createdAt: "2026-07-25T00:00:00Z",
  });

  it("si el N° está libre lo deja como está", () => {
    expect(siguienteLibre("2-19-0461363", [], "GTF-1")).toBe("2-19-0461363");
  });

  it("salta los usados por otras guías hasta encontrar uno libre", () => {
    const usados = [e("2-19-0461363", "GTF-A"), e("2-19-0461364", "GTF-B")];
    expect(siguienteLibre("2-19-0461363", usados, "GTF-NUEVA")).toBe("2-19-0461365");
  });

  it("no se salta el suyo propio (mismo N° en la MISMA guía)", () => {
    expect(siguienteLibre("2-19-0461363", [e("2-19-0461363", "GTF-A")], "GTF-A")).toBe("2-19-0461363");
  });

  it("un N° sin dígitos no entra en loop: devuelve el mismo", () => {
    expect(siguienteLibre("SIN-NUMERO", [e("SIN-NUMERO", "GTF-A")], "GTF-B")).toBe("SIN-NUMERO");
  });

  it("el aviso de N° repetido trae la sugerencia lista para aplicar", () => {
    const datos = {
      numero: "2-19-0461363", gtf: "GTF-NUEVA", empresa: "X", observaciones: "",
      firmante: "Y", documento: "1", cargo: "Z", unidadV: "pt", modo: "oficial",
    } as const;
    const piezas = [pieza(10, 2, 8, 12)];
    const avisos = validarAnexo04(datos, construirAnexo04(piezas, datos), piezas, {
      emitidos: [e("2-19-0461363", "GTF-A")],
    });
    const dup = avisos.find((a) => a.sugerencia);
    expect(dup?.sugerencia).toEqual({ campo: "numero", valor: "2-19-0461364", label: "Usar 2-19-0461364" });
  });
});

describe("fidelidad de la re-impresión", () => {
  it("la emisión guarda la especie del lote: sin ella el anexo reimpreso diría SIN ESPECIE", () => {
    const sinEspeciePropia = [{ ...pieza(4, 2, 8, 10), especie: undefined }];
    const emision = construirEmision({
      datos: {
        numero: "1", gtf: "G", empresa: "", firmante: "", documento: "", cargo: "",
        observaciones: "", unidadV: "pt", modo: "compacto",
      },
      piezas: sinEspeciePropia,
      especieGlobal: "Capirona",
    });
    expect(emision.especieGlobal).toBe("Capirona");
    // Y con ese dato el papel vuelve a salir rotulado igual que el original.
    const reimpreso = construirAnexo04(emision.piezas, emision, { especieGlobal: emision.especieGlobal });
    expect(reimpreso.hojas[0].bloques[0].especie).toBe("CAPIRONA");
  });

  it("los totales de la emisión salen de las piezas, no de lo que diga el cliente", () => {
    const emision = construirEmision({
      datos: {
        numero: "1", gtf: "G", empresa: "", firmante: "", documento: "", cargo: "",
        observaciones: "", unidadV: "pt", modo: "oficial",
      },
      piezas: [pieza(10, 2, 8, 12)],   // 160 PT · 10 piezas
    });
    expect(emision.totalPt).toBe(160);
    expect(emision.totalPiezas).toBe(10);
    expect(emision.hojas).toBe(1);
  });
});

describe("cotejo con la Ficha legal del CTP", () => {
  const DATOS = {
    numero: "1", gtf: "G", empresa: "Maderera San Martín S.A.C.", observaciones: "",
    firmante: "Brandon Buleje", documento: "71234567", cargo: "Jefe", unidadV: "pt", modo: "oficial",
  } as const;
  const UNA = [pieza(10, 2, 8, 12)];
  const conFicha = (ficha: IdentidadCtp | null) =>
    validarAnexo04(DATOS, construirAnexo04(UNA, DATOS), UNA, { ficha });

  it("cuando coincide con lo registrado no dice nada (ignora mayúsculas y espacios)", () => {
    expect(conFicha({
      razonSocial: "  maderera san martín s.a.c. ",
      representante: "Brandon Buleje",
      representanteDni: "71234567",
    })).toEqual([]);
  });

  it("razón social distinta a la registrada = aviso con arreglo de un click", () => {
    const avisos = conFicha({ razonSocial: "Maderera Ucayali E.I.R.L." });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].nivel).toBe("aviso");
    expect(avisos[0].sugerencia).toEqual({
      campo: "empresa", valor: "Maderera Ucayali E.I.R.L.", label: "Usar Maderera Ucayali E.I.R.L.",
    });
  });

  it("emisor y documento distintos también se avisan (puede firmar un apoderado)", () => {
    const avisos = conFicha({ representante: "Rosa Laura", representanteDni: "70000001" });
    expect(avisos.map((a) => a.sugerencia?.campo)).toEqual(["firmante", "documento"]);
    expect(anexoPresentable(avisos)).toBe(true);
  });

  it("sin ficha, o con la ficha vacía, no inventa avisos", () => {
    expect(conFicha(null)).toEqual([]);
    expect(conFicha({})).toEqual([]);
    expect(conFicha({ razonSocial: "   " })).toEqual([]);
  });
});

describe("inicioDeEmision — con qué arranca el modal", () => {
  const emitido = (over: Partial<AnexoEmitido>): AnexoEmitido => ({
    id: "e", numero: "2-19-0000001", gtf: "G-1", fecha: "2026-07-20", empresa: "", firmante: "",
    documento: "", cargo: "", observaciones: "", unidadV: "pt", modo: "oficial", hojas: 1,
    totalPiezas: 1, totalPt: 1, totalM3: 0.01, piezas: [], createdAt: "2026-07-20T10:00:00Z", ...over,
  });

  it("si la guía ya tiene anexo, se carga el más reciente", () => {
    const viejo = emitido({ id: "v", numero: "A-1", ctpEntryId: "d1", createdAt: "2026-07-01T00:00:00Z" });
    const nuevo = emitido({ id: "n", numero: "A-2", ctpEntryId: "d1", createdAt: "2026-07-20T00:00:00Z" });
    const inicio = inicioDeEmision("X-9", "G-9", [viejo, nuevo], "d1");
    expect(inicio.emision?.id).toBe("n");
    expect(inicio.numeroSugerido).toBeUndefined();
  });

  it("los anexos de otras guías no cuentan", () => {
    const otro = emitido({ ctpEntryId: "otra-guia" });
    expect(inicioDeEmision("2-19-0000009", "G-9", [otro], "d1").emision).toBeUndefined();
  });

  it("si el N° guardado ya se usó en otra guía, propone el siguiente libre", () => {
    const inicio = inicioDeEmision("2-19-0000001", "G-NUEVA", [emitido({ gtf: "G-1" })], "d2");
    expect(inicio.numeroSugerido).toBe("2-19-0000002");
  });

  it("un N° libre se deja tal cual, y sin N° no propone nada", () => {
    expect(inicioDeEmision("2-19-0000050", "G-9", [emitido({})], "d2")).toEqual({});
    expect(inicioDeEmision("", "G-9", [emitido({})], "d2")).toEqual({});
  });
});

describe("cotejo contra la corrida de producción (sin despacho)", () => {
  const DATOS = {
    numero: "1", gtf: "G", empresa: "X", observaciones: "", firmante: "Y",
    documento: "1", cargo: "Z", unidadV: "pt", modo: "oficial",
  } as const;
  const UNA = [pieza(10, 2, 8, 12)];   // 160 PT · 10 piezas

  it("habla de la corrida, no de la guía, cuando el origen es producción", () => {
    const avisos = validarAnexo04(DATOS, construirAnexo04(UNA, DATOS), UNA, {
      declarado: { cantidad: 100, unidad: "pt", fuente: "corrida" },
    });
    expect(avisos[0].nivel).toBe("error");
    expect(avisos[0].mensaje).toContain("la corrida produjo");
    expect(avisos[0].mensaje).not.toContain("guía");
  });

  it("la regla es la misma: detallar de más es error, de menos aviso", () => {
    const menos = validarAnexo04(DATOS, construirAnexo04(UNA, DATOS), UNA, {
      declarado: { cantidad: 300, unidad: "pt", fuente: "corrida" },
    });
    expect(menos[0].nivel).toBe("aviso");
    expect(menos[0].mensaje).toContain("de la corrida");
    expect(anexoPresentable(menos)).toBe(true);
  });

  it("sin fuente explícita sigue hablando de la guía (compatibilidad)", () => {
    const avisos = validarAnexo04(DATOS, construirAnexo04(UNA, DATOS), UNA, {
      declarado: { cantidad: 100, unidad: "pt" },
    });
    expect(avisos[0].mensaje).toContain("la guía declara");
  });
});
