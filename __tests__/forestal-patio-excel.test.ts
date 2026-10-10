/**
 * El Excel del patio por permiso (ADR-431, C6): UN archivo con «Por permiso»,
 * una hoja por permiso y «Qué se exportó». Los nombres de hoja salen saneados,
 * sin repetirse (sin distinguir mayúsculas, contra TODAS las hojas del libro) y
 * con el sufijo « (2)» a salvo del tope de 31 — si no, exceljs lanza «Worksheet
 * name already exists» y el Excel entero falla en el clic.
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { resumenPorPermiso } from "@/lib/forestal/patio-resumen";
import {
  HOJA_POR_PERMISO,
  HOJA_QUE_SE_EXPORTO,
  hojasDelPatioPorPermiso,
  nombreArchivoPatio,
  nombreDeHojaUnico,
  sanearNombreHoja,
} from "@/lib/forestal/patio-excel";

const AHORA = new Date("2026-09-24T12:00:00-05:00");
const HUA = "10-HUA-PUE/PER-FMP-2026-007";
const SEC = "19-SEC/REG-PLT-2021-017";

let n = 0;
function troza(over: Partial<TrozaConsumible> = {}): TrozaConsumible {
  n += 1;
  return {
    id: `t${n}`,
    woodEntryId: "w1",
    codificacion: String(n),
    especieComun: "Tornillo",
    gtfNumber: "010-001-0000005",
    volumenM3: 1.234,
    largoM: 4.5,
    permiso: HUA,
    fechaIngreso: "2026-09-08T05:00:00.000Z",
    guiaRecepcionada: true,
    ...over,
  };
}

function armar(trozas: TrozaConsumible[], extra: Partial<Parameters<typeof hojasDelPatioPorPermiso>[0]> = {}) {
  return hojasDelPatioPorPermiso({
    porPermiso: resumenPorPermiso(trozas, AHORA),
    trozas,
    ahora: AHORA,
    filtros: [],
    alcance: null,
    ...extra,
  });
}

/** Réplica EXACTA de las reglas de exceljs (worksheet.js:145-170) sobre los nombres finales. */
function exceljsAceptaria(nombres: string[]): void {
  const vistos: string[] = [];
  for (const raw of nombres) {
    // lo que hace exportSheetsToExcel antes de addWorksheet
    const nombre = raw.replace(/[[\]:*?/\\]/g, "-").slice(0, 31);
    expect(nombre).toBe(raw); // ya venía saneado: el helper no lo toca
    expect(nombre).not.toBe("");
    expect(/[*?:/\\[\]]/.test(nombre)).toBe(false);
    expect(/(^')|('$)/.test(nombre)).toBe(false);
    expect(vistos).not.toContain(nombre.toLowerCase());
    vistos.push(nombre.toLowerCase());
  }
}

describe("hojasDelPatioPorPermiso", () => {
  const trozas = [
    troza({ volumenM3: 2.5 }),
    troza({ volumenM3: 1.25, loteAserrioId: "LA-1", loteAserrioCode: "LA-2026-001" }),
    troza({ permiso: SEC, gtfNumber: "019-001-0000004", guiaRecepcionada: false, volumenM3: 0.641 }),
  ];
  const hojas = armar(trozas, { filtros: ["Especie: Tornillo"], alcance: "10-HUA-PUE/PER-FMP-2026-007" });

  it("hojas en orden: Por permiso, una por permiso (orden del resumen) y Qué se exportó", () => {
    expect(hojas.map((h) => h.nombre)).toEqual([
      HOJA_POR_PERMISO,
      "10-HUA-PUE-PER-FMP-2026-007",
      "19-SEC-REG-PLT-2021-017",
      HOJA_QUE_SE_EXPORTO,
    ]);
    exceljsAceptaria(hojas.map((h) => h.nombre));
  });

  it("los m³ y los conteos van como NÚMERO, no como texto", () => {
    const [porPermiso, hua] = hojas;
    for (const f of porPermiso.filas) {
      expect(typeof f["m³ en patio"]).toBe("number");
      expect(typeof f["Trozas en patio"]).toBe("number");
      expect(typeof f["Por recepcionar (m³)"]).toBe("number");
    }
    for (const f of hua.filas) expect(typeof f["m³"]).toBe("number");
  });

  it("la suma de «m³ en patio» = el total del patio (y del KPI)", () => {
    const r = resumenPorPermiso(trozas, AHORA);
    const suma = hojas[0].filas.reduce((a, f) => a + Number(f["m³ en patio"]), 0);
    expect(suma).toBeCloseTo(r.totales.enPatio.m3, 3);
    expect(suma).toBeCloseTo(3.75, 3);
  });

  it("lo por recepcionar no dice «días en el patio»: dice la guía asentada hace N días (C7)", () => {
    const sec = hojas[0].filas.find((f) => f.Permiso === SEC);
    expect(sec?.["Días en patio"]).toBeNull();
    expect(sec?.["Por recepcionar: guía asentada hace (días)"]).toBe(16);
    const pieza = hojas[2].filas[0];
    expect(pieza["Días en patio"]).toBeNull();
    expect(pieza.Estado).toBe("Por recepcionar: guía asentada hace 16 días (sin recepcionar)");
    const apartada = hojas[1].filas.find((f) => String(f.Estado).startsWith("Apartada"));
    expect(apartada?.Estado).toBe("Apartada en el lote LA-2026-001");
  });

  it("«Qué se exportó» lista el alcance, los filtros y qué NO es este número", () => {
    const q = Object.fromEntries(hojas[3].filas.map((f) => [f.Dato, f.Valor]));
    expect(q.Alcance).toBe("Solo este permiso: 10-HUA-PUE/PER-FMP-2026-007");
    expect(q.Filtros).toBe("Especie: Tornillo");
    expect(String(q["Qué es"])).toContain("no es el saldo declarado");
    expect(String(q["≈pt aserrable"])).toContain("Derivado");
    expect(q).not.toHaveProperty("¡Incompleto!");
  });

  it("sin filtros ni permiso activo lo dice; un patio truncado se avisa", () => {
    const h = armar(trozas, { truncado: { total: 6000, devueltas: 5000 } });
    const q = Object.fromEntries(h[h.length - 1].filas.map((f) => [f.Dato, f.Valor]));
    expect(q.Alcance).toBe("Toda la planta");
    expect(q.Filtros).toBe("Ninguno");
    expect(String(q["¡Incompleto!"])).toContain("6000");
  });

  it("la madera sin permiso va a una hoja con nombre, nunca vacía", () => {
    const h = armar([troza({ permiso: null }), troza({ permiso: "   " })]);
    expect(h.map((x) => x.nombre)).toEqual([HOJA_POR_PERMISO, "Sin permiso", HOJA_QUE_SE_EXPORTO]);
    expect(h[1].filas).toHaveLength(2);
  });
});

