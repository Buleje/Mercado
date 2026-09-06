/**
 * Importador del Libro CTP (LO-CTP · ADR-138) — tests puros de los parsers.
 *
 * Cubren lo que un E2E no debe ser el único guardián de:
 *  1. El happy path de los 3 registros (ingreso/producción/salida) + el enlace
 *     consumo→corrida por «Corrida #N».
 *  2. La PRIORIDAD POR KEYWORD del finder de columnas: «Código de Origen» debe
 *     ganar sobre «N° Fuente de Origen» (ambas contienen «origen»). Un bug real
 *     mapeaba el origen a «otro» por agarrar la columna equivocada.
 *  3. REGRESIÓN de la corrida fantasma: un archivo con SOLO «1. Ingreso», leído
 *     como producción, NO debe producir una corrida — ni en strict (solo por
 *     nombre de hoja) ni en no-strict (el fallback exige señal propia de
 *     producción, no el genérico «producto» que también trae el Ingreso).
 */

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  parseWoodEntriesXlsx,
  parseProduccionXlsx,
  parseSalidaXlsx,
} from "@/lib/forestal/ctp-import";

// ExcelJS.writeBuffer() → el parser hace .load(); el tipo es ArrayBuffer pero
// .load() acepta el Buffer en runtime. Cast acotado a este helper.
async function build(fn: (wb: ExcelJS.Workbook) => void): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  fn(wb);
  const buf = await wb.xlsx.writeBuffer();
  return buf as unknown as ArrayBuffer;
}

const ING_COLS = [
  { header: "N° Registro", key: "n" }, { header: "Fecha", key: "f" },
  { header: "Tipo de Documento", key: "td" }, { header: "N° de Documento", key: "nd" },
  { header: "N° Fuente de Origen/Procedencia", key: "fo" }, { header: "Código de Origen/Procedencia", key: "co" },
  { header: "Código de CTP", key: "cc" }, { header: "Tipo de Producto", key: "tp" },
  { header: "Especie", key: "e" }, { header: "Nombre científico", key: "sc" },
  { header: "CITES", key: "ci" }, { header: "N° Permiso CITES", key: "cp" },
  { header: "Unidad de Medida", key: "u" }, { header: "Cantidad", key: "q" }, { header: "Observaciones", key: "o" },
];
const PROD_COLS = [
  { header: "N°", key: "n" }, { header: "Fecha", key: "f" }, { header: "Código de CTP", key: "cc" },
  { header: "Tipo de Producto", key: "tp" }, { header: "Especie", key: "e" },
  { header: "N° Fuente (GTF ingreso)", key: "fo" }, { header: "Unidad de Medida", key: "u" },
  { header: "Cantidad", key: "q" }, { header: "Rendimiento %", key: "r" }, { header: "Observaciones", key: "o" },
];
const CONS_COLS = [
  { header: "N°", key: "n" }, { header: "N° Fuente (GTF ingreso)", key: "g" }, { header: "Especie", key: "e" },
  { header: "Producción destino", key: "c" }, { header: "Unidad de Medida", key: "u" }, { header: "Cantidad consumida", key: "q" },
];
const SAL_COLS = [
  { header: "N°", key: "n" }, { header: "Fecha", key: "f" }, { header: "Tipo de Documento", key: "td" },
  { header: "N° de Documento (GTF)", key: "nd" }, { header: "Código de CTP", key: "cc" },
  { header: "Tipo de Producto", key: "tp" }, { header: "Especie", key: "e" }, { header: "Unidad de Medida", key: "u" },
  { header: "Cantidad", key: "q" }, { header: "Destino", key: "de" }, { header: "Observaciones", key: "o" },
];

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

function addIngreso(wb: ExcelJS.Workbook, row: Record<string, unknown>) {
  const w = wb.addWorksheet("1. Ingreso");
  w.columns = ING_COLS;
  w.addRow(row);
}

