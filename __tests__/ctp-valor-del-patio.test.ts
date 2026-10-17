/**
 * El valor del patio (Libro CTP · «Productos disponibles»).
 *
 * Esta cifra termina en un estado de resultados y en el precio de un despacho.
 * Lo que se prueba es que NO invente: que diga de qué fuente salió, que no
 * mezcle fuentes, que una guía sin costear no baje el promedio hacia cero, y
 * que sin rendimiento devuelva un guion en vez del 56 % —que es un TOPE legal,
 * no el rendimiento de nadie—.
 *
 * El caso de Blas al 2026-09-15 es el caso real: 0 de 24 guías costeadas y 0
 * consumos. El resultado correcto es «no se puede valorizar», no «S/ 0».
 */
import { describe, expect, it } from "vitest";
import {
  resumenDeValor,
  valorDeCorrida,
  valorDeFila,
  type ConsumoCosteable,
  type CorridaValorizable,
} from "@/lib/forestal/valor-del-patio";

const consumo = (over: Partial<ConsumoCosteable> = {}): ConsumoCosteable => ({
  volumeM3: 10,
  costoUnitarioSnap: null,
  costoTotalGuia: null,
  volumenGuiaM3: null,
  gtfNumber: "GTF-0001",
  ...over,
});

/** Una corrida que rinde 50 %: cada m³ de producto se comió 2 m³ de troza. */
const corrida = (over: Partial<CorridaValorizable> = {}): CorridaValorizable => ({
  gtfOrigen: [],
  costoConsumos: [],
  costoPorGtf: [],
  rendimientoPct: 50,
  producido: 0,
  volumenConsumidoM3: null,
  ...over,
});

describe("valorDeCorrida · las cuatro fuentes, en orden", () => {
  it("1. el costo CONGELADO del consumo gana sobre todo", () => {
    const v = valorDeCorrida(
      corrida({
        gtfOrigen: ["GTF-0001"],
        costoConsumos: [consumo({ costoUnitarioSnap: 300, costoTotalGuia: 9999, volumenGuiaM3: 10 })],
      }),
    );
    // 300 S//m³ de troza ÷ 0,50 de rendimiento = 600 S//m³ de producto.
    expect(v.porM3).toBe(600);
    expect(v.origen).toBe("consumo-congelado");
    expect(v.guiasUsadas).toEqual(["GTF-0001"]);
    expect(v.guiasSinCosto).toEqual([]);
    expect(v.rendimiento).toBe(0.5);
    expect(v.rendimientoDe).toBe("asiento");
  });

  it("2. sin congelar, el consumo vivo prorratea el costo de la guía", () => {
    const v = valorDeCorrida(
      corrida({
        gtfOrigen: ["GTF-0002"],
        // S/ 3.000 por 10 m³ de guía = S/ 300 el m³ de troza.
        costoConsumos: [consumo({ gtfNumber: "GTF-0002", costoTotalGuia: 3000, volumenGuiaM3: 10 })],
      }),
    );
    expect(v.porM3).toBe(600);
    expect(v.origen).toBe("consumo");
    expect(v.guiasUsadas).toEqual(["GTF-0002"]);
  });

  it("3. sin consumos, las guías de origen declaradas", () => {
    const v = valorDeCorrida(
      corrida({
        gtfOrigen: ["GTF-0003"],
        costoPorGtf: [{ gtfNumber: "GTF-0003", costoTotal: 3000, volumeM3: 10 }],
      }),
    );
    expect(v.porM3).toBe(600);
    expect(v.origen).toBe("guia");
    expect(v.guiasUsadas).toEqual(["GTF-0003"]);
  });

  it("4. sin nada: null y «sin-costo», jamás S/ 0", () => {
    const v = valorDeCorrida(corrida({ gtfOrigen: ["GTF-0004"] }));
    expect(v.porM3).toBeNull();
    expect(v.origen).toBe("sin-costo");
    expect(v.guiasSinCosto).toEqual(["GTF-0004"]);
    expect(v.guiasUsadas).toEqual([]);
  });

  it("mezclar fuentes está prohibido: si hay congelado, el vivo no entra", () => {
    // Promediados darían 450 → S/ 900 el m³. Ese número no es ninguno de los
    // dos y nadie lo puede reconstruir después.
    const v = valorDeCorrida(
      corrida({
        costoConsumos: [
          consumo({ gtfNumber: "GTF-A", costoUnitarioSnap: 300 }),
          consumo({ gtfNumber: "GTF-B", costoTotalGuia: 6000, volumenGuiaM3: 10 }),
        ],
      }),
    );
    expect(v.porM3).toBe(600);
    expect(v.origen).toBe("consumo-congelado");
    expect(v.guiasUsadas).toEqual(["GTF-A"]);
  });
});

