/**
 * Formulario de la nota de crédito por motivo (F11/F12/F14, 17-10): cuánto lleva la nota según su
 * forma y las plantillas con versión. Puro: sin red ni base.
 */
import { describe, expect, it } from "vitest";
import { importeDeLaNota } from "@/components/admin/notas-credito/nc-importe";
import { guardarPlantilla, leerPlantillas, revisarPlantilla } from "@/components/admin/notas-credito/nc-plantillas";
import { REGLAS_VERSION } from "@/lib/notas-credito/motivos";
import type { LineaAjustable, RemanenteDocumento } from "@/lib/notas-credito/remanente";
import type { NCTemplate } from "@/components/admin/notas-credito/nc-compartido";

const rem = (disponibleConIgv: number, disponibleBase = Math.round((disponibleConIgv / 1.18) * 100) / 100): RemanenteDocumento => ({
  totalDocumento: 23.6, acreditadoConIgv: Math.round((23.6 - disponibleConIgv) * 100) / 100, disponibleConIgv, disponibleBase, notasActivas: 0,
});
const LINEAS: LineaAjustable[] = [
  { productId: 1, nombre: "Arroz", vendidas: 2, devueltasEnCaja: 0, precioLista: 6, precioCobrado: 5 },
  { productId: 2, nombre: "Aceite", vendidas: 1, devueltasEnCaja: 1, precioLista: 13.6, precioCobrado: 13.6 },
];
const base = { conDocumento: true, remanente: rem(23.6), lineas: LINEAS, cantidades: [] as number[], baseEscrita: "", tasa: 0.18 };

describe("importeDeLaNota", () => {
  it("sin motivo pide elegirlo", () => {
    expect(importeDeLaNota({ ...base, codigo: "" }).problema).toBe("Elige un motivo.");
  });

  it("01/02/06 sin documento no se pueden hacer", () => {
    const r = importeDeLaNota({ ...base, codigo: "06", conDocumento: false, remanente: null });
    expect(r.cuerpo).toBeNull();
    expect(r.problema).toMatch(/va por todo el documento/);
  });

  it("01 va exactamente por lo que queda, con IGV", () => {
    const r = importeDeLaNota({ ...base, codigo: "01", remanente: rem(15.34) });
    expect(r.problema).toBeNull();
    expect(r.cuerpo).toEqual({ totalConIgv: 15.34 });
    expect(r.desglose.total).toBe(15.34);
    expect(Math.round((r.desglose.monto + r.desglose.igv) * 100) / 100).toBe(15.34);
  });

  it("mientras lee lo que queda no deja seguir; si falló, dice por qué", () => {
    expect(importeDeLaNota({ ...base, codigo: "07", remanente: null }).problema).toMatch(/Leyendo/);
    expect(importeDeLaNota({ ...base, codigo: "07", remanente: null, errorDocumento: "Sin conexión" }).problema).toBe("Sin conexión");
  });

  it("un documento acreditado entero no admite otra nota", () => {
    expect(importeDeLaNota({ ...base, codigo: "09", remanente: rem(0, 0), baseEscrita: "1" }).problema).toMatch(/acreditado entero/);
  });

  it("07 suma unidades × precio cobrado de verdad, no el de lista", () => {
    const r = importeDeLaNota({ ...base, codigo: "07", cantidades: [1, 0] });
    expect(r.forma).toBe("lineas");
    expect(r.cuerpo).toEqual({ totalConIgv: 5 });
  });

  it("07 nunca pasa lo que queda aunque se marquen más unidades", () => {
    const r = importeDeLaNota({ ...base, codigo: "07", remanente: rem(8), cantidades: [2, 0] });
    expect(r.cuerpo).toEqual({ totalConIgv: 8 });
  });

  it("07 sin unidades pide elegir; 03 pide los productos que se corrigen", () => {
    expect(importeDeLaNota({ ...base, codigo: "07", cantidades: [0, 0] }).problema).toBe("Elige al menos una unidad.");
    expect(importeDeLaNota({ ...base, codigo: "03", cantidades: [] }).problema).toBe("Elige los productos que se corrigen.");
  });

  it("07 sin documento pasa a importe escrito", () => {
    const r = importeDeLaNota({ ...base, codigo: "07", conDocumento: false, remanente: null, baseEscrita: "10" });
    expect(r.forma).toBe("importe");
    expect(r.cuerpo).toEqual({ monto: 10 });
    expect(r.desglose).toEqual({ monto: 10, igv: 1.8, total: 11.8 });
  });

  it("09 acepta la base con coma y manda la base", () => {
    const r = importeDeLaNota({ ...base, codigo: "09", baseEscrita: "10,50" });
    expect(r.problema).toBeNull();
    expect(r.cuerpo).toEqual({ monto: 10.5 });
  });

  it("09 por encima de la base que queda se frena con el tope a la vista", () => {
    const r = importeDeLaNota({ ...base, codigo: "09", baseEscrita: "25" });
    expect(r.cuerpo).toBeNull();
    expect(r.problema).toMatch(/hasta S\/ 20[.,]00 sin IGV/);
    expect(r.desglose.monto).toBe(25);
  });

  it("09 con algo que no es un número pide el importe", () => {
    expect(importeDeLaNota({ ...base, codigo: "09", baseEscrita: "abc" }).problema).toBe("Escribe el importe sin IGV.");
    expect(importeDeLaNota({ ...base, codigo: "09", baseEscrita: "0" }).problema).toBe("Escribe el importe sin IGV.");
  });

  it("si el IGV redondeado se pasa 1 céntimo, el total se cierra en lo que queda", () => {
    const r = importeDeLaNota({ ...base, codigo: "09", remanente: rem(11.79, 10), baseEscrita: "10" });
    expect(r.cuerpo).toEqual({ monto: 10 });
    expect(r.desglose).toEqual({ monto: 10, igv: 1.79, total: 11.79 });
  });
});

