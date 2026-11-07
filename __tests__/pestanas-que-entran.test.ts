import { describe, expect, it } from "vitest";
import { elegirLugar, repartirPestanas } from "@/lib/admin/pestanas-que-entran";

const IDS = ["a", "b", "c", "d", "e"] as const;
const ANCHOS = { a: 100, b: 100, c: 100, d: 100, e: 100 };
const base = { ids: IDS, anchos: ANCHOS, anchoMas: 60, separacion: 0, activa: "a" as string | null };

describe("repartirPestanas", () => {
  it("si entran todas, no hay «Más»", () => {
    expect(repartirPestanas({ ...base, disponible: 500 })).toEqual({ visibles: [...IDS], escondidas: [] });
  });

  it("las que no entran van al «Más», reservándole su lugar", () => {
    // 340 − 60 del «Más» = 280: entran dos.
    expect(repartirPestanas({ ...base, disponible: 340 })).toEqual({ visibles: ["a", "b"], escondidas: ["c", "d", "e"] });
  });

  it("la activa escondida ocupa el lugar de la última visible", () => {
    expect(repartirPestanas({ ...base, disponible: 340, activa: "e" })).toEqual({
      visibles: ["a", "e"],
      escondidas: ["b", "c", "d"],
    });
  });

  it("las forzadas al «Más» (sin uso) no se ven aunque entren; la activa sí", () => {
    expect(repartirPestanas({ ...base, disponible: 900, aMas: ["d", "e"] })).toEqual({
      visibles: ["a", "b", "c"],
      escondidas: ["d", "e"],
    });
    expect(repartirPestanas({ ...base, disponible: 900, aMas: ["d", "e"], activa: "e" }).visibles).toContain("e");
  });

  it("en una pantalla muy angosta queda al menos una", () => {
    expect(repartirPestanas({ ...base, disponible: 40, activa: null }).visibles).toEqual(["a"]);
  });
});

describe("elegirLugar", () => {
  it("al lado del título si se ven al menos las mínimas; si no, en su fila", () => {
    const lugares = [
      { ancho: 250, minimo: 3 },
      { ancho: 600, minimo: 0 },
    ];
    expect(elegirLugar(lugares, base)).toMatchObject({ lugar: 1, escondidas: [] });
    expect(elegirLugar([{ ancho: 400, minimo: 3 }, lugares[1]], base)).toMatchObject({
      lugar: 0,
      visibles: ["a", "b", "c"],
    });
  });
});
