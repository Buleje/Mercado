/**
 * Tiempo de la vista de tienda (18-10): la preferencia del navegador del
 * superadmin se sanea al leerla (lo que no sea un entero 5..60 → 10) y avisa a
 * los selectores de la misma pestaña al guardarla.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { minutosDeSuplantacion, OPCIONES_MINUTOS_SUPLANTACION } from "@/lib/auth/suplantacion";
import {
  CLAVE_MINUTOS_VISTA,
  EVENTO_MINUTOS_VISTA,
  guardarMinutosVistaTienda,
  leerMinutosVistaTienda,
} from "@/lib/auth/suplantacion-vista";

beforeEach(() => localStorage.clear());

describe("minutosDeSuplantacion", () => {
  it.each([
    [5, 5], [60, 60], [30, 30], ["45", 45],
    [4, 10], [61, 10], [0, 10], [7.5, 10], ["abc", 10], ["", 10], [null, 10], [undefined, 10], [Number.NaN, 10],
  ])("%s → %s", (entrada, esperado) => {
    expect(minutosDeSuplantacion(entrada)).toBe(esperado);
  });

  it("todas las opciones de la UI son válidas", () => {
    for (const m of OPCIONES_MINUTOS_SUPLANTACION) expect(minutosDeSuplantacion(m)).toBe(m);
  });
});

describe("preferencia en localStorage", () => {
  it("sin nada guardado → 10", () => {
    expect(leerMinutosVistaTienda()).toBe(10);
  });

  it("guardar 30 → se lee 30 y avisa a la pestaña", () => {
    const oyente = vi.fn();
    window.addEventListener(EVENTO_MINUTOS_VISTA, oyente);
    guardarMinutosVistaTienda(30);
    window.removeEventListener(EVENTO_MINUTOS_VISTA, oyente);
    expect(localStorage.getItem(CLAVE_MINUTOS_VISTA)).toBe("30");
    expect(leerMinutosVistaTienda()).toBe(30);
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it("un valor tocado a mano fuera de rango → 10", () => {
    localStorage.setItem(CLAVE_MINUTOS_VISTA, "999");
    expect(leerMinutosVistaTienda()).toBe(10);
  });
});
