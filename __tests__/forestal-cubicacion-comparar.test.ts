/**
 * Comparar dos lotes: los deltas se leen "B respecto de A", y un grupo que
 * desaparece tiene que seguir viéndose (con 0), que es justo lo que interesa.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { compararLotes, lecturaComparacion } from "@/lib/forestal/cubicacion-comparar";

let seq = 0;
function pieza(cantidad: number, espesor: number, ancho: number, largo: number, especie = "Tornillo"): PiezaCubicada {
  const dims = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id: `c${++seq}`, ...dims, especie, ...cubicarPieza(dims) };
}

const COMERCIAL = (n: number) => pieza(n, 1.5, 8, 10); // 10.00 PT c/u
const CORTA = (n: number) => pieza(n, 6, 6, 4);        // 12 PT c/u

describe("compararLotes", () => {
  it("mide el cambio de B respecto de A y ordena por lo que más se movió", () => {
    const a = [COMERCIAL(3), CORTA(10)];
    const b = [COMERCIAL(9), CORTA(1)];
    const c = compararLotes(a, b, "tipo");
    expect(c.filas[0].label).toBe("Paquetería corta");   // −108 PT es el mayor movimiento
    expect(c.filas[0].deltaPt).toBeLessThan(0);
    const comercial = c.filas.find((f) => f.label === "Comercial")!;
    expect(comercial.deltaPt).toBeGreaterThan(0);
    expect(c.total.deltaPt).toBe(Math.round((comercial.deltaPt + c.filas[0].deltaPt) * 100) / 100);
  });

  it("un tipo que desaparece sigue apareciendo con 0 (es lo que se quiere ver)", () => {
    const c = compararLotes([CORTA(5)], [COMERCIAL(5)], "tipo");
    const corta = c.filas.find((f) => f.label === "Paquetería corta")!;
    expect(corta.ptB).toBe(0);
    expect(corta.deltaPt).toBe(-corta.ptA);
    expect(corta.pctB).toBe(0);
  });

  it("calcula el precio por PT de cada lote y sólo si hay precio", () => {
    const sin = compararLotes([COMERCIAL(2)], [COMERCIAL(3)], "tipo");
    expect(sin.precioPtA).toBe(0);
    const con = compararLotes([COMERCIAL(2)], [COMERCIAL(3)], "tipo", 4);
    expect(con.precioPtA).toBe(4);
    expect(con.precioPtB).toBe(4);
  });

  it("compara por cualquier dimensión, no sólo por tipo", () => {
    const c = compararLotes([COMERCIAL(2)], [COMERCIAL(2), pieza(1, 2, 8, 10, "Cedro")], "especie");
    expect(c.filas.map((f) => f.label).sort()).toEqual(["Cedro", "Tornillo"]);
    expect(c.filas.find((f) => f.label === "Cedro")!.ptA).toBe(0);
  });

  it("dos lotes vacíos no rompen", () => {
    const c = compararLotes([], [], "tipo");
    expect(c.filas).toEqual([]);
    expect(c.total.deltaPt).toBe(0);
    expect(lecturaComparacion(c)).toMatch(/vacíos/);
  });
});

describe("lecturaComparacion", () => {
  it("dice cuánto cambió, quién lo explica y si el PT se paga mejor", () => {
    const c = compararLotes([CORTA(10)], [COMERCIAL(10)], "tipo", 5);
    const txt = lecturaComparacion(c);
    expect(txt).toMatch(/PT (más|menos) que el otro/);
    expect(txt).toMatch(/se explica sobre todo por/);
    expect(txt).toMatch(/pie tablar se paga/);
  });

  it("sin precios no inventa la parte del precio", () => {
    expect(lecturaComparacion(compararLotes([CORTA(2)], [CORTA(3)], "tipo"))).not.toMatch(/se paga/);
  });
});
