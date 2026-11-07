import { describe, expect, it } from "vitest";
import type { FilaParseada } from "@/lib/forestal/ctp-formatos-serfor";
import { resumirRollizaPorEspecie } from "@/lib/forestal/resumen-rolliza-por-especie";

const fila = (n: number, especie: string | null, volumenM3: number, estado: string | null = "En Stock", problemas: string[] = []): FilaParseada => ({
  fila: n,
  datos: { especie, volumenM3, estado },
  problemas,
});

describe("resumirRollizaPorEspecie", () => {
  it("junta 2 archivos, Ishpíngo con y sin tilde, sin especie, y pt = m3 x 56 % x 424", () => {
    const a = [fila(2, "Dipteryx / Shihuahuaco", 1), fila(3, "Ishpíngo", 0.5), fila(4, null, 0.25)];
    const b = [fila(2, "Ishpingo", 0.5), fila(3, "Ishpíngo", 1), fila(4, "Dipteryx / Shihuahuaco", 1)];
    const r = resumirRollizaPorEspecie([...a, ...b]);
    expect(r.filas.map((f) => [f.especie, f.trozas, f.m3])).toEqual([
      ["Ishpíngo", 3, 2],
      ["Shihuahuaco", 2, 2],
      ["Sin especie", 1, 0.25],
    ]);
    expect(r.filas[0].ptAserrable).toBe(Math.round(2 * 0.56 * 424)); // 475
    expect(r.total).toEqual({ trozas: 6, m3: 4.25, ptAserrable: Math.round(4.25 * 0.56 * 424) });
  });

  it("suma exacta 0,1 + 0,2 y descarta lo que no entra", () => {
    const r = resumirRollizaPorEspecie([
      fila(2, "Tornillo", 0.1),
      fila(3, "Tornillo", 0.2),
      fila(4, "Tornillo", 5, "Despachada"),
      fila(5, "Tornillo", 9, "En Stock", ["falta volumen"]),
    ]);
    expect(r.total.m3).toBe(0.3);
    expect(r.fueraDeStock).toBe(1);
    expect(r.filas).toHaveLength(1);
  });

  it("vacío", () => {
    expect(resumirRollizaPorEspecie([])).toEqual({ filas: [], total: { trozas: 0, m3: 0, ptAserrable: 0 }, fueraDeStock: 0 });
  });
});
