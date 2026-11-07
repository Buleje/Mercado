import { describe, expect, it } from "vitest";
import {
  LARGO_MINIMO_M,
  PIEZA_MAXIMA_M3,
  PIEZA_MINIMA_M3,
  TOLERANCIA_MEDIDA,
  avisosDeCifra,
  corridasConCifraImposible,
  type CorridaParaCifras,
} from "@/lib/forestal/produccion-cifras-imposibles";
import { UMBRAL_TIPO } from "@/lib/forestal/cubicacion-tipo";

/**
 * Los casos son las corridas REALES del libro de Blas
 * (`inversiones-agroforestales-blas-sociedad-anonima`), medidas el 2026-09-15.
 * Un fixture inventado prueba la mitad que ya funcionaba.
 */
const CORRIDAS_REALES = {
  // Imposibles: 7 cm³ y 64 cm³ por pieza.
  n26: { id: "26", lineNo: 26, quantity: 0.001, pieces: 141, unit: "m3", status: "registrado" },
  n24: { id: "24", lineNo: 24, quantity: 0.009, pieces: 141, unit: "m3", status: "registrado" },
  // Sanas: 12,085 cm³ y 26,520 cm³ por pieza.
  n28: { id: "28", lineNo: 28, quantity: 0.2417, pieces: 20, unit: "m3", status: "registrado" },
  n23: { id: "23", lineNo: 23, quantity: 1.326, pieces: 50, unit: "m3", status: "registrado" },
  // Los extremos del rango sano medido: 0.0094 m³/pza y 0.119 m³/pza.
  n22: { id: "22", lineNo: 22, quantity: 0.434, pieces: 13, unit: "m3", status: "registrado" },
  n20: { id: "20", lineNo: 20, quantity: 3.814, pieces: 32, unit: "m3", status: "registrado" },
  n21: { id: "21", lineNo: 21, quantity: 3.078, pieces: 68, unit: "m3", status: "registrado" },
  n25: { id: "25", lineNo: 25, quantity: 0.073, pieces: 1, unit: "m3", status: "registrado" },
  n27: { id: "27", lineNo: 27, quantity: 0.013, pieces: 1, unit: "m3", status: "registrado" },
  // Las cinco de apertura: volumen sí, piezas NO (`pieces = 0`).
  n15: { id: "15", lineNo: 15, quantity: 15.211, pieces: 0, unit: "m3", status: "registrado" },
  n18: { id: "18", lineNo: 18, quantity: 35.647, pieces: 0, unit: "m3", status: "registrado" },
} satisfies Record<string, CorridaParaCifras>;

describe("los umbrales salen de las medidas del libro, no de un número redondo", () => {
  it('el piso es 1" × 2" × 0.30 m, las mínimas que el libro llama madera aserrada', () => {
    expect(UMBRAL_TIPO.cortaEspesorMin).toBe(1);
    expect(UMBRAL_TIPO.cortaAnchoMin).toBe(2);
    expect(LARGO_MINIMO_M).toBe(0.3);
    // 0.0254 m × 0.0508 m × 0.30 m = 387 cm³.
    expect(PIEZA_MINIMA_M3).toBeCloseTo(0.000387096, 9);
    expect(Math.round(PIEZA_MINIMA_M3 * 1_000_000)).toBe(387);
  });

  it("el piso queda MUY por debajo de la pieza más chica que existe en el libro", () => {
    // Paquete SL-5 de la corrida #28: 2.54 × 15.24 cm × 2.44 m = 0.0094 m³.
    const masChicaReal = 0.0094;
    expect(masChicaReal / PIEZA_MINIMA_M3).toBeGreaterThan(20);
  });

  it("el techo queda MUY por encima de la pieza más grande que existe en el libro", () => {
    // Corrida #20: 3.814 m³ en 32 piezas = 0.1192 m³ por pieza.
    expect(PIEZA_MAXIMA_M3 / (3.814 / 32)).toBeGreaterThan(8);
  });
});

describe("las dos corridas que ya están mal en el libro de Blas", () => {
  it("#26: 141 piezas en 0.0010 m³ salta, con la cuenta escrita", () => {
    const [aviso, ...resto] = avisosDeCifra({ volumenM3: 0.001, piezas: 141 });
    expect(resto).toEqual([]);
    expect(aviso!.motivo).toBe("pieza-imposible-chica");
    expect(aviso!.tono).toBe("error");
    // La cuenta, no un «valor sospechoso» genérico.
    expect(aviso!.texto).toContain("141 piezas");
    expect(aviso!.texto).toContain("0.0010 m³");
    expect(aviso!.texto).toContain("7 cm³ por pieza");
    // Y con qué se compara: un cubito que entra en la mano.
    expect(aviso!.texto).toContain("1.9 cm de lado");
  });

  it("#24: 141 piezas en 0.0090 m³ salta con sus 64 cm³", () => {
    const [aviso] = avisosDeCifra({ volumenM3: 0.009, piezas: 141 });
    expect(aviso?.motivo).toBe("pieza-imposible-chica");
    expect(aviso?.texto).toContain("64 cm³ por pieza");
  });
});

