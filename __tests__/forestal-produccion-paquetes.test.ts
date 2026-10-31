import { describe, expect, it } from "vitest";
import {
  motivosParaGuardar,
  siguienteCodigo,
  totalesProduccion,
  volumenDimensionado,
  type PaqueteBorrador,
} from "@/lib/forestal/produccion-paquetes";

function paq(over: Partial<PaqueteBorrador> = {}): PaqueteBorrador {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    codigo: "PQ-001",
    productType: "madera_aserrada",
    presentacion: "PAQUETES",
    cantidad: 10,
    volumenM3: 1.5,
    espesorCm: null,
    anchoCm: null,
    largoM: null,
    observations: "",
    ...over,
  };
}

describe("volumenDimensionado", () => {
  it("espesor y ancho en cm, largo en m, por las piezas", () => {
    // 2.5cm × 20cm × 3m × 100 piezas = 1.5 m³
    expect(volumenDimensionado(2.5, 20, 3, 100)).toBe(1.5);
  });

  it("sin alguna medida devuelve null — no un volumen a medias", () => {
    expect(volumenDimensionado(null, 20, 3, 100)).toBeNull();
    expect(volumenDimensionado(2.5, null, 3, 100)).toBeNull();
    expect(volumenDimensionado(2.5, 20, null, 100)).toBeNull();
    expect(volumenDimensionado(2.5, 20, 3, 0)).toBeNull();
  });
});

describe("totalesProduccion", () => {
  it("suma paquetes, piezas y volumen", () => {
    const t = totalesProduccion([paq({ volumenM3: 1.5, cantidad: 10 }), paq({ volumenM3: 2, cantidad: 5 })], 10);
    expect(t).toMatchObject({ paquetes: 2, piezas: 15, volumen: 3.5, rendimientoPct: 35 });
  });

  it("el rendimiento SÓLO en m³: en pie tablar sería inventar el dato", () => {
    expect(totalesProduccion([paq({ volumenM3: 3.5 })], 10, "pt").rendimientoPct).toBeNull();
    expect(totalesProduccion([paq({ volumenM3: 3.5 })], 10, "m3").rendimientoPct).toBe(35);
  });

  it("sin materia prima no hay rendimiento", () => {
    expect(totalesProduccion([paq()], 0).rendimientoPct).toBeNull();
  });
});

describe("motivosParaGuardar", () => {
  it("sin paquetes no se guarda", () => {
    expect(motivosParaGuardar([])).toHaveLength(1);
  });

  it("exige código y volumen, y rechaza códigos repetidos", () => {
    expect(motivosParaGuardar([paq({ codigo: "  " })])[0]).toMatch(/sin código/);
    expect(motivosParaGuardar([paq({ volumenM3: 0 })])[0]).toMatch(/sin volumen/);
    const dobles = motivosParaGuardar([paq({ codigo: "PQ-1" }), paq({ codigo: "pq-1" })]);
    expect(dobles.some((m) => /está en dos paquetes/.test(m))).toBe(true);
  });

  it("con todo en orden, no hay motivos", () => {
    expect(motivosParaGuardar([paq({ codigo: "PQ-1" }), paq({ codigo: "PQ-2" })])).toEqual([]);
  });
});

describe("siguienteCodigo", () => {
  it("suma uno conservando los ceros a la izquierda", () => {
    expect(siguienteCodigo("PQ-001")).toBe("PQ-002");
    expect(siguienteCodigo("PQ-009")).toBe("PQ-010");
    expect(siguienteCodigo("L14-2026-99")).toBe("L14-2026-100");
  });

  it("sin número al final no sugiere nada: adivinar el patrón es peor", () => {
    expect(siguienteCodigo("PAQUETE")).toBe("");
    expect(siguienteCodigo("")).toBe("");
  });
});