describe("parseWoodEntriesXlsx — ingresos", () => {
  it("parsea una fila válida con todos los campos mapeados", async () => {
    const buf = await build((wb) => addIngreso(wb, {
      n: 1, f: D(2026, 6, 1), td: "GTF", nd: "GTF-001", fo: "CONC-1",
      co: "Concesión forestal · Ucayali", cc: "CTP-001", tp: "rolliza",
      e: "Tornillo", sc: "Cedrelinga cateniformis", ci: "", cp: "",
      u: "m³", q: 20, o: "Proveedor SAC",
    }));
    const res = await parseWoodEntriesXlsx(buf);
    expect(res.ok).toBe(true);
    expect(res.ingresos).toHaveLength(1);
    const i = res.ingresos[0];
    expect(i.gtfNumber).toBe("GTF-001");
    expect(i.speciesCommonName).toBe("Tornillo");
    expect(i.volumeM3).toBe(20);
    expect(i.productType).toBe("rolliza");
    expect(i.issues).toHaveLength(0);
  });

  it("reporta issue cuando falta la GTF (origen legal obligatorio)", async () => {
    const buf = await build((wb) => addIngreso(wb, {
      n: 1, f: D(2026, 6, 1), td: "GTF", nd: "", e: "Tornillo", u: "m³", q: 5,
    }));
    const res = await parseWoodEntriesXlsx(buf);
    expect(res.ingresos).toHaveLength(1);
    expect(res.ingresos[0].issues.some((m) => /GTF/i.test(m))).toBe(true);
  });

  it("keyword-priority: el origen sale de «Código de Origen», no de «N° Fuente»", async () => {
    // Ambas columnas contienen «origen». Si el finder agarra «N° Fuente» (CONC-1),
    // originType cae a «otro». Debe agarrar «Código de Origen» → «concesion».
    const buf = await build((wb) => addIngreso(wb, {
      n: 1, f: D(2026, 6, 1), td: "GTF", nd: "GTF-002", fo: "CONC-1",
      co: "Concesión forestal · Ucayali", e: "Tornillo", u: "m³", q: 10,
    }));
    const res = await parseWoodEntriesXlsx(buf);
    expect(res.ingresos[0].originType).toBe("concesion");
    expect(res.ingresos[0].originRegion).toBe("Ucayali");
  });
});

describe("parseProduccionXlsx — producción + consumos", () => {
  it("enlaza el consumo a la corrida por «Corrida #N»", async () => {
    const buf = await build((wb) => {
      const wp = wb.addWorksheet("3. Producción");
      wp.columns = PROD_COLS;
      wp.addRow({ n: 1, f: D(2026, 6, 3), cc: "CTP-001", tp: "Madera aserrada", e: "Tornillo", fo: "GTF-001", u: "m3", q: 12, r: 60 });
      const wc = wb.addWorksheet("2. Consumos");
      wc.columns = CONS_COLS;
      wc.addRow({ n: 1, g: "GTF-001", e: "Tornillo", c: "Corrida #1 · Madera aserrada · Tornillo", u: "m³", q: 20 });
    });
    const res = await parseProduccionXlsx(buf);
    expect(res.ok).toBe(true);
    expect(res.produccion).toHaveLength(1);
    const p = res.produccion[0];
    expect(p.productType).toBe("Madera aserrada");
    expect(p.quantity).toBe(12);
    expect(p.rendimientoPct).toBe(60);
    expect(p.consumos).toHaveLength(1);
    expect(p.consumos[0].gtfIngreso).toBe("GTF-001");
    expect(p.consumos[0].volumeM3).toBe(20);
  });
});

describe("parseSalidaXlsx — despachos", () => {
  it("parsea el despacho con destino, GTF y cantidad", async () => {
    const buf = await build((wb) => {
      const ws = wb.addWorksheet("4. Salida");
      ws.columns = SAL_COLS;
      ws.addRow({ n: 1, f: D(2026, 6, 5), td: "GTF", nd: "GTF-SAL-01", cc: "CTP-001", tp: "Madera aserrada", e: "Tornillo", u: "m3", q: 10, de: "Cliente SAC" });
    });
    const res = await parseSalidaXlsx(buf);
    expect(res.ok).toBe(true);
    expect(res.salida).toHaveLength(1);
    const s = res.salida[0];
    expect(s.gtfNumber).toBe("GTF-SAL-01");
    expect(s.productType).toBe("Madera aserrada");
    expect(s.quantity).toBe(10);
    expect(s.destino).toBe("Cliente SAC");
    expect(s.issues).toHaveLength(0);
  });
});

describe("regresión: corrida fantasma", () => {
  it("un archivo con SOLO «1. Ingreso» NO produce corridas (strict)", async () => {
    const buf = await build((wb) => addIngreso(wb, {
      n: 1, f: D(2026, 6, 1), td: "GTF", nd: "GTF-X", e: "Tornillo", tp: "rolliza", u: "m³", q: 7,
    }));
    const res = await parseProduccionXlsx(buf, { strict: true });
    // strict = solo por nombre de hoja → no hay «3. Producción» → sin corridas.
    expect(res.ok).toBe(false);
    expect(res.produccion).toHaveLength(0);
  });

  it("un archivo con SOLO «1. Ingreso» tampoco cruza en no-strict (fallback endurecido)", async () => {
    const buf = await build((wb) => addIngreso(wb, {
      n: 1, f: D(2026, 6, 1), td: "GTF", nd: "GTF-X", e: "Tornillo", tp: "rolliza", u: "m³", q: 7,
    }));
    // El fallback por contenido exige rendimiento/producido, que el Ingreso no
    // tiene (aunque sí «Tipo de Producto» + «Cantidad»). No debe matchear.
    const res = await parseProduccionXlsx(buf);
    expect(res.produccion).toHaveLength(0);
  });
});