describe("las corridas sanas no dicen nada", () => {
  it("#28: 20 piezas en 0.2417 m³", () => {
    expect(avisosDeCifra({ volumenM3: 0.2417, piezas: 20 })).toEqual([]);
  });

  it("#23: 50 piezas en 1.3260 m³", () => {
    expect(avisosDeCifra({ volumenM3: 1.326, piezas: 50 })).toEqual([]);
  });

  it("ninguna de las nueve corridas con piezas declaradas del libro de Blas salvo las dos malas", () => {
    const sanas = [
      CORRIDAS_REALES.n20,
      CORRIDAS_REALES.n21,
      CORRIDAS_REALES.n22,
      CORRIDAS_REALES.n23,
      CORRIDAS_REALES.n25,
      CORRIDAS_REALES.n27,
      CORRIDAS_REALES.n28,
    ];
    for (const c of sanas) {
      expect(
        avisosDeCifra({ volumenM3: c.quantity, piezas: c.pieces, unidad: c.unit }),
        `corrida #${c.lineNo}`,
      ).toEqual([]);
    }
  });
});

describe("lo que NO se puede juzgar, no se juzga", () => {
  it("sin piezas declaradas no hay cuenta por pieza: las 5 corridas de apertura callan", () => {
    // #15 a #19 entraron con volumen y `pieces = 0`. Avisar ahí sería inventar.
    expect(avisosDeCifra({ volumenM3: 15.211, piezas: 0 })).toEqual([]);
    expect(avisosDeCifra({ volumenM3: 35.647, piezas: null })).toEqual([]);
  });

  it("sin volumen declarado tampoco: la corrida está sin declarar, no mal declarada", () => {
    expect(avisosDeCifra({ volumenM3: null, piezas: 141 })).toEqual([]);
    expect(avisosDeCifra({ volumenM3: 0, piezas: 141 })).toEqual([]);
  });

  it("en pie tablar la cuenta mezcla unidades: se calla", () => {
    expect(avisosDeCifra({ volumenM3: 0.001, piezas: 141, unidad: "pt" })).toEqual([]);
    expect(avisosDeCifra({ volumenM3: 0.001, piezas: 141, unidad: "m3" })).toHaveLength(1);
  });
});

describe("el techo: la coma corrida para el otro lado", () => {
  it("1 pieza declarada en 73 m³ salta", () => {
    const [aviso] = avisosDeCifra({ volumenM3: 73, piezas: 1 });
    expect(aviso?.motivo).toBe("pieza-imposible-grande");
    expect(aviso?.texto).toContain("73.0000 m³");
  });

  it("pero 1 pieza en 0.073 m³ —lo que declara la #25— no", () => {
    expect(avisosDeCifra({ volumenM3: 0.073, piezas: 1 })).toEqual([]);
  });
});

