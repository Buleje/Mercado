import { describe, expect, it } from "vitest";
import {
  FILTRO_REQUIERE_COSTO,
  FILTRO_REQUIERE_COSTO_SQL,
  duenoSugerido,
  esSinCosto,
  requiereCosto,
} from "@/lib/forestal/madera-de-servicio";

describe("requiereCosto / esSinCosto", () => {
  it("la madera de servicio nunca pide costo ni cuenta «sin costo»", () => {
    expect(requiereCosto({ maderaDeTercero: true, status: "validado" })).toBe(false);
    expect(esSinCosto({ maderaDeTercero: true, status: "validado", costoTotal: null })).toBe(false);
  });

  it("una compra sin costo sí cuenta; con 0 NO (0 es un valor, «gratis»)", () => {
    expect(esSinCosto({ maderaDeTercero: false, status: "validado", costoTotal: null })).toBe(true);
    expect(esSinCosto({ maderaDeTercero: false, status: "validado", costoTotal: 0 })).toBe(false);
    expect(esSinCosto({ maderaDeTercero: false, status: "procesado", costoTotal: undefined })).toBe(true);
  });

  it("anulado y rechazado no piden costo; sin status decide sólo la marca", () => {
    expect(requiereCosto({ maderaDeTercero: false, status: "anulado" })).toBe(false);
    expect(requiereCosto({ maderaDeTercero: false, status: "rechazado" })).toBe(false);
    expect(requiereCosto({})).toBe(true);
    expect(requiereCosto({ maderaDeTercero: null })).toBe(true);
  });

  it("los filtros dicen lo mismo que la función", () => {
    expect(FILTRO_REQUIERE_COSTO).toEqual({ maderaDeTercero: false });
    expect(FILTRO_REQUIERE_COSTO_SQL).toBe(`"maderaDeTercero" = false`);
  });
});

describe("duenoSugerido — sólo sugiere, desde el permiso", () => {
  const guia = (gtfNumber: string, maderaDeTercero: boolean, duenoParteId: string | null, duenoNombre: string | null) => ({
    gtfNumber,
    maderaDeTercero,
    duenoParteId,
    duenoNombre,
  });
  const corrida = (duenoMadera: string | null, duenoParteId: string | null, titularNombre: string | null) => ({
    duenoMadera,
    duenoParteId,
    titularNombre,
  });

  it("gana el dueño de otras guías del permiso ya marcadas de servicio", () => {
    const r = duenoSugerido(
      [guia("1", true, "w", "WASACO"), guia("2", true, "w", "WASACO"), guia("3", false, null, null)],
      [corrida("tercero", "w", "WASACO")],
    );
    expect(r).toMatchObject({ parteId: "w", nombre: "WASACO", guiasDeServicio: 2, corridasDeTercero: 1 });
    expect(r?.motivo).toContain("2 guías");
  });

  it("sin guías marcadas: las corridas de tercero, si son mayoría (caso Blas: 30 de WASACO)", () => {
    const corridas = Array.from({ length: 30 }, () => corrida("tercero", "w", "WASACO"));
    const r = duenoSugerido([], [...corridas, corrida("propia", null, null)]);
    expect(r).toMatchObject({ parteId: "w", nombre: "WASACO", guiasDeServicio: 0, corridasDeTercero: 30 });
  });

  it("una corrida de tercero entre muchas propias no hace de servicio al permiso", () => {
    const propias = Array.from({ length: 20 }, () => corrida("propia", null, null));
    expect(duenoSugerido([], [corrida("tercero", "w", "WASACO"), ...propias])).toBeNull();
  });

  it("sin ficha: agrupa por nombre normalizado y devuelve parteId null", () => {
    const r = duenoSugerido([], [corrida("tercero", null, "Wasaco"), corrida("tercero", null, "WASACO ")]);
    expect(r).toMatchObject({ parteId: null, corridasDeTercero: 2 });
  });

  it("nada que sugerir → null", () => {
    expect(duenoSugerido([], [])).toBeNull();
    expect(duenoSugerido([guia("1", false, null, null)], [corrida(null, null, null)])).toBeNull();
  });
});
