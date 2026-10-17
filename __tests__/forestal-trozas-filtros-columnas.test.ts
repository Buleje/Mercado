import { describe, expect, it } from "vitest";
import { aplicarFacetas } from "@/lib/admin/filtros-columna";
import {
  alternarOrden, coincideCodigo, columnasTrozas, ordenarTrozas, presetDeOrden, ORDEN_PRESETS,
} from "@/components/admin/forestal/ctp-trozas-filtros-columnas";
import type { TrozaPatioAPI } from "@/components/admin/forestal/hooks/use-trozas-patio";

const hoy = new Date("2026-10-05T12:00:00Z");
const t = (id: string, o: Partial<TrozaPatioAPI>) =>
  ({ id, codificacion: id, especieComun: "Cachimbo", volumenM3: 1, largoM: 3, gtfNumber: "G1", ...o }) as TrozaPatioAPI;

describe("filtros de columna del patio", () => {
  const filas = [t("A-1", { d1Cm: 60, d2Cm: 58 }), t("B-2", { d1Cm: 40, d2Cm: 38, largoM: 5 }), t("C-3", {})];
  const cols = columnasTrozas(hoy);

  it("D1 ≥ 60: la pieza sin D1 no entra en un rango pedido", () => {
    const r = aplicarFacetas(filas, cols, { d1: { min: 60, max: null } });
    expect(r.map((x) => x.id)).toEqual(["A-1"]);
  });
  it("AND entre columnas, OR adentro", () => {
    const r = aplicarFacetas(filas, cols, { largo: { min: 4, max: null }, especie: ["Cachimbo", "Tornillo"] });
    expect(r.map((x) => x.id)).toEqual(["B-2"]);
  });
  it("código contiene, sin tildes ni mayúsculas", () => {
    expect(coincideCodigo(filas[1], "b-")).toBe(true);
    expect(coincideCodigo(filas[1], "zz")).toBe(false);
    expect(coincideCodigo(filas[1], "  ")).toBe(true);
  });
  it("ordena con los vacíos al final, suba o baje", () => {
    const asc = ordenarTrozas(filas, { by: "d1", dir: "asc" }, hoy).map((x) => x.id);
    const desc = ordenarTrozas(filas, { by: "d1", dir: "desc" }, hoy).map((x) => x.id);
    expect(asc).toEqual(["B-2", "A-1", "C-3"]);
    expect(desc).toEqual(["A-1", "B-2", "C-3"]);
  });
  it("el select y el clic comparten un estado", () => {
    expect(presetDeOrden(ORDEN_PRESETS.volumen)).toBe("volumen");
    expect(presetDeOrden({ by: "d1", dir: "asc" })).toBe("columna");
    expect(alternarOrden({ by: "d1", dir: "asc" }, "d1").dir).toBe("desc");
    expect(alternarOrden({ by: "d1", dir: "desc" }, "largo")).toEqual({ by: "largo", dir: "asc" });
  });
});
