/**
 * La procedencia «inventario de apertura» es texto libre haciendo de bandera
 * estructural. Eso es una deuda —lo correcto es una columna, y necesita ADR y
 * migración— pero mientras exista, tiene que existir UNA sola vez.
 *
 * Estaba copiada en cuatro lugares: el importador que la escribe y tres
 * componentes que la leían con su propio `observations?.startsWith("Inventario
 * de apertura")`. Cuatro copias del mismo literal es el patrón que en este repo
 * ya rompió cinco veces con la normalización de especies: se cambia una y las
 * otras dejan de reconocer lo que la primera escribe, sin error, sin aviso —
 * simplemente el badge deja de aparecer y nadie se entera de que ese paquete no
 * vino con guía.
 *
 * Y el predicado pasa de `startsWith` a `includes` por un motivo concreto:
 * `declararProduccion()` REEMPLAZA `observations` (bug ya documentado), y el
 * operador puede escribir adelante. Exigir que la marca abra la línea la hace
 * desaparecer con cualquier prefijo.
 */
import { describe, expect, it } from "vitest";

import {
  ORIGEN_INVENTARIO_APERTURA,
  ORIGEN_LOTE_INVENTARIO,
  esInventarioDeApertura,
} from "@/lib/forestal/lotes-aserrio";

describe("esInventarioDeApertura", () => {
  it("reconoce lo que escribe el importador, tal cual", () => {
    expect(esInventarioDeApertura(ORIGEN_INVENTARIO_APERTURA)).toBe(true);
    expect(esInventarioDeApertura("Inventario de apertura · Lote 15-2026 · Paquete S1 · PIEZAS · 0 pt")).toBe(true);
    expect(esInventarioDeApertura("Inventario de apertura · 12 trozas")).toBe(true);
  });

  it("sobrevive a que el operador escriba ANTES — el bug de `startsWith`", () => {
    const conPrefijo = `Revisado por Juan · ${ORIGEN_INVENTARIO_APERTURA} · Lote 15-2026`;
    expect(conPrefijo.startsWith(ORIGEN_INVENTARIO_APERTURA)).toBe(false); // lo que había
    expect(esInventarioDeApertura(conPrefijo)).toBe(true); // lo que hay
  });

  it("no marca lo que salió de la sierra hoy", () => {
    expect(esInventarioDeApertura(null)).toBe(false);
    expect(esInventarioDeApertura(undefined)).toBe(false);
    expect(esInventarioDeApertura("")).toBe(false);
    expect(esInventarioDeApertura("Corrida del lote 17-2026")).toBe(false);
  });

  it("no se confunde con el lote de inventario, que es otra cosa", () => {
    // Uno es «esto ya existía antes del libro»; el otro, «se declaró volumen sin
    // trozas reales». Se parecen en castellano y no significan lo mismo.
    expect(ORIGEN_INVENTARIO_APERTURA).not.toBe(ORIGEN_LOTE_INVENTARIO);
    expect(esInventarioDeApertura(ORIGEN_LOTE_INVENTARIO)).toBe(false);
  });
});
