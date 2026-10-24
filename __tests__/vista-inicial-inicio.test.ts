import { describe, expect, it } from "vitest";
import { periodoSinVentas, vistaInicialDelInicio } from "@/lib/admin/vista-inicial-inicio";

const base = { vistaActual: "general", vistaEnUrl: false, eligioAMano: false, tieneForestal: true, ventas: "sin" as const };

describe("vistaInicialDelInicio", () => {
  it("forestal sin ventas abre Forestal", () => {
    expect(vistaInicialDelInicio(base)).toBe("forestal");
  });
  it("bodega (sin libros forestales) se queda en Resumen", () => {
    expect(vistaInicialDelInicio({ ...base, tieneForestal: false })).toBeNull();
  });
  it("forestal CON ventas se queda en Resumen", () => {
    expect(vistaInicialDelInicio({ ...base, ventas: "con" })).toBeNull();
  });
  it("sin saber las ventas todavía, no mueve nada", () => {
    expect(vistaInicialDelInicio({ ...base, ventas: "desconocido" })).toBeNull();
  });
  it("lo elegido a mano manda (click o ?vista=)", () => {
    expect(vistaInicialDelInicio({ ...base, eligioAMano: true })).toBeNull();
    expect(vistaInicialDelInicio({ ...base, vistaEnUrl: true })).toBeNull();
  });
  it("si ya está en otra pestaña no la toca", () => {
    expect(vistaInicialDelInicio({ ...base, vistaActual: "caja" })).toBeNull();
  });
});

describe("periodoSinVentas", () => {
  it("sin pedidos ni importe", () => {
    expect(periodoSinVentas(0, 0)).toBe(true);
    expect(periodoSinVentas(undefined, undefined)).toBe(true);
  });
  it("con pedidos o importe", () => {
    expect(periodoSinVentas(10, 0)).toBe(false);
    expect(periodoSinVentas(0, 2)).toBe(false);
  });
});
