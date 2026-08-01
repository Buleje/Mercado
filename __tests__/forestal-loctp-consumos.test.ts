import { describe, it, expect } from "vitest";
import {
  filasConsumo,
  type GrafoConsumos,
  type IngresoConsumo,
} from "@/lib/forestal/loctp-consumos";
import { consumosACsv } from "@/lib/forestal/ctp-secciones-csv";

/**
 * Sección 2 del formato LO-CTP. El consumo no es una fila de la base: es el
 * puente ingreso → corrida. La misma función arma la hoja "2. Consumos" del
 * Excel y la vista del módulo — si divergieran, el libro presentado y la
 * pantalla declararían consumos distintos del mismo período.
 */

const grafo: GrafoConsumos = {
  ingresos: [
    { id: "w1", gtf: "019-0000003", species: "Copaiba" },
    { id: "w2", gtf: "001-0000120", species: "Tornillo" },
  ],
  corridas: [
    { id: "c1", lineNo: 1, label: "Aserrío", unit: "m3", fecha: "2026-07-30T00:00:00.000Z" },
    { id: "c2", lineNo: 2, label: "", unit: "pt", fecha: "2026-07-28T00:00:00.000Z" },
  ],
  consumos: [
    { from: "w1", to: "c1", volumeM3: 3 },
    { from: "w2", to: "c2", volumeM3: 2.5 },
  ],
};

const ingresos: IngresoConsumo[] = [
  {
    id: "w1", productType: "rolliza", speciesCommonName: "Copaiba",
    speciesScientificName: "Copaifera reticulata Ducke", originCode: "19-SEC/PER-FMC-2024-008",
    originSourceNumber: "R.A N° D000485-2024", unit: "m3",
  },
  { id: "w2", productType: "rolliza", speciesCommonName: "Tornillo", ctpProductCode: "CTP-88" },
];

describe("Sección 2 · Consumos", () => {
  it("cruza el ingreso con la corrida que lo consumió", () => {
    const filas = filasConsumo(grafo, ingresos);
    expect(filas).toHaveLength(2);
    const copaiba = filas.find((f) => f.gtf === "019-0000003")!;
    expect(copaiba.especieComun).toBe("Copaiba");
    expect(copaiba.especieCientifica).toBe("Copaifera reticulata Ducke");
    expect(copaiba.codigoOrigen).toBe("19-SEC/PER-FMC-2024-008");
    expect(copaiba.fuenteOrigen).toBe("R.A N° D000485-2024");
    expect(copaiba.cantidad).toBe(3);
    // (2) La fecha del consumo es la de la corrida: el puente no tiene fecha
    // propia porque el consumo ES la corrida.
    expect(copaiba.fecha).toBe("2026-07-30T00:00:00.000Z");
    expect(copaiba.observaciones).toBe("Corrida #1 · Aserrío");
  });

  it("numera en el orden en que pasaron las cosas, no en el que llega el grafo", () => {
    const filas = filasConsumo(grafo, ingresos);
    expect(filas.map((f) => f.nro)).toEqual([1, 2]);
    // La corrida #2 es del 28 y la #1 del 30: primero la más vieja.
    expect(filas[0].gtf).toBe("001-0000120");
  });

  it("deja el casillero (10) vacío: las trozas no tienen lote", () => {
    expect(filasConsumo(grafo, ingresos).every((f) => f.lote === "")).toBe(true);
  });

  it("cae al código del CTP cuando el ingreso no trae código de origen", () => {
    const tornillo = filasConsumo(grafo, ingresos).find((f) => f.gtf === "001-0000120")!;
    expect(tornillo.codigoOrigen).toBe("CTP-88");
    // Sin N° de fuente declarado va vacío, no se repite la guía.
    expect(tornillo.fuenteOrigen).toBe("");
  });

  it("sin grafo devuelve vacío en vez de romper", () => {
    expect(filasConsumo(null, ingresos)).toEqual([]);
    expect(filasConsumo(undefined, [])).toEqual([]);
  });

  it("usa la especie del grafo si el ingreso completo no llegó", () => {
    const [fila] = filasConsumo(
      { ...grafo, consumos: [{ from: "w1", to: "c1", volumeM3: 1 }] },
      [],
    );
    expect(fila.especieComun).toBe("Copaiba");
    expect(fila.especieCientifica).toBe("—");
  });
});

/**
 * El CSV de la Sección 2. Mismas reglas que las otras dos secciones —separador
 * `;`, coma decimal, fecha UTC— porque el operador abre los tres archivos en el
 * mismo Excel y no puede tener tres formatos distintos.
 */
describe("consumosACsv", () => {
  const filas = filasConsumo(grafo, ingresos);

  it("lleva la numeración oficial en la cabecera", () => {
    const csv = consumosACsv(filas);
    const cabecera = csv.split("\r\n")[0];
    expect(cabecera).toContain("(9) Cantidad consumida");
    expect(cabecera).toContain("(10) N° de lote consumido");
    expect(cabecera.split(";")).toHaveLength(12);
  });

  it("usa coma decimal: es lo que entiende el Excel es-PE", () => {
    expect(consumosACsv(filas)).toContain("3,0000");
    // Y el casillero (10) sale vacío, igual que en pantalla.
    expect(consumosACsv(filas)).toContain("m³;3,0000;;");
  });

  it("cierra con el total de lo exportado", () => {
    const lineas = consumosACsv(filas).split("\r\n");
    expect(lineas[lineas.length - 1]).toContain("TOTAL (2 consumos)");
  });

  it("sin filas devuelve cabecera y total en cero, no un archivo vacío", () => {
    const csv = consumosACsv([]);
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain("TOTAL (0 consumos)");
  });
});
