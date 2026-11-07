/**
 * El camión de una cubicación de trozas (24-10): placa y chofer al guardar.
 * Normalización pura + lo que deja pasar el Zod de POST y PATCH.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_CHOFER,
  MAX_PLACA,
  camionParaGuardar,
  editarCubicacionSchema,
  guardarCubicacionSchema,
  normalizarChofer,
  normalizarPlacaCamion,
} from "@/lib/forestal/cubicacion-cuenta";

const base = {
  fecha: "2026-10-08",
  formula: "oxapampina",
  diametros: 1,
  beneficiarioId: "b1",
  trozas: [{ especie: "Tornillo", d1: 20, largo: 12 }],
};

describe("normalizar el camión", () => {
  it("placa peruana → como en el papel; lo demás en mayúsculas con un espacio; vacío → null", () => {
    expect(normalizarPlacaCamion(" w2d  853 ")).toBe("W2D-853");
    expect(normalizarPlacaCamion("a2c123")).toBe("A2C-123");
    expect(normalizarPlacaCamion("  sin   placa ")).toBe("SIN PLACA");
    expect(normalizarPlacaCamion("   ")).toBeNull();
    expect(normalizarPlacaCamion(null)).toBeNull();
  });

  it("chofer: recorta los bordes y los espacios dobles, respeta mayúsculas; vacío → null", () => {
    expect(normalizarChofer("  Wilmer   Ramírez  ")).toBe("Wilmer Ramírez");
    expect(normalizarChofer("")).toBeNull();
    expect(normalizarChofer(undefined)).toBeNull();
  });

  it("camionParaGuardar topa al largo de la columna (sin espacio colgando)", () => {
    const largo = camionParaGuardar({ placa: "x".repeat(30), chofer: `${"a".repeat(MAX_CHOFER - 1)} bcd` });
    expect(largo.placa).toHaveLength(MAX_PLACA);
    expect(largo.chofer).toBe("a".repeat(MAX_CHOFER - 1));
    expect(camionParaGuardar({})).toEqual({ placa: null, chofer: null });
  });
});

describe("Zod de guardar y editar", () => {
  it("sin los campos pasa igual que antes (quedan ausentes)", () => {
    const r = guardarCubicacionSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && [r.data.placa, r.data.chofer]).toEqual([undefined, undefined]);
  });

  it("normaliza al validar; \"\" y null → null (en el PATCH, borrar)", () => {
    const r = guardarCubicacionSchema.safeParse({ ...base, placa: "w2d 853", chofer: "  Juan  Pérez " });
    expect(r.success && [r.data.placa, r.data.chofer]).toEqual(["W2D-853", "Juan Pérez"]);
    const e = editarCubicacionSchema.safeParse({ ...base, version: 2, placa: "", chofer: null });
    expect(e.success && [e.data.placa, e.data.chofer]).toEqual([null, null]);
  });

  it("más largo que la columna → 422 con su mensaje, no un recorte callado", () => {
    const r = guardarCubicacionSchema.safeParse({ ...base, placa: "CAMION DE LA EMPRESA X" });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0]?.message).toMatch(/placa va con 20 caracteres/);
    expect(guardarCubicacionSchema.safeParse({ ...base, chofer: "a".repeat(MAX_CHOFER + 1) }).success).toBe(false);
  });
});
