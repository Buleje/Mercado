import { describe, it, expect } from "vitest";
import { totalesOC } from "@/lib/compras/totales-oc";
import {
  opcionesDeEstado,
  transicionValida,
  generaCuentaPorPagar,
  TRANSICIONES_OC,
} from "@/lib/compras/estados-oc";
import { saldoPendiente, estaCompleta } from "@/lib/compras/recibido-acumulado";

/**
 * Blinda los defectos medidos el 2026-08-11 sobre el tenant `main`. Los tres
 * pasaban `tsc`, `eslint` y la suite en verde: eran errores de semántica de
 * datos, invisibles para el tipo.
 */

describe("totales de la orden — el papel dice lo que dice la orden", () => {
  it("no le suma IGV encima al total (bug: S/160.80 se imprimía S/189.74)", () => {
    const t = totalesOC({
      items: [{ quantity: 8, unitCost: 20.1 }],
      total: 160.8,
    });
    expect(t.total).toBeCloseTo(160.8, 2);
    expect(t.baseImponible + t.igvContenido).toBeCloseTo(t.total, 2);
  });

  it("respeta el descuento pactado (bug: 5% ignorado, S/370.50 se imprimía S/460.20)", () => {
    const t = totalesOC({
      items: [{ quantity: 20, unitCost: 19.5 }],
      total: 370.5,
      discount: 5,
    });
    expect(t.subtotalBruto).toBeCloseTo(390, 2);
    expect(t.total).toBeCloseTo(370.5, 2);
    expect(t.descuentoMonto).toBeCloseTo(19.5, 2);
  });

  it("el total manda sobre lo que el cliente recalcule", () => {
    // Si el backend guardó otro total (redondeo, ajuste manual), gana el suyo.
    const t = totalesOC({ items: [{ quantity: 1, unitCost: 100 }], total: 95 });
    expect(t.total).toBe(95);
  });

  it("deriva el total cuando la orden todavía se está armando en pantalla", () => {
    const t = totalesOC({ items: [{ quantity: 2, unitCost: 50 }], total: null, discount: 10 });
    expect(t.total).toBeCloseTo(90, 2);
  });

  it("nunca devuelve NaN aunque los costos vengan sucios", () => {
    const t = totalesOC({
      items: [{ quantity: 3, unitCost: "no-es-un-numero" }],
      total: undefined,
    });
    expect(Object.values(t).every((v) => Number.isFinite(v))).toBe(true);
  });

  it("un total negativo se piso en 0, no se imprime en rojo al proveedor", () => {
    const t = totalesOC({ items: [{ quantity: 1, unitCost: 10 }], total: -5 });
    expect(t.total).toBe(0);
  });
});

describe("estados de la orden — el select ofrece sólo lo que el servidor acepta", () => {
  it("desde pendiente se puede recibir (bug: devolvía 422 por la ruta a 'emitida')", () => {
    expect(transicionValida("pendiente", "recibido")).toBe(true);
    expect(transicionValida("pendiente", "parcial")).toBe(true);
    expect(transicionValida("pendiente", "cancelado")).toBe(true);
  });

  it("no existen destinos fuera del enum de la base", () => {
    const validos = new Set(["pendiente", "parcial", "recibido", "cancelado", "auto_generated"]);
    for (const destinos of Object.values(TRANSICIONES_OC)) {
      for (const d of destinos) expect(validos.has(d)).toBe(true);
    }
  });

  it("una orden recibida ya no se reabre por el desplegable", () => {
    expect(opcionesDeEstado("recibido")).toEqual(["recibido"]);
    expect(transicionValida("recibido", "pendiente")).toBe(false);
  });

  it("el select nunca ofrece un estado que el servidor rechazaría", () => {
    for (const actual of ["pendiente", "parcial", "recibido", "cancelado", "auto_generated"]) {
      for (const ofrecido of opcionesDeEstado(actual)) {
        expect(transicionValida(actual, ofrecido)).toBe(true);
      }
    }
  });

  it("sólo el crédito abre una cuenta por pagar", () => {
    expect(generaCuentaPorPagar("contado")).toBe(false);
    expect(generaCuentaPorPagar("transferencia")).toBe(false);
    expect(generaCuentaPorPagar("credito_30")).toBe(true);
  });
});

describe("recepción acumulada — no se cuenta dos veces la misma mercadería", () => {
  it("el saldo descuenta lo ya recibido (bug: OC de 10 con 4 recibidos daba stock 14)", () => {
    expect(saldoPendiente(10, 4)).toBe(6);
  });

  it("recibir de más no resta stock", () => {
    expect(saldoPendiente(10, 12)).toBe(0);
  });

  it("dos tandas que suman lo pedido cierran la orden (bug: quedaba parcial para siempre)", () => {
    const items = [{ productId: 1, quantity: 10 }];
    expect(estaCompleta(items, new Map([[1, 4]]))).toBe(false);
    expect(estaCompleta(items, new Map([[1, 10]]))).toBe(true);
  });

  it("un producto sin recibir deja la orden abierta aunque los otros estén completos", () => {
    const items = [
      { productId: 1, quantity: 10 },
      { productId: 2, quantity: 5 },
    ];
    expect(estaCompleta(items, new Map([[1, 10]]))).toBe(false);
    expect(estaCompleta(items, new Map([[1, 10], [2, 5]]))).toBe(true);
  });
});
