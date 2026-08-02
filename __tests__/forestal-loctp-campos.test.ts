import { describe, it, expect } from "vitest";
import {
  faltantesIngresoPorTipo,
  SECCION_1_INGRESOS,
  SECCION_2_CONSUMOS,
  SECCION_3_PRODUCCION,
  SECCION_4_SALIDAS,
  TIPOS_DOCUMENTO_LOCTP,
  UNIDADES_LOCTP,
  esTipoDocumentoLoctp,
  esUnidadLoctp,
  faltantesIngreso,
  faltantesProduccion,
  faltantesSalida,
  resumenFaltantes,
} from "@/lib/forestal/loctp-campos";

/**
 * El formato del LO-CTP lo fija una RDE del SERFOR y su numeración se transcribió
 * de la guía oficial. Si estos casilleros se mueven o se renumeran sin querer, el
 * libro deja de casar con lo que pide el SNIFFS y con lo que revisa un
 * fiscalizador (ADR-311). Dos suposiciones ya salieron mal antes de leer la
 * fuente: que Ingresos tenía 12 casilleros y que el (10) era "código de otro CTP".
 */

const INGRESO_COMPLETO = {
  libroNro: 128,
  entryDate: "2026-07-30",
  docType: "GTF",
  gtfNumber: "001-00000025",
  originSourceNumber: "RD-SD-549",
  productType: "rolliza",
  speciesCommonName: "Tornillo",
  speciesScientificName: "Cedrelinga catenaeformis",
  originCode: "25-UCA/CON-2019-001",
  ctpProductCode: "T-0142",
  unit: "m3",
  volumeM3: 12.5,
  notes: "",
};

const PRODUCCION_COMPLETA = {
  lineNo: 7,
  entryDate: "2026-07-30",
  productType: "aserrada",
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga catenaeformis",
  unit: "pt",
  quantity: 850,
  lote: "L-2026-07",
  observations: "",
};

const SALIDA_COMPLETA = {
  lineNo: 12,
  entryDate: "2026-07-30",
  docType: "GTF",
  gtfNumber: "001-00000031",
  productType: "aserrada",
  speciesCommon: "Tornillo",
  speciesScientific: "Cedrelinga catenaeformis",
  lote: "L-2026-07",
  codigoProducto: "1-13-51-A-1",
  unit: "pt",
  quantity: 850,
  observations: "VENTA",
};