describe("valorDeCorrida · una guía sin costear no baja el promedio", () => {
  it("se promedia con las que tienen y la que falta se NOMBRA", () => {
    const v = valorDeCorrida(
      corrida({
        gtfOrigen: ["GTF-A", "GTF-B"],
        costoPorGtf: [
          { gtfNumber: "GTF-A", costoTotal: 3000, volumeM3: 10 },
          { gtfNumber: "GTF-B", costoTotal: null, volumeM3: 8 },
        ],
      }),
    );
    // Contando GTF-B como 0 daría 166,67 → S/ 333,33: un patio subvaluado a la
    // mitad porque falta cargar una factura.
    expect(v.porM3).toBe(600);
    expect(v.guiasUsadas).toEqual(["GTF-A"]);
    expect(v.guiasSinCosto).toEqual(["GTF-B"]);
  });

  it("pondera por VOLUMEN: una guía de 40 m³ no pesa igual que una de 2", () => {
    const v = valorDeCorrida(
      corrida({
        gtfOrigen: ["GTF-A", "GTF-B"],
        costoPorGtf: [
          { gtfNumber: "GTF-A", costoTotal: 12000, volumeM3: 40 }, // 300 el m³
          { gtfNumber: "GTF-B", costoTotal: 1200, volumeM3: 2 }, // 600 el m³
        ],
      }),
    );
    // (40×300 + 2×600) / 42 = 314,2857 de troza ÷ 0,50 = 628,57 de producto.
    // El promedio simple (450) daría S/ 900 — un 43 % de más.
    expect(v.porM3).toBe(628.57);
  });

  it("un costo en CERO no es un costo: es el default de un campo sin llenar", () => {
    const v = valorDeCorrida(
      corrida({
        gtfOrigen: ["GTF-A"],
        costoPorGtf: [{ gtfNumber: "GTF-A", costoTotal: 0, volumeM3: 10 }],
      }),
    );
    expect(v.porM3).toBeNull();
    expect(v.guiasSinCosto).toEqual(["GTF-A"]);
  });
});