describe("nombres de hoja duplicados", () => {
  it("dos permisos que chocan al cortar en 31 llevan sufijo, y el sufijo sobrevive al corte", () => {
    const a = "10-HUA-PUE/PER-FMP-2026-007-LOTE-NORTE-A";
    const b = "10-HUA-PUE/PER-FMP-2026-007-LOTE-NORTE-B";
    const h = armar([troza({ permiso: a }), troza({ permiso: b, volumenM3: 0.5 })]);
    const nombres = h.map((x) => x.nombre);
    expect(nombres[1]).toBe("10-HUA-PUE-PER-FMP-2026-007-LOT");
    expect(nombres[2]).toBe("10-HUA-PUE-PER-FMP-2026-007 (2)");
    expect(nombres[2].length).toBeLessThanOrEqual(31);
    exceljsAceptaria(nombres);
  });

  it("choca sin distinguir mayúsculas y contra las hojas que el libro YA tiene (las 4 de Saldos)", () => {
    const h = armar([troza({ permiso: "saldos" }), troza({ permiso: "POR PERMISO", volumenM3: 0.2 })], {
      hojasExistentes: ["Saldos", "Conciliación", "Productos", "Lotes"],
    });
    const nombres = ["Saldos", "Conciliación", "Productos", "Lotes", ...h.map((x) => x.nombre)];
    expect(h.map((x) => x.nombre)).toEqual([HOJA_POR_PERMISO, "saldos (2)", "POR PERMISO (2)", HOJA_QUE_SE_EXPORTO]);
    exceljsAceptaria(nombres);
  });

  it("un permiso llamado como una hoja fija no le roba el nombre a «Qué se exportó»", () => {
    const h = armar([troza({ permiso: "Qué se exportó" })]);
    expect(h.map((x) => x.nombre)).toEqual([HOJA_POR_PERMISO, "Qué se exportó (2)", HOJA_QUE_SE_EXPORTO]);
  });

  it("sanea lo que exceljs rechaza: []:*?/\\, apóstrofo en los bordes y el vacío", () => {
    expect(sanearNombreHoja("a[b]:c*d?e/f\\g")).toBe("a-b--c-d-e-f-g");
    expect(sanearNombreHoja("'Permiso'")).toBe("Permiso");
    expect(sanearNombreHoja("   ")).toBe("Sin permiso");
    expect(nombreDeHojaUnico("X", new Set(["x", "x (2)"]))).toBe("X (3)");
  });
});

describe("con exceljs DE VERDAD (lo que corre en el clic)", () => {
  it("el libro de Saldos (4 hojas fijas + las del patio) se arma sin lanzar", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const fijas = ["Saldos", "Conciliación", "Productos", "Lotes"];
    const h = armar(
      [
        troza({ permiso: "Saldos" }),
        troza({ permiso: "10-HUA-PUE/PER-FMP-2026-007-LOTE-NORTE-A" }),
        troza({ permiso: "10-HUA-PUE/PER-FMP-2026-007-LOTE-NORTE-B" }),
        troza({ permiso: null }),
      ],
      { hojasExistentes: fijas },
    );
    for (const nombre of [...fijas, ...h.map((x) => x.nombre)]) {
      // mismo saneo que exportSheetsToExcel antes de addWorksheet
      wb.addWorksheet(nombre.replace(/[[\]:*?/\\]/g, "-").slice(0, 31));
    }
    expect(wb.worksheets).toHaveLength(fijas.length + h.length);
    // Y el guardia muerde: el nombre sin deduplicar es justo lo que exceljs rechaza.
    expect(() => wb.addWorksheet("SALDOS")).toThrow(/already exists/);
  });
});

describe("nombreArchivoPatio", () => {
  it("sin «.xlsx» (exportSheetsToExcel la agrega) y con el día de Lima", () => {
    expect(nombreArchivoPatio(AHORA)).toBe("patio-por-permiso-2026-09-24");
    // 22:00 del 24 en Lima ya es 25 en UTC: el archivo no puede salir fechado mañana.
    expect(nombreArchivoPatio(new Date("2026-09-25T03:00:00.000Z"))).toBe("patio-por-permiso-2026-09-24");
    expect(nombreArchivoPatio(AHORA)).not.toMatch(/\.xlsx$/);
  });
});