describe("archivos rotos / hostiles", () => {
  it("cantidad como texto → issue (no crashea)", async () => {
    const buf = await build((wb) => addIngreso(wb, {
      n: 1, f: D(2026, 6, 1), td: "GTF", nd: "GTF-T", e: "Tornillo", u: "m³", q: "abc",
    }));
    const res = await parseWoodEntriesXlsx(buf);
    expect(res.ingresos).toHaveLength(1);
    expect(res.ingresos[0].volumeM3).toBe(0);
    expect(res.ingresos[0].issues.some((m) => /inválido|≤ 0/i.test(m))).toBe(true);
  });

  it("cantidad negativa → issue", async () => {
    const buf = await build((wb) => addIngreso(wb, {
      n: 1, f: D(2026, 6, 1), td: "GTF", nd: "GTF-N", e: "Tornillo", u: "m³", q: -5,
    }));
    const res = await parseWoodEntriesXlsx(buf);
    expect(res.ingresos[0].issues.some((m) => /≤ 0|inválido/i.test(m))).toBe(true);
  });

  it("workbook vacío (sin hojas) → ok:false, sin excepción", async () => {
    const buf = await build(() => { /* sin worksheets */ });
    const res = await parseWoodEntriesXlsx(buf);
    expect(res.ok).toBe(false);
    expect(res.ingresos).toHaveLength(0);
  });

  it("unidad desconocida en producción → default m3 (no crashea)", async () => {
    const buf = await build((wb) => {
      const wp = wb.addWorksheet("3. Producción");
      wp.columns = PROD_COLS;
      wp.addRow({ n: 1, f: D(2026, 6, 3), tp: "Madera aserrada", e: "Tornillo", u: "toneladas", q: 5 });
    });
    const res = await parseProduccionXlsx(buf);
    expect(res.produccion).toHaveLength(1);
    expect(res.produccion[0].unit).toBe("m3");
  });

  it("fila totalmente vacía se saltea (no genera ingreso basura)", async () => {
    const buf = await build((wb) => {
      const w = wb.addWorksheet("1. Ingreso");
      w.columns = ING_COLS;
      w.addRow({}); // fila en blanco
    });
    const res = await parseWoodEntriesXlsx(buf);
    expect(res.ok).toBe(true);
    expect(res.ingresos).toHaveLength(0);
  });
});

describe("strict positivo: libro completo con las 3 hojas", () => {
  it("cada parser strict encuentra su hoja nombrada", async () => {
    const buf = await build((wb) => {
      addIngreso(wb, { n: 1, f: D(2026, 6, 1), td: "GTF", nd: "GTF-1", co: "Concesión forestal", e: "Tornillo", u: "m³", q: 20 });
      const wc = wb.addWorksheet("2. Consumos");
      wc.columns = CONS_COLS;
      wc.addRow({ n: 1, g: "GTF-1", e: "Tornillo", c: "Corrida #1 · Madera aserrada", u: "m³", q: 20 });
      const wp = wb.addWorksheet("3. Producción");
      wp.columns = PROD_COLS;
      wp.addRow({ n: 1, f: D(2026, 6, 3), tp: "Madera aserrada", e: "Tornillo", fo: "GTF-1", u: "m3", q: 12, r: 60 });
      const ws = wb.addWorksheet("4. Salida");
      ws.columns = SAL_COLS;
      ws.addRow({ n: 1, f: D(2026, 6, 5), td: "GTF", nd: "GTF-SAL-1", tp: "Madera aserrada", e: "Tornillo", u: "m3", q: 8, de: "Cliente SAC" });
    });
    const ing = await parseWoodEntriesXlsx(buf, { strict: true });
    const prod = await parseProduccionXlsx(buf, { strict: true });
    const sal = await parseSalidaXlsx(buf, { strict: true });
    expect(ing.ingresos).toHaveLength(1);
    expect(prod.produccion).toHaveLength(1);
    expect(prod.produccion[0].consumos).toHaveLength(1);
    expect(sal.salida).toHaveLength(1);
  });
});
