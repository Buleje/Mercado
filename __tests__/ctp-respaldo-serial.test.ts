/**
 * ADR-530 — la foto del libro vuelve con los MISMOS tipos y la huella no
 * depende del orden de lectura.
 */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  comprimir,
  conteosDe,
  descomprimir,
  hidratarValor,
  huellaDe,
  serializarFila,
  serializarValor,
} from "@/lib/forestal/ctp-respaldo-serial";

describe("serializar / hidratar", () => {
  it("Decimal, fecha, BigInt, Bytes y Json vuelven al mismo tipo", () => {
    const fecha = new Date("2026-10-12T15:30:00.000Z");
    const fila = serializarFila({
      id: "x",
      m3: new Decimal("12.3400"),
      fecha,
      grande: BigInt("12345678901234567890"),
      bytes: new Uint8Array([1, 2, 255]),
      json: { a: [1, { b: "c" }] },
      lista: ["a", "b"],
      nada: null,
      sinDefinir: undefined,
    });
    expect(fila).toMatchObject({ m3: { $d: "12.34" }, fecha: { $t: fecha.toISOString() }, grande: { $b: "12345678901234567890" }, lista: ["a", "b"], nada: null, sinDefinir: null });
    const vuelta = JSON.parse(JSON.stringify(fila)) as typeof fila;
    const h = { decimal: (s: string) => new Decimal(s) };
    expect((hidratarValor(vuelta.m3, h) as Decimal).equals(new Decimal("12.34"))).toBe(true);
    expect(hidratarValor(vuelta.fecha)).toEqual(fecha);
    expect(hidratarValor(vuelta.grande)).toBe(BigInt("12345678901234567890"));
    expect(hidratarValor(vuelta.bytes)).toEqual(new Uint8Array([1, 2, 255]));
    expect(hidratarValor(vuelta.json)).toEqual({ a: [1, { b: "c" }] });
    expect(serializarValor(Number.NaN)).toBeNull();
  });

  it("la huella no cambia con el orden de filas ni de columnas, y sí con un dato", () => {
    const a = huellaDe({ WoodEntry: [{ id: "1", g: "A", v: { $d: "1" } }, { id: "2", g: "B" }] });
    const b = huellaDe({ WoodEntry: [{ g: "B", id: "2" }, { v: { $d: "1" }, g: "A", id: "1" }] });
    const c = huellaDe({ WoodEntry: [{ id: "1", g: "A", v: { $d: "2" } }, { id: "2", g: "B" }] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("comprime y descomprime el contenido entero; cuenta vivas y de baja", () => {
    const tablas = { ForestCtpEntry: [{ id: "c1", status: "anulado", deletedAt: null }, { id: "c2", status: "registrado", deletedAt: null }] };
    const contenido = { version: 1, columnas: { ForestCtpEntry: ["id", "status", "deletedAt"] }, tablas };
    expect(descomprimir(comprimir(contenido))).toEqual(contenido);
    expect(conteosDe(tablas).ForestCtpEntry).toEqual({ total: 2, deBaja: 1 });
    expect(() => descomprimir(comprimir({ nada: 1 } as never))).toThrow(/ilegible/);
  });
});