describe("LO-CTP · las cuatro secciones del formato", () => {
  const casos = [
    { nombre: "1 Ingresos", cols: SECCION_1_INGRESOS, total: 13 },
    { nombre: "2 Consumos", cols: SECCION_2_CONSUMOS, total: 11 },
    { nombre: "3 Producción", cols: SECCION_3_PRODUCCION, total: 9 },
    { nombre: "4 Salidas", cols: SECCION_4_SALIDAS, total: 12 },
  ];

  for (const { nombre, cols, total } of casos) {
    it(`la sección ${nombre} tiene ${total} casilleros numerados 1..${total} sin huecos`, () => {
      expect(cols).toHaveLength(total);
      expect(cols.map((c) => c.col)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    });

    it(`la sección ${nombre} no repite el campo que llena cada casillero`, () => {
      const campos = cols.map((c) => c.campo);
      expect(new Set(campos).size).toBe(campos.length);
    });
  }

  it("en Ingresos, el casillero 10 es el código que asigna el CTP (no el de otro centro)", () => {
    const c10 = SECCION_1_INGRESOS.find((c) => c.col === 10);
    expect(c10?.campo).toBe("ctpProductCode");
    expect(c10?.label).toMatch(/asigna el CTP/i);
    // El (9) es el otro código: el que traía desde la fuente de origen.
    expect(SECCION_1_INGRESOS.find((c) => c.col === 9)?.campo).toBe("originCode");
  });

  it("Producción NO tiene columnas de origen — eso lo cubre la sección de Consumos", () => {
    const campos = SECCION_3_PRODUCCION.map((c) => c.campo);
    expect(campos).not.toContain("originCode");
    expect(campos).not.toContain("originSourceNumber");
    expect(SECCION_2_CONSUMOS.map((c) => c.campo)).toContain("codigoOrigen");
  });

  it("las salidas llevan N° de documento, lote y código; los códigos no son obligatorios", () => {
    const porCol = Object.fromEntries(SECCION_4_SALIDAS.map((c) => [c.col, c]));
    expect(porCol[4].campo).toBe("gtfNumber");
    expect(porCol[8].campo).toBe("lote");
    expect(porCol[9].campo).toBe("codigoProducto");
    expect(porCol[8].obligatorio).toBe(false);
    expect(porCol[9].obligatorio).toBe(false);
  });
});

describe("LO-CTP · catálogos", () => {
  it("tipo de documento admite GTF, GRR y Otros", () => {
    expect(TIPOS_DOCUMENTO_LOCTP.map((t) => t.valor)).toEqual(["GTF", "GRR", "Otros"]);
    expect(esTipoDocumentoLoctp("GRR")).toBe(true);
    expect(esTipoDocumentoLoctp("factura")).toBe(false);
    expect(esTipoDocumentoLoctp(null)).toBe(false);
  });

  it("unidad admite m3, unidad, kg y tonelada", () => {
    expect(UNIDADES_LOCTP.map((u) => u.valor)).toEqual(["m3", "unidad", "kg", "tonelada"]);
    expect(esUnidadLoctp("m3")).toBe(true);
    expect(esUnidadLoctp("pt")).toBe(false);
  });
});

describe("LO-CTP · qué falta en una fila", () => {
  it("una fila completa no tiene faltantes", () => {
    expect(faltantesIngreso(INGRESO_COMPLETO)).toEqual([]);
    expect(faltantesProduccion(PRODUCCION_COMPLETA)).toEqual([]);
    expect(faltantesSalida(SALIDA_COMPLETA)).toEqual([]);
  });

  it("un código vacío no cuenta como faltante (ninguno de los dos es obligatorio)", () => {
    expect(faltantesIngreso({ ...INGRESO_COMPLETO, originCode: "", ctpProductCode: null })).toEqual([]);
  });

  it("detecta el folio sin asignar, el documento sin tipo y la cantidad en cero", () => {
    const faltan = faltantesIngreso({
      ...INGRESO_COMPLETO,
      libroNro: null,
      docType: "   ",
      volumeM3: 0,
    });
    expect(faltan.map((f) => f.col)).toEqual([1, 3, 12]);
    expect(faltan.map((f) => f.campo)).toEqual(["libroNro", "docType", "volumeM3"]);
  });

  it("el nombre científico es obligatorio en las tres secciones con especie", () => {
    expect(faltantesIngreso({ ...INGRESO_COMPLETO, speciesScientificName: null }).map((f) => f.col)).toEqual([8]);
    expect(faltantesProduccion({ ...PRODUCCION_COMPLETA, speciesScientific: "" }).map((f) => f.col)).toEqual([5]);
    expect(faltantesSalida({ ...SALIDA_COMPLETA, speciesScientific: null }).map((f) => f.col)).toEqual([7]);
  });

  it("una cantidad negativa o no numérica falta igual que la vacía", () => {
    expect(faltantesIngreso({ ...INGRESO_COMPLETO, volumeM3: -3 }).map((f) => f.col)).toEqual([12]);
    expect(faltantesIngreso({ ...INGRESO_COMPLETO, volumeM3: Number.NaN }).map((f) => f.col)).toEqual([12]);
  });

  it("en la salida, sin N° de documento no se puede presentar", () => {
    expect(faltantesSalida({ ...SALIDA_COMPLETA, gtfNumber: null }).map((f) => f.col)).toEqual([4]);
  });
});

describe("LO-CTP · resumen para el chip", () => {
  it("sin faltantes dice que está listo", () => {
    expect(resumenFaltantes([])).toBe("Listo para el LO-CTP");
  });

  it("lista hasta 3 campos con su número de casillero, ordenados", () => {
    const faltan = faltantesIngreso({ ...INGRESO_COMPLETO, docType: "", libroNro: null });
    expect(resumenFaltantes(faltan)).toBe("Falta (1) N° de registro, (3) Tipo de documento");
  });

  it("con más de 3 dice cuántos son y muestra los primeros", () => {
    // Una fila vacía le debe los 10 casilleros obligatorios de la Sección 1.
    expect(faltantesIngreso({})).toHaveLength(10);
    const texto = resumenFaltantes(faltantesIngreso({}));
    expect(texto).toMatch(/^Faltan 10 campos: \(1\) N° de registro/);
    expect(texto.endsWith("…")).toBe(true);
  });
});

describe("faltantesIngresoPorTipo — separa lo que bloquea de lo que completa", () => {
  // Existe porque el mismo ingreso contestaba 2 (chip de la tabla, sólo
  // obligatorios) y 15 (modal, todos los vacíos del bloque) según dónde se lo
  // mirara, y el operador no sabía cuál lo frenaba.
  const completo = {
    libroNro: 17, entryDate: "2026-08-01", docType: "GTF", gtfNumber: "001-1",
    originSourceNumber: "1", productType: "rolliza", speciesCommonName: "Tornillo",
    speciesScientificName: "Cedrelinga", unit: "m3", volumeM3: 10,
    originCode: "CON-1", ctpProductCode: "P-1", notes: "ok",
  };

  it("con todo cargado no falta nada de ningún tipo", () => {
    const r = faltantesIngresoPorTipo(completo);
    expect(r.obligatorios).toHaveLength(0);
    expect(r.opcionales).toHaveLength(0);
  });

  it("un obligatorio vacío va al grupo que bloquea, con su N° de casillero", () => {
    const r = faltantesIngresoPorTipo({ ...completo, speciesScientificName: "" });
    expect(r.obligatorios).toHaveLength(1);
    expect(r.obligatorios[0].col).toBe(8);
    expect(r.opcionales).toHaveLength(0);
  });

  it("un opcional vacío NO bloquea: un ingreso sin observaciones está bien", () => {
    const r = faltantesIngresoPorTipo({ ...completo, notes: "" });
    expect(r.obligatorios).toHaveLength(0);
    expect(r.opcionales.map((c) => c.col)).toEqual([13]);
  });

  it("los obligatorios coinciden EXACTO con lo que reporta el chip de la tabla", () => {
    // Si divergieran, el modal y la tabla dirían números distintos del mismo
    // ingreso — que es justo el problema que este helper vino a resolver.
    const fila = { ...completo, originSourceNumber: "", unit: "", notes: "" };
    expect(faltantesIngresoPorTipo(fila).obligatorios.map((c) => c.col).sort())
      .toEqual(faltantesIngreso(fila).map((c) => c.col).sort());
  });
});
