import { describe, expect, it } from "vitest";
import { resumenPorEspecie } from "@/lib/forestal/loth-importar-guia-resumen";
import type { ProductoGtf } from "@/lib/forestal/serfor-gtf";

const troza = (comun: string | null, m3: number | null, cientifico: string | null = null) => ({
  comun,
  cientifico,
  m3,
});
const prod = (
  comun: string,
  volumen: number | null,
  cientifico: string | null = null,
): ProductoGtf => ({
  comun,
  cientifico,
  tipoProducto: "Troza",
  presentacion: null,
  cantidad: null,
  unidad: null,
  volumen,
});

describe("resumen por especie de una guía importada", () => {
  it("junta la misma especie escrita distinto y ordena por volumen", () => {
    const r = resumenPorEspecie(
      [
        troza("Tornillo", 2),
        troza("TORNILLO (Cedrelinga cateniformis)", 1, "Cedrelinga cateniformis"),
        troza("Cumala", 1),
      ],
      null,
    );
    expect(r.filas.map((f) => [f.comun, f.trozas, f.m3])).toEqual([
      ["Tornillo", 2, 3],
      ["Cumala", 1, 1],
    ]);
    expect(r.filas[0].cientifico).toBe("Cedrelinga cateniformis");
    expect(r.filas[0].pct).toBeCloseTo(75);
    expect(r.trozas).toBe(3);
    expect(r.m3).toBe(4);
  });

  it("sin cuadro (37) no inventa lo declarado", () => {
    const r = resumenPorEspecie([troza("Tornillo", 1)], []);
    expect(r.declaradoM3).toBeNull();
    expect(r.filas[0].declaradoM3).toBeNull();
    expect(r.descuadra).toBe(false);
  });

  it("dentro de 0,01 m³ cuadra; más allá marca la diferencia de la lista contra lo declarado", () => {
    const cuadra = resumenPorEspecie([troza("Tornillo", 3.4504)], [prod("TORNILLO", 3.454)]);
    expect(cuadra.filas[0].diferenciaM3).toBeNull();
    expect(cuadra.descuadra).toBe(false);

    const no = resumenPorEspecie([troza("Tornillo", 3)], [prod("Tornillo", 3.5)]);
    expect(no.filas[0].diferenciaM3).toBe(-0.5);
    expect(no.descuadra).toBe(true);
  });

  it("una especie que sólo declara el cuadro aparece con 0 trozas", () => {
    const r = resumenPorEspecie(
      [troza("Tornillo", 2)],
      [prod("Tornillo", 2), prod("Cumala", 1.2, "Virola sp.")],
    );
    const cumala = r.filas.find((f) => f.comun === "Cumala");
    expect(cumala).toMatchObject({
      trozas: 0,
      m3: 0,
      declaradoM3: 1.2,
      diferenciaM3: -1.2,
      cientifico: "Virola sp.",
    });
    expect(r.declaradoM3).toBe(3.2);
  });

  it("una troza sin especie cae en «Sin especie» y cuenta en el total", () => {
    const r = resumenPorEspecie([troza(null, 0.5), troza("Tornillo", 1.5)], null);
    expect(r.filas.find((f) => f.clave === "(sin especie)")?.comun).toBe("Sin especie");
    expect(r.m3).toBe(2);
  });
});