describe("valorDeCorrida · el rendimiento no se inventa", () => {
  const conPlata = { gtfOrigen: ["GTF-A"], costoPorGtf: [{ gtfNumber: "GTF-A", costoTotal: 3000, volumeM3: 10 }] };

  it("sin rendimiento NO se supone el 56 %: devuelve null", () => {
    const v = valorDeCorrida(
      corrida({ ...conPlata, rendimientoPct: null, producido: 0, volumenConsumidoM3: null }),
    );
    expect(v.porM3).toBeNull();
    expect(v.origen).toBe("sin-costo");
    expect(v.rendimiento).toBeNull();
    expect(v.rendimientoDe).toBeNull();
    // 300 / 0,56 = 535,71 — el número que saldría suponiendo el tope legal.
    expect(v.porM3).not.toBe(535.71);
  });

  it("si no hay asiento, se deriva de la corrida (producido ÷ consumido)", () => {
    const v = valorDeCorrida(
      corrida({ ...conPlata, rendimientoPct: null, producido: 5.6, volumenConsumidoM3: 10 }),
    );
    expect(v.rendimiento).toBeCloseTo(0.56, 10);
    expect(v.rendimientoDe).toBe("derivado");
    expect(v.porM3).toBe(535.71);
  });

  it("un rendimiento imposible (0, negativo o > 100 %) se descarta", () => {
    // Sacar más producto que troza es un error de carga, no un dato.
    const imposible = valorDeCorrida(
      corrida({ ...conPlata, rendimientoPct: 120, producido: 0, volumenConsumidoM3: null }),
    );
    expect(imposible.rendimiento).toBeNull();
    expect(imposible.porM3).toBeNull();

    const cero = valorDeCorrida(corrida({ ...conPlata, rendimientoPct: 0 }));
    expect(cero.rendimiento).toBeNull();

    // Descartado el 120 % del asiento, todavía puede derivarlo de la corrida.
    const cae = valorDeCorrida(
      corrida({ ...conPlata, rendimientoPct: 120, producido: 5, volumenConsumidoM3: 10 }),
    );
    expect(cae.rendimientoDe).toBe("derivado");
    expect(cae.porM3).toBe(600);
  });
});

describe("valorDeFila y resumenDeValor", () => {
  const valorizada = valorDeCorrida(
    corrida({
      gtfOrigen: ["GTF-A"],
      costoPorGtf: [{ gtfNumber: "GTF-A", costoTotal: 3000, volumeM3: 10 }],
    }),
  );
  const sinValor = valorDeCorrida(corrida({ gtfOrigen: ["GTF-Z"] }));

  it("la fila vale su volumen por el costo del m³ de producto", () => {
    expect(valorDeFila(valorizada, 1.5)).toBe(900);
    expect(valorDeFila(valorizada, 0)).toBe(0);
  });

  it("si la corrida no se pudo valorizar, la fila tampoco: null, no 0", () => {
    expect(valorDeFila(sinValor, 12.5)).toBeNull();
    expect(valorDeFila(valorizada, Number.NaN)).toBeNull();
  });

  it("el resumen suma lo valorizable y CUENTA lo que quedó afuera", () => {
    const r = resumenDeValor([
      { valor: valorizada, volumenM3: 1.5 },
      { valor: valorizada, volumenM3: 2 },
      { valor: sinValor, volumenM3: 9 },
    ]);
    expect(r.totalSoles).toBe(2100); // 900 + 1200
    expect(r.filasValorizadas).toBe(2);
    expect(r.filasSinValor).toBe(1);
    expect(r.guiasSinCosto).toEqual(["GTF-Z"]);
  });
});

describe("el patio de Blas al 2026-09-15: 0 de 24 guías costeadas, 0 consumos", () => {
  const GUIAS = Array.from({ length: 24 }, (_, i) => `GTF-${String(i + 1).padStart(4, "0")}`);
  const filas = GUIAS.map((g) => ({
    valor: valorDeCorrida(
      corrida({ gtfOrigen: [g], costoPorGtf: [{ gtfNumber: g, costoTotal: null, volumeM3: 12.5 }] }),
    ),
    volumenM3: 3.2448,
  }));

  it("ninguna corrida se puede valorizar", () => {
    expect(filas.every((f) => f.valor.porM3 === null)).toBe(true);
    expect(filas.every((f) => f.valor.origen === "sin-costo")).toBe(true);
  });

  it("el total es 0 PERO con 24 filas sin valor y las 24 guías nombradas", () => {
    // Mostrar «S/ 0» a secas sería declarar que el patio no vale nada. El
    // contador de filas sin valor es lo que obliga a la pantalla a decir
    // «faltan costear 24 guías» en vez de un cero.
    const r = resumenDeValor(filas);
    expect(r.totalSoles).toBe(0);
    expect(r.filasValorizadas).toBe(0);
    expect(r.filasSinValor).toBe(24);
    expect(r.guiasSinCosto).toHaveLength(24);
    expect(r.guiasSinCosto[0]).toBe("GTF-0001");
  });
});
