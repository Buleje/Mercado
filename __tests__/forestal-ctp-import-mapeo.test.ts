/**
 * Mapeo de columnas del Excel del cliente + duplicados dentro del archivo.
 *
 * Es la parte que decide de qué columna sale la GTF de un libro fiscalizable:
 * si se equivoca, entran ingresos con el origen legal en blanco o con el volumen
 * de otra columna. Se testea sin Excel (recibe cabeceras y filas).
 */
import { describe, expect, it } from "vitest";
import {
  CAMPOS_INGRESO,
  detectarMapeo,
  duplicadosEnArchivo,
  faltantesDelMapeo,
  mapeoModificado,
  MAPEO_VACIO,
} from "@/lib/forestal/ctp-import-mapeo";

/** Las cabeceras son 1-based (índice 0 vacío), como las devuelve ExcelJS. */
const hdr = (...cols: string[]) => ["", ...cols];

describe("detectarMapeo", () => {
  it("reconoce el formato oficial LO-CTP", () => {
    const m = detectarMapeo(
      hdr("N° de Documento", "Fecha de Ingreso", "Especie", "Nombre Científico", "Tipo de Producto", "Cantidad", "Observaciones"),
    );
    expect(m.gtfNumber).toBe(1);
    expect(m.entryDate).toBe(2);
    expect(m.speciesCommonName).toBe(3);
    expect(m.speciesScientificName).toBe(4);
    expect(m.productType).toBe(5);
    expect(m.volumeM3).toBe(6);
    expect(m.notes).toBe(7);
  });

  it("reconoce la planilla propia de un aserradero (otros nombres)", () => {
    const m = detectarMapeo(hdr("Guía", "Fecha", "Titular del TH", "Especie", "m3 recibidos"));
    expect(m.gtfNumber).toBe(1);
    expect(m.providerName).toBe(3);
    expect(m.volumeM3).toBe(5);
  });

  it("el permiso CITES no se roba la columna del booleano ni al revés", () => {
    const m = detectarMapeo(hdr("GTF", "Especie", "CITES", "N° Permiso CITES", "Volumen"));
    expect(m.citesPermiso).toBe(4);
    expect(m.speciesCites).toBe(3);
    expect(m.speciesCites).not.toBe(m.citesPermiso);
  });

  it("'código de origen' gana sobre otra columna que también dice origen", () => {
    const m = detectarMapeo(hdr("GTF", "N° Fuente de Origen", "Código de Origen", "Especie", "Volumen"));
    expect(m.originCode).toBe(3);
  });

  it("no asigna dos campos a la misma columna", () => {
    const m = detectarMapeo(hdr("GTF", "Especie", "Cantidad"));
    const usadas = CAMPOS_INGRESO.map((d) => m[d.campo]).filter((c): c is number => c != null);
    expect(new Set(usadas).size).toBe(usadas.length);
  });

  it("tolera acentos, mayúsculas y puntuación", () => {
    const m = detectarMapeo(hdr("N.° GTF", "ESPECIE (nombre común)", "VOLUMEN m³"));
    expect(m.gtfNumber).toBe(1);
    expect(m.speciesCommonName).toBe(2);
    expect(m.volumeM3).toBe(3);
  });

  it("una cabecera desconocida deja el campo sin columna, no lo inventa", () => {
    const m = detectarMapeo(hdr("Columna rara", "Otra cosa"));
    expect(m.gtfNumber).toBeNull();
    expect(m.speciesCommonName).toBeNull();
  });
});

describe("faltantesDelMapeo", () => {
  it("lista los requeridos sin columna", () => {
    expect(faltantesDelMapeo(MAPEO_VACIO).map((f) => f.campo)).toEqual([
      "gtfNumber",
      "speciesCommonName",
      "volumeM3",
    ]);
  });

  it("con los tres asignados no falta nada", () => {
    const m = detectarMapeo(hdr("GTF", "Especie", "Volumen"));
    expect(faltantesDelMapeo(m)).toEqual([]);
  });
});

describe("mapeoModificado", () => {
  it("detecta que el operador cambió una columna", () => {
    const a = detectarMapeo(hdr("GTF", "Especie", "Volumen"));
    expect(mapeoModificado(a, a)).toBe(false);
    expect(mapeoModificado(a, { ...a, volumeM3: 9 })).toBe(true);
  });
});

describe("duplicadosEnArchivo", () => {
  const filas = [
    { row: 2, gtfNumber: "001-001" },
    { row: 3, gtfNumber: "001-002" },
    { row: 4, gtfNumber: "001-001" },
    { row: 5, gtfNumber: "  " },
    { row: 6, gtfNumber: "001-001" },
  ];

  it("agrupa las GTF repetidas con las filas donde aparecen", () => {
    expect(duplicadosEnArchivo(filas)).toEqual([{ gtfNumber: "001-001", filas: [2, 4, 6] }]);
  });

  it("ignora las filas sin GTF (esas ya las marca el parser como inválidas)", () => {
    expect(duplicadosEnArchivo([{ row: 2, gtfNumber: "" }, { row: 3, gtfNumber: "" }])).toEqual([]);
  });

  it("sin repetidas no reporta nada", () => {
    expect(duplicadosEnArchivo([{ row: 2, gtfNumber: "a" }, { row: 3, gtfNumber: "b" }])).toEqual([]);
  });
});
