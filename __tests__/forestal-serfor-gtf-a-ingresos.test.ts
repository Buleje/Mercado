import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsearConsultaGtf, type GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { medidasDeTroza, repartirGtfEnIngresos, volumenSegunDimensiones } from "@/lib/forestal/serfor-gtf-a-ingresos";

/**
 * ADR-312 — una GTF con N especies son N renglones del libro, no uno.
 *
 * El fixture es la respuesta REAL de SERFOR para la guía 1-19-0313629 (con los
 * datos de personas cambiados por ficticios): Copaiba 9.065 m³ + Sapotillo
 * 4.874 m³, total 13.939 m³.
 */

const encontrada = readFileSync(join(process.cwd(), "__tests__/fixtures/serfor-gtf-encontrada.html"), "utf8");
const guiaReal = parsearConsultaGtf(encontrada, "1-19-0313629").gtf!;

/** Ficha mínima para los casos que el fixture no tiene. */
function ficha(over: Partial<GtfSerfor>): GtfSerfor {
  return { ...guiaReal, productos: [], trozas: [], volumenTotal: null, ...over } as GtfSerfor;
}

describe("Repartir la GTF en ingresos", () => {
  const r = repartirGtfEnIngresos(guiaReal);
  if (!r.ok) throw new Error(r.motivo);

  it("una guía de 2 especies son 2 ingresos, no uno", () => {
    expect(r.ingresos).toHaveLength(2);
    expect(r.ingresos.map((i) => i.especieComun)).toEqual(["Copaiba", "Sapotillo"]);
  });

  it("cada ingreso lleva SU volumen, no el total de la guía", () => {
    // El bug que motivó el ADR: Copaiba se guardaba con 13.939 m³.
    expect(r.ingresos[0]!.volumenM3).toBe(9.065);
    expect(r.ingresos[1]!.volumenM3).toBe(4.874);
    expect(r.ingresos.reduce((a, x) => a + x.volumenM3, 0)).toBeCloseTo(13.939, 3);
  });

  it("el volumen sale del producto declarado, no de una suma nuestra", () => {
    expect(r.ingresos.every((i) => i.volumenDe === "producto")).toBe(true);
  });

  it("reparte las trozas entre las especies que declaran", () => {
    const total = r.ingresos.reduce((a, i) => a + i.trozas.length, 0);
    expect(total).toBe(guiaReal.trozas.length);
    // Ninguna troza se duplica entre ingresos.
    const codigos = r.ingresos.flatMap((i) => i.trozas.map((t) => `${i.especieComun}|${t.orden}`));
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it("la troza conserva su codificación y sus dimensiones tal como las publica SERFOR", () => {
    const t = r.ingresos.flatMap((i) => i.trozas)[0]!;
    expect(t.codificacion).toBeTruthy();
    expect(t.dimensiones).toMatch(/X/i);
  });

  it("no inventa avisos cuando la guía cuadra", () => {
    expect(r.avisos).toEqual([]);
  });
});

describe("Medidas de la troza", () => {
  it("lee 'd1 X d2 X largo': diámetros en cm, largo en metros", () => {
    // Leerlo al revés daba trozas de 100 metros de largo y 51 de diámetro.
    expect(medidasDeTroza("100.0 X 96.0 X 6.5")).toEqual({
      largoM: 6.5, diametroCm: 98, d1Cm: 100, d2Cm: 96,
    });
  });

  it("el volumen recalculado reproduce el que DECLARA la guía real", () => {
    // El control que prueba que la lectura es la correcta: con cualquier otro
    // orden de las dimensiones estos números no dan.
    const declarados: Array<[string, number]> = [
      ["100.0 X 96.0 X 6.5", 4.903],
      ["93.0 X 90.0 X 6.33", 4.162],
      ["55.0 X 51.0 X 7.28", 1.606],
      ["73.0 X 58.0 X 9.7", 3.268],
    ];
    for (const [dim, declarado] of declarados) {
      // SERFOR publica el volumen con 3 decimales: la tolerancia es su propio
      // redondeo (±0.001), no un margen para que el test pase.
      expect(Math.abs(volumenSegunDimensiones(dim)! - declarado)).toBeLessThanOrEqual(0.001);
    }
  });

  it("y coincide con lo que la guía real trae en su lista de trozas", () => {
    for (const t of guiaReal.trozas) {
      if (t.volumen == null || !t.dimensiones) continue;
      expect(Math.abs(volumenSegunDimensiones(t.dimensiones)! - t.volumen)).toBeLessThanOrEqual(0.001);
    }
  });

  it("un texto que no se puede partir NO se descarta: quedan los números en null", () => {
    const vacio = { largoM: null, diametroCm: null, d1Cm: null, d2Cm: null };
    expect(medidasDeTroza("s/d")).toEqual(vacio);
    expect(medidasDeTroza(null)).toEqual(vacio);
    expect(volumenSegunDimensiones("s/d")).toBeNull();
  });
});

describe("Guías que no cuadran", () => {
  it("una guía sin productos no se registra sola", () => {
    const r = repartirGtfEnIngresos(ficha({ productos: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/no declara ningún producto/i);
  });

  it("un producto sin volumen cae a la suma de SUS trozas", () => {
    const r = repartirGtfEnIngresos(
      ficha({
        productos: [{ cientifico: null, comun: "Copaiba", tipoProducto: null, presentacion: null, cantidad: null, unidad: null, volumen: null }],
        trozas: [
          { cientifico: null, comun: "Copaiba", tipoProducto: null, presentacion: null, cantidad: 1, unidad: null, volumen: 2.5, codificacion: "A-1", dimensiones: "5.00 X 0.80 X 0.80" },
          { cientifico: null, comun: "Copaiba", tipoProducto: null, presentacion: null, cantidad: 1, unidad: null, volumen: 1.5, codificacion: "A-2", dimensiones: "4.00 X 0.70 X 0.70" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ingresos[0]!.volumenM3).toBe(4);
      expect(r.ingresos[0]!.volumenDe).toBe("trozas");
      expect(r.avisos.join(" ")).toMatch(/no lo declara/i);
    }
  });

  it("sin volumen ni trozas NO se reparte el total a ojo: se rechaza", () => {
    // Repartir 10 m³ entre dos especies "por partes iguales" sería inventar el
    // dato que el libro tiene que probar.
    const r = repartirGtfEnIngresos(
      ficha({
        volumenTotal: 10,
        productos: [
          { cientifico: null, comun: "Copaiba", tipoProducto: null, presentacion: null, cantidad: null, unidad: null, volumen: null },
          { cientifico: null, comun: "Sapotillo", tipoProducto: null, presentacion: null, cantidad: null, unidad: null, volumen: null },
        ],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/Cargá ese ingreso a mano/i);
  });

  it("avisa cuando la suma de los productos no da el total de la guía", () => {
    const r = repartirGtfEnIngresos(
      ficha({
        volumenTotal: 20,
        productos: [{ cientifico: null, comun: "Copaiba", tipoProducto: null, presentacion: null, cantidad: 2, unidad: null, volumen: 9 }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avisos.join(" ")).toMatch(/no coincide con el total/i);
  });

  it("una troza de otra especie NO se pierde: va al primer ingreso con su especie y se avisa", () => {
    const r = repartirGtfEnIngresos(
      ficha({
        productos: [
          { cientifico: null, comun: "Copaiba", tipoProducto: null, presentacion: null, cantidad: 1, unidad: null, volumen: 5 },
          { cientifico: null, comun: "Sapotillo", tipoProducto: null, presentacion: null, cantidad: 1, unidad: null, volumen: 3 },
        ],
        volumenTotal: 8,
        trozas: [
          { cientifico: null, comun: "Lupuna", tipoProducto: null, presentacion: null, cantidad: 1, unidad: null, volumen: 1, codificacion: "X-9", dimensiones: null },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ingresos[0]!.trozas[0]!.especieComun).toBe("Lupuna");
      expect(r.avisos.join(" ")).toMatch(/no coinciden con ninguna especie/i);
    }
  });

  it("matchea especies aunque SERFOR cambie mayúsculas y tildes", () => {
    const r = repartirGtfEnIngresos(
      ficha({
        productos: [{ cientifico: null, comun: "Copaíba", tipoProducto: null, presentacion: null, cantidad: 1, unidad: null, volumen: 5 }],
        volumenTotal: 5,
        trozas: [{ cientifico: null, comun: "COPAIBA", tipoProducto: null, presentacion: null, cantidad: 1, unidad: null, volumen: 5, codificacion: "A-1", dimensiones: null }],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ingresos[0]!.trozas).toHaveLength(1);
  });
});
