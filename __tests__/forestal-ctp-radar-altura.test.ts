/**
 * Alto del bloque proporcional a la cantidad.
 *
 * Lo que se blinda: que el dibujo no invente proporciones. Si una columna
 * mezcla m³ con pies tablares, comparar alturas es comparar peras con manzanas
 * —el mismo error que ya cuida el análisis de rendimiento— y el bloque tiene
 * que quedarse parejo antes que mentir.
 */
import { describe, expect, it } from "vitest";
import { alturasDeColumna, techoDeAltura, type NodoMedible } from "@/lib/forestal/ctp-radar-altura";

const OPTS = { base: 62, maximo: 162 };
const n = (id: string, valor: number, unidad: string | null = "m3"): NodoMedible => ({ id, valor, unidad });

describe("alto por cantidad", () => {
  it("el más grande llega al techo y el más chico se queda en el piso", () => {
    const { alturas, aplicada } = alturasDeColumna([n("a", 100), n("b", 0)], OPTS);
    expect(aplicada).toBe(true);
    expect(alturas.get("a")).toBe(162);
    expect(alturas.get("b")).toBe(62);
  });

  it("interpola lineal entre el piso y el techo", () => {
    const { alturas } = alturasDeColumna([n("a", 100), n("b", 50), n("c", 25)], OPTS);
    expect(alturas.get("a")).toBe(162);
    expect(alturas.get("b")).toBe(112); // 62 + 100 * 0.5
    expect(alturas.get("c")).toBe(87); // 62 + 100 * 0.25
  });

  it("con unidades mezcladas NO toca las alturas", () => {
    const { alturas, aplicada, motivo } = alturasDeColumna(
      [n("a", 100, "m3"), n("b", 5000, "pt")],
      OPTS,
    );
    expect(aplicada).toBe(false);
    expect(motivo).toBe("unidades-mixtas");
    expect(alturas.get("a")).toBe(62);
    expect(alturas.get("b")).toBe(62);
  });

  it("una línea en 0 no descalifica a la columna por su unidad", () => {
    // La de 0 no aporta a la escala; su unidad vacía no debería volver mixta la columna.
    const { aplicada, alturas } = alturasDeColumna([n("a", 100, "m3"), n("b", 0, null)], OPTS);
    expect(aplicada).toBe(true);
    expect(alturas.get("a")).toBe(162);
    expect(alturas.get("b")).toBe(62);
  });

  it("la unidad se compara sin distinguir mayúsculas ni espacios", () => {
    const { aplicada } = alturasDeColumna([n("a", 10, "m3"), n("b", 5, " M3 ")], OPTS);
    expect(aplicada).toBe(true);
  });

  it("con una sola línea no hay nada que comparar", () => {
    const { aplicada, motivo, alturas } = alturasDeColumna([n("a", 100)], OPTS);
    expect(aplicada).toBe(false);
    expect(motivo).toBe("sin-datos");
    expect(alturas.get("a")).toBe(62);
  });

  it("si todas las cantidades son 0, quedan parejas", () => {
    const { aplicada, motivo } = alturasDeColumna([n("a", 0), n("b", 0)], OPTS);
    expect(aplicada).toBe(false);
    expect(motivo).toBe("sin-datos");
  });

  it("un NaN o un negativo cuentan como 0 y no rompen la escala", () => {
    const { alturas, aplicada } = alturasDeColumna([n("a", 80), n("b", Number.NaN), n("c", -5)], OPTS);
    expect(aplicada).toBe(true);
    expect(alturas.get("a")).toBe(162);
    expect(alturas.get("b")).toBe(62);
    expect(alturas.get("c")).toBe(62);
  });

  it("nunca devuelve un alto por debajo del piso ni por encima del techo", () => {
    const { alturas } = alturasDeColumna(
      [n("a", 1), n("b", 999999), n("c", 0.0001)],
      OPTS,
    );
    for (const h of alturas.values()) {
      expect(h).toBeGreaterThanOrEqual(62);
      expect(h).toBeLessThanOrEqual(162);
    }
  });

  it("un techo menor que el piso no invierte el bloque", () => {
    const { alturas } = alturasDeColumna([n("a", 10), n("b", 1)], { base: 62, maximo: 20 });
    expect(alturas.get("a")).toBe(62);
    expect(alturas.get("b")).toBe(62);
  });

  it("todos los nodos reciben un alto, siempre", () => {
    const nodos = [n("a", 5), n("b", 0), n("c", 7)];
    for (const caso of [OPTS, { base: 48, maximo: 120 }]) {
      const { alturas } = alturasDeColumna(nodos, caso);
      expect([...alturas.keys()].sort()).toEqual(["a", "b", "c"]);
    }
  });

  it("el techo sugerido crece con el piso pero no se dispara", () => {
    expect(techoDeAltura(62)).toBe(155);
    expect(techoDeAltura(48)).toBe(120);
    expect(techoDeAltura(130)).toBe(280); // 130*2.5=325 → 130+150 manda
  });
});
