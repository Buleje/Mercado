import { describe, expect, it } from "vitest";
import { esMotosierristaNuevo, opcionesMotosierrista } from "@/lib/forestal/loth-motosierrista";

describe("opcionesMotosierrista", () => {
  const ops = opcionesMotosierrista({
    personal: [{ nombre: "Juan Pérez", puesto: { nombre: "Motosierrista" } }, { nombre: "Ana Ríos", puesto: null }],
    usados: ["juan  perez", "Tercero Soto"],
    directorio: [
      { nombre: "Lucho Vela", docTipo: "DNI" },
      { nombre: "Maderas SAC", docTipo: "RUC" },
      { nombre: "Baja Ruiz", docTipo: "DNI", activo: false },
      { nombre: "TERCERO SOTO", docTipo: "DNI" },
    ],
  });

  it("personal primero, luego el libro y el Directorio (sólo personas activas con DNI), sin repetir", () => {
    expect(ops).toEqual([
      { nombre: "Juan Pérez", nota: "Motosierrista" },
      { nombre: "Ana Ríos", nota: "Tu personal" },
      { nombre: "Tercero Soto", nota: "Ya está en el libro" },
      { nombre: "Lucho Vela", nota: "Directorio" },
    ]);
  });

  it("un nombre que no está en ninguna lista es nuevo; tildes y espacios no cuentan", () => {
    expect(esMotosierristaNuevo("juan perez", ops)).toBe(false);
    expect(esMotosierristaNuevo("  ", ops)).toBe(false);
    expect(esMotosierristaNuevo("Pedro Nuevo", ops)).toBe(true);
  });
});
