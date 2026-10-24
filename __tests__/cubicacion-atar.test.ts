import { describe, expect, it } from "vitest";
import { necesitaAtar, sugerirParte } from "@/lib/forestal/cubicacion-atar";

const partes = [
  { id: "a", nombre: "RONAL PÉREZ SAC" },
  { id: "b", nombre: "Mario Quispe" },
  { id: "c", nombre: "Mario Rojas" },
  { id: "d", nombre: "Paquterero Tornillo" },
];

describe("necesitaAtar", () => {
  it("sin ficha o sin comprador atado", () => {
    expect(necesitaAtar({})).toBe(true);
    expect(necesitaAtar({ ficha: { comunidad: "X" } })).toBe(true);
    expect(necesitaAtar({ ficha: { clienteParteId: "a" } })).toBe(false);
  });
});

describe("sugerirParte", () => {
  it("por nombre parecido, sin tildes ni mayúsculas", () => {
    expect(sugerirParte("paquterero tornillo", partes)?.id).toBe("d");
  });
  it("por una palabra que sólo está en una parte", () => {
    expect(sugerirParte("Ronal tornillo", partes)?.id).toBe("a");
  });
  it("con dos candidatas no sugiere", () => {
    expect(sugerirParte("Mario tornillo", partes)).toBeNull();
  });
  it("vacío no sugiere", () => {
    expect(sugerirParte("  ", partes)).toBeNull();
  });
});
