/**
 * Meta de mix y tendencia: el resumen deja de decir sólo "qué salió" y pasa a
 * decir "qué buscabas" y "cómo venís".
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { evaluarMeta, serieTendencia, META_DEFAULT } from "@/lib/forestal/cubicacion-meta";

let seq = 0;
function pieza(cantidad: number, espesor: number, ancho: number, largo: number): PiezaCubicada {
  const dims = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id: `m${++seq}`, ...dims, especie: "Tornillo", ...cubicarPieza(dims) };
}
const COMERCIAL = (n: number) => pieza(n, 1.5, 8, 10); // 10.00 PT c/u
const CORTA = (n: number) => pieza(n, 6, 6, 4);        // 12 PT c/u

describe("evaluarMeta", () => {
  it("sin piezas no evalúa nada (no se juzga el aire)", () => {
    expect(evaluarMeta([], META_DEFAULT)).toBeNull();
  });

  it("cumple cuando el tipo llega al piso pedido", () => {
    const e = evaluarMeta([COMERCIAL(10)], { tipo: "Comercial", pctMinimo: 50 })!;
    expect(e.actual).toBe(100);
    expect(e.cumple).toBe(true);
    expect(e.faltanPuntos).toBe(0);
    expect(e.faltanPt).toBe(0);
  });

  it("cuando no llega, dice cuántos puntos y cuánto pie tablar faltan", () => {
    // 100 PT comercial + 600 PT corta ≈ 14.3% comercial
    const e = evaluarMeta([COMERCIAL(10), CORTA(50)], { tipo: "Comercial", pctMinimo: 50 })!;
    expect(e.cumple).toBe(false);
    expect(e.actual).toBeCloseTo(14.3, 0);
    expect(e.faltanPuntos).toBeCloseTo(35.7, 0);
    expect(e.faltanPt).toBeGreaterThan(200);   // ~35.7% de 700 PT
  });

  it("un tipo ausente da 0% y no rompe", () => {
    const e = evaluarMeta([CORTA(5)], { tipo: "Tabla", pctMinimo: 20 })!;
    expect(e.actual).toBe(0);
    expect(e.faltanPuntos).toBe(20);
  });
});

describe("serieTendencia", () => {
  const reg = (id: string, fecha: string, piezas: PiezaCubicada[], precioPt = 0) =>
    ({ id, nombre: `Lote ${id}`, fecha, piezas, precioPt });

  it("ordena del más viejo al más nuevo y mide la mejora en puntos", () => {
    const t = serieTendencia([
      reg("b", "2026-07-10", [COMERCIAL(5), CORTA(5)]),   // ~52.6% comercial
      reg("a", "2026-06-01", [CORTA(10)]),                // 0% comercial
      reg("c", "2026-07-20", [COMERCIAL(10)]),            // 100%
    ], { tipo: "Comercial", pctMinimo: 50 });
    expect(t.puntos.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(t.deltaPctMeta).toBe(100);                     // de 0% a 100%
    expect(t.promedioPctMeta).toBeGreaterThan(40);
  });

  it("recalcula el % desde las piezas y trae el precio por PT de cada lote", () => {
    const t = serieTendencia([reg("x", "2026-07-01", [COMERCIAL(3)], 5)], META_DEFAULT);
    expect(t.puntos[0].pctMeta).toBe(100);
    expect(t.puntos[0].precioPt).toBe(5);
    expect(t.puntos[0].pieTablar).toBeCloseTo(30, 0);
  });

  it("se queda con las últimas N y descarta cubicaciones vacías", () => {
    const muchos = Array.from({ length: 12 }, (_, i) =>
      reg(`n${i}`, `2026-07-${String(i + 1).padStart(2, "0")}`, [COMERCIAL(1)]));
    const t = serieTendencia([...muchos, reg("vacia", "2026-07-30", [])], META_DEFAULT, 5);
    expect(t.puntos).toHaveLength(5);
    expect(t.puntos.at(-1)!.id).toBe("n11");
    expect(t.puntos.some((p) => p.id === "vacia")).toBe(false);
  });

  it("un solo punto no inventa tendencia", () => {
    const t = serieTendencia([reg("u", "2026-07-01", [COMERCIAL(2)])], META_DEFAULT);
    expect(t.deltaPctMeta).toBe(0);
  });
});
