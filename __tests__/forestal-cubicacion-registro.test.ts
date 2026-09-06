/**
 * Cubicaciones guardadas: el registro es el respaldo de un trabajo que ya pasó,
 * así que los totales se congelan al guardar y no se creen del cliente.
 */
import { describe, expect, it } from "vitest";
import {
  construirRegistro, filtrarCubicaciones, nombreSugerido, totalesDe,
  type CubicacionRegistro,
} from "@/lib/forestal/cubicacion-registro";

const piezas = [
  { cantidad: 2, espesor: 2, ancho: 8, largo: 10 },   // 13.33 PT c/u → 26.67
  { cantidad: 1, espesor: 2, ancho: 6, largo: 8 },    // 8 PT
];

describe("construirRegistro", () => {
  it("recalcula pie tablar y m³ desde las piezas (no confía en lo que llega)", () => {
    const r = construirRegistro({
      nombre: "Lote Tornillo",
      // El cliente manda un pieTablar mentiroso: se ignora.
      piezas: piezas.map((p) => ({ ...p, pieTablar: 99999, m3: 42 })),
      precioPt: 3.5,
    });
    expect(r.totales.piezas).toBe(3);
    expect(r.totales.pieTablar).toBeCloseTo(34.67, 1);
    expect(r.piezas[0].pieTablar).toBeCloseTo(26.67, 1);
    expect(r.valor).toBeCloseTo(34.67 * 3.5, 0);
  });

  it("congela el valor con el precio del momento", () => {
    const r = construirRegistro({ nombre: "x", piezas, precioPt: 4 });
    const esperado = Math.round(r.totales.pieTablar * 4 * 100) / 100;
    expect(r.valor).toBe(esperado);
  });

  it("sin precio el valor es 0, no null ni NaN", () => {
    const r = construirRegistro({ nombre: "x", piezas });
    expect(r.precioPt).toBe(0);
    expect(r.valor).toBe(0);
  });

  it("normaliza medidas inválidas en vez de romper", () => {
    const r = construirRegistro({ nombre: "x", piezas: [{ cantidad: 0, espesor: -3, ancho: "8", largo: null }] });
    expect(r.piezas[0].cantidad).toBe(1);
    expect(r.piezas[0].espesor).toBe(1);
    expect(Number.isFinite(r.piezas[0].pieTablar)).toBe(true);
  });

  it("fecha por defecto = hoy; una fecha mal formada no se acepta", () => {
    const hoy = new Date().toISOString().slice(0, 10);
    expect(construirRegistro({ nombre: "x", piezas }).fecha).toBe(hoy);
    expect(construirRegistro({ nombre: "x", piezas, fecha: "ayer" }).fecha).toBe(hoy);
    expect(construirRegistro({ nombre: "x", piezas, fecha: "2026-03-15" }).fecha).toBe("2026-03-15");
  });

  it("respeta createdAt al actualizar (no se reescribe la historia)", () => {
    const original = "2026-01-02T10:00:00.000Z";
    const r = construirRegistro({ nombre: "x", piezas, createdAt: original });
    expect(r.createdAt).toBe(original);
    expect(r.updatedAt >= original).toBe(true);
  });
});

describe("totales y búsqueda", () => {
  it("totalesDe suma cantidades, PT y m³", () => {
    const t = totalesDe([
      { id: "a", cantidad: 2, espesor: 2, ancho: 8, largo: 10, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", pieTablar: 26.67, m3: 0.0629 },
      { id: "b", cantidad: 3, espesor: 2, ancho: 6, largo: 8, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", pieTablar: 24, m3: 0.0566 },
    ]);
    expect(t.piezas).toBe(5);
    expect(t.pieTablar).toBeCloseTo(50.67, 2);
  });

  it("el nombre sugerido lleva especie y cantidad", () => {
    expect(nombreSugerido("Tornillo", { piezas: 12, pieTablar: 100, m3: 1 })).toContain("Tornillo");
    expect(nombreSugerido(undefined, { piezas: 12, pieTablar: 100, m3: 1 })).toContain("12 pzas");
  });

  it("filtra por nombre, cliente, especie o fecha", () => {
    const base = { totales: { piezas: 1, pieTablar: 1, m3: 1 }, piezas: [], precioPt: 0, valor: 0, createdAt: "", updatedAt: "" };
    const lista = [
      { ...base, id: "1", nombre: "Lote A", fecha: "2026-03-01", cliente: "Maderera Sur", especie: "Tornillo" },
      { ...base, id: "2", nombre: "Lote B", fecha: "2026-04-10", cliente: "Don José", especie: "Cedro" },
    ] as CubicacionRegistro[];
    expect(filtrarCubicaciones(lista, "maderera").map((c) => c.id)).toEqual(["1"]);
    expect(filtrarCubicaciones(lista, "cedro").map((c) => c.id)).toEqual(["2"]);
    expect(filtrarCubicaciones(lista, "2026-04").map((c) => c.id)).toEqual(["2"]);
    expect(filtrarCubicaciones(lista, "")).toHaveLength(2);
  });
});