describe("con medidas el volumen se recalcula (la señal fuerte)", () => {
  /** Paquete SL-1 real de la corrida #28: 5.08 × 20.32 cm × 1.52 m = 0.0157 m³. */
  const sl1 = { codigo: "SL-1", cantidad: 1, espesorCm: 5.08, anchoCm: 20.32, largoM: 1.52 };

  it("los seis paquetes dimensionados de la #28 cuadran y no avisan", () => {
    const paquetes = [
      { ...sl1, volumenM3: 0.0157 },
      {
        codigo: "SL-2",
        cantidad: 1,
        volumenM3: 0.0165,
        espesorCm: 5.08,
        anchoCm: 15.24,
        largoM: 2.13,
      },
      {
        codigo: "SL-3",
        cantidad: 1,
        volumenM3: 0.0283,
        espesorCm: 7.62,
        anchoCm: 15.24,
        largoM: 2.44,
      },
      {
        codigo: "SL-4",
        cantidad: 1,
        volumenM3: 0.0126,
        espesorCm: 2.54,
        anchoCm: 20.32,
        largoM: 2.44,
      },
      {
        codigo: "SL-5",
        cantidad: 1,
        volumenM3: 0.0094,
        espesorCm: 2.54,
        anchoCm: 15.24,
        largoM: 2.44,
      },
      {
        codigo: "SL-6",
        cantidad: 15,
        volumenM3: 0.1592,
        espesorCm: 15.24,
        anchoCm: 15.24,
        largoM: 0.46,
      },
    ];
    expect(avisosDeCifra({ volumenM3: 0.2417, piezas: 20, paquetes })).toEqual([]);
  });

  it("la coma corrida en el volumen se ve contra sus propias medidas", () => {
    const [aviso] = avisosDeCifra({
      volumenM3: 0.157,
      piezas: 1,
      paquetes: [{ ...sl1, volumenM3: 0.157 }],
    });
    expect(aviso?.motivo).toBe("medida-no-cuadra");
    expect(aviso?.paquete).toBe("SL-1");
    expect(aviso?.tono).toBe("error");
    expect(aviso?.texto).toContain("0.0157 m³");
    expect(aviso?.texto).toContain("0.1570 m³");
    expect(aviso?.texto).toContain("10 veces más");
  });

  it("el desvío real de los paquetes de Blas (0.7 %) entra holgado en la tolerancia", () => {
    // SL-6 declara 0.1592 y sus medidas dan 0.16033: 0.7 % de desvío.
    expect(TOLERANCIA_MEDIDA).toBeGreaterThan(0.007 * 5);
    expect(
      avisosDeCifra({
        volumenM3: 0.1592,
        piezas: 15,
        paquetes: [
          {
            codigo: "SL-6",
            cantidad: 15,
            volumenM3: 0.1592,
            espesorCm: 15.24,
            anchoCm: 15.24,
            largoM: 0.46,
          },
        ],
      }),
    ).toEqual([]);
  });

  it("un desvío moderado avisa en ámbar; el doble o más, en rojo", () => {
    const con = (volumenM3: number) =>
      avisosDeCifra({ volumenM3, piezas: 1, paquetes: [{ ...sl1, volumenM3 }] })[0];
    expect(con(0.0157 * 1.2)?.tono).toBe("warning");
    expect(con(0.0157 * 2.5)?.tono).toBe("error");
    expect(con(0.0157 * 1.05)).toBeUndefined();
  });

  it("el paquete que no cuadra se nombra UNA vez, no dos", () => {
    // Volumen absurdo Y medidas que no cuadran: un solo aviso, el fuerte.
    const avisos = avisosDeCifra({
      volumenM3: 0.00001,
      piezas: 1,
      paquetes: [{ ...sl1, volumenM3: 0.00001 }],
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.motivo).toBe("medida-no-cuadra");
  });

  it("sin medidas el paquete cae al rango por pieza: el caso #26 con su paquete", () => {
    const [aviso] = avisosDeCifra({
      volumenM3: 0.001,
      piezas: 141,
      paquetes: [{ codigo: "d1d15", cantidad: 141, volumenM3: 0.001 }],
    });
    expect(aviso?.motivo).toBe("pieza-imposible-chica");
    expect(aviso?.paquete).toBe("d1d15");
    expect(aviso?.texto).toContain("7 cm³ por pieza");
  });

  it("un paquete sin piezas no arrastra a los demás al silencio", () => {
    const avisos = avisosDeCifra({
      volumenM3: 0.011,
      piezas: 141,
      paquetes: [
        { codigo: "vacío", cantidad: 0, volumenM3: 0.01 },
        { codigo: "d1d15", cantidad: 141, volumenM3: 0.001 },
      ],
    });
    expect(avisos.map((a) => a.paquete)).toEqual(["d1d15"]);
  });
});

describe("el barrido de lo que ya está cargado", () => {
  const todas = Object.values(CORRIDAS_REALES);

  it("de las 11 corridas reales encuentra exactamente las dos malas", () => {
    const filas = corridasConCifraImposible(todas);
    expect(filas.map((f) => f.lineNo)).toEqual([26, 24]);
  });

  it("trae la cuenta lista para la pantalla", () => {
    const [f] = corridasConCifraImposible(todas);
    expect(f!.piezas).toBe(141);
    expect(f!.volumenM3).toBe(0.001);
    expect(f!.m3PorPieza).toBeCloseTo(0.0000070922, 10);
    expect(f!.avisos).toHaveLength(1);
  });

  it("una corrida anulada no se señala: su madera volvió al patio", () => {
    expect(corridasConCifraImposible([{ ...CORRIDAS_REALES.n26, status: "anulado" }])).toEqual([]);
  });

  it("la más nueva primero: es la que todavía se puede corregir", () => {
    const filas = corridasConCifraImposible([CORRIDAS_REALES.n24, CORRIDAS_REALES.n26]);
    expect(filas.map((f) => f.lineNo)).toEqual([26, 24]);
  });

  it("producto y lote salen legibles aunque falten", () => {
    const [f] = corridasConCifraImposible([
      {
        ...CORRIDAS_REALES.n26,
        productType: "MADERA ASERRADA (PAQUETERIA CORTA)",
        speciesCommon: "Tornillo",
        materiaPrimaRef: "  ",
      },
    ]);
    expect(f!.producto).toBe("MADERA ASERRADA (PAQUETERIA CORTA) · Tornillo");
    expect(f!.lote).toBeNull();
  });

  it("el libro sano no devuelve nada", () => {
    expect(corridasConCifraImposible([CORRIDAS_REALES.n28, CORRIDAS_REALES.n15])).toEqual([]);
  });
});