describe("plantillas de nota de crédito", () => {
  const AHORA = "2026-10-17T12:00:00.000Z";

  it("leerPlantillas ignora JSON roto y filas sin nombre o motivo", () => {
    expect(leerPlantillas(null)).toEqual([]);
    expect(leerPlantillas("{roto")).toEqual([]);
    expect(leerPlantillas(JSON.stringify([{ id: "a", name: "Ok", codigoMotivo: "09", descripcionMotivo: "x" }, { id: "b" }, null, 3]))).toHaveLength(1);
  });

  it("guardar una nueva: versión 1, alcance por motivo, reglas vigentes y sin monto", () => {
    const [t] = guardarPlantilla([], { name: " Vencido ", codigoMotivo: "06", descripcionMotivo: "Devolución total ", notasText: "  " }, AHORA, "id-1");
    expect(t).toEqual({ id: "id-1", version: 1, name: "Vencido", codigoMotivo: "06", descripcionMotivo: "Devolución total", alcance: "con-documento", actualizada: AHORA, reglas: REGLAS_VERSION });
    expect(Object.keys(t)).not.toContain("monto");
    const [u] = guardarPlantilla([], { name: "Rebaja", codigoMotivo: "09", descripcionMotivo: "Rebaja", notasText: "ok" }, AHORA, "id-2");
    expect(u.alcance).toBe("cualquiera");
    expect(u.notasText).toBe("ok");
  });

  it("el mismo nombre (sin mirar mayúsculas) reemplaza y sube de versión con el mismo id", () => {
    const una = guardarPlantilla([], { name: "Rebaja", codigoMotivo: "09", descripcionMotivo: "A", notasText: "" }, AHORA, "id-1");
    const dos = guardarPlantilla(una, { name: "REBAJA", codigoMotivo: "04", descripcionMotivo: "B", notasText: "" }, AHORA, "id-2");
    expect(dos).toHaveLength(1);
    expect(dos[0]).toMatchObject({ id: "id-1", version: 2, codigoMotivo: "04", descripcionMotivo: "B" });
  });

  it("revisarPlantilla bloquea motivos fuera del catálogo y los que piden documento sin él", () => {
    const t = (p: Partial<NCTemplate>): NCTemplate => ({ id: "x", name: "n", codigoMotivo: "09", descripcionMotivo: "d", reglas: REGLAS_VERSION, ...p });
    expect(revisarPlantilla(t({ codigoMotivo: "99" }), true).bloquea).toMatch(/no está en el catálogo/);
    expect(revisarPlantilla(t({ codigoMotivo: "01" }), false).bloquea).toMatch(/Pide el documento/);
    expect(revisarPlantilla(t({ codigoMotivo: "01" }), true)).toEqual({ bloquea: null, aviso: null });
    expect(revisarPlantilla(t({ reglas: undefined }), false).aviso).toMatch(/antes de las reglas/);
  });
});
