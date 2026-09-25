/**
 * Lectura del lote — los insights tienen que salir del MISMO cálculo que las
 * tablas (agruparPor) y no inventar nada cuando no hay datos.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { analizarLote } from "@/lib/forestal/cubicacion-insights";

let seq = 0;
function pieza(cantidad: number, espesor: number, ancho: number, largo: number, especie = "Tornillo"): PiezaCubicada {
  const dims = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id: `i${++seq}`, ...dims, especie, ...cubicarPieza(dims) };
}
const textos = (l: ReturnType<typeof analizarLote>) => l.map((i) => i.texto).join(" | ");

describe("analizarLote", () => {
  it("sin piezas no inventa lecturas", () => {
    expect(analizarLote([])).toEqual([]);
  });

  it("detecta la especie que manda cuando pasa el 60% del pie tablar", () => {
    const lote = [pieza(20, 2, 8, 10, "Tornillo"), pieza(1, 2, 8, 10, "Cedro")];
    const r = analizarLote(lote);
    expect(textos(r)).toMatch(/prácticamente de Tornillo/);
    expect(r[0].dato).toMatch(/9[0-9]%|100%/);
  });

  it("avisa cuando el lote es mayormente producto corto (el que peor se paga)", () => {
    const lote = [pieza(30, 6, 6, 4), pieza(2, 2, 8, 10)];   // casi todo paquetería corta
    const alerta = analizarLote(lote).find((i) => i.nivel === "alerta" && /corta o sin clasificar/.test(i.texto));
    expect(alerta).toBeDefined();
    expect(alerta!.dato).toMatch(/%/);
  });

  it("marca las piezas que no caen en ningún tipo comercial", () => {
    const raro = [{ ...pieza(3, 0.5, 1, 3), espesor: 0.5, ancho: 1 } as PiezaCubicada];
    const r = analizarLote(raro);
    expect(textos(r)).toMatch(/no caen en ningún tipo comercial/);
  });

  it("calcula el precio implícito por PT sólo si hay precio", () => {
    const lote = [pieza(10, 2, 8, 12)];                      // 160 PT
    expect(textos(analizarLote(lote))).not.toMatch(/Precio promedio/);
    const conPrecio = analizarLote(lote, 3);
    const precio = conPrecio.find((i) => /Precio promedio/.test(i.texto));
    // es-PE usa PUNTO decimal para plata (la coma es sólo del formato SERFOR).
    expect(precio?.dato).toBe("S/ 3.00 por PT");
  });

  it("propone cerrar la medida dominante cuando hay más de una", () => {
    const lote = [pieza(20, 2, 8, 10), pieza(1, 1, 6, 8)];
    const op = analizarLote(lote).find((i) => i.nivel === "oportunidad" && /medida/.test(i.texto));
    expect(op?.texto).toContain("2×8×10");
  });

  it("señala las cortas de 4 a 6 pies: a 6' cambian de categoría", () => {
    const lote = [pieza(5, 2, 8, 5)];
    const op = analizarLote(lote).find((i) => /4 a 6 pies/.test(i.texto));
    expect(op?.nivel).toBe("oportunidad");
    expect(op?.dato).toContain("5 pzas");
  });

  it("ordena lo accionable primero: alertas, después oportunidades", () => {
    const lote = [pieza(30, 6, 6, 4), pieza(5, 2, 8, 5), pieza(2, 2, 8, 10)];
    const niveles = analizarLote(lote, 3).map((i) => i.nivel);
    expect(niveles.indexOf("alerta")).toBeLessThan(niveles.lastIndexOf("info"));
    if (niveles.includes("oportunidad")) {
      expect(niveles.indexOf("alerta")).toBeLessThan(niveles.indexOf("oportunidad"));
    }
  });
});
