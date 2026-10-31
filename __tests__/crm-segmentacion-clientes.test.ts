/**
 * La segmentación de clientes estaba muerta y no fallaba nada.
 *
 * `_orderCount` y `_lastOrder` decían en el tipo «Populated client-side from
 * /orders» y NADIE los llenaba: la carga sólo pedía /api/customers. Con los dos
 * en `undefined`, `inferSegment` corta en su primera línea y devuelve «nuevo»
 * para todo el mundo.
 *
 * Medido 2026-09-06 en el tenant demo (10 clientes, 25 pedidos, 15 ventas):
 *
 *            antes    después
 *   Activos    0        10
 *   Nuevos    10         0
 *   Frecuente  0         5
 *   Ocasional  0         5
 *
 * Ningún error en consola, ningún dato faltante: sólo cuatro cifras que
 * mentían. Estos casos fijan que la clasificación dependa de compras reales.
 */

import { describe, it, expect } from "vitest";
import { inferSegment } from "@/components/admin/CRMTab";

const hace = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString();
const cliente = (over: Record<string, unknown> = {}) =>
  ({ phone: "987100001", name: "Cliente", ...over }) as Parameters<typeof inferSegment>[0];

describe("inferSegment", () => {
  it("sin compras es «nuevo»", () => {
    expect(inferSegment(cliente({ _orderCount: 0 }))).toBe("nuevo");
  });

  it("con 5 compras o más es «frecuente»", () => {
    expect(inferSegment(cliente({ _orderCount: 5, _lastOrder: hace(3) }))).toBe("frecuente");
    expect(inferSegment(cliente({ _orderCount: 12, _lastOrder: hace(1) }))).toBe("frecuente");
  });

  it("con 2 a 4 compras es «ocasional»", () => {
    expect(inferSegment(cliente({ _orderCount: 2, _lastOrder: hace(5) }))).toBe("ocasional");
    expect(inferSegment(cliente({ _orderCount: 4, _lastOrder: hace(5) }))).toBe("ocasional");
  });

  it("sin comprar hace más de 90 días es «perdido», por más que compraba seguido", () => {
    expect(inferSegment(cliente({ _orderCount: 20, _lastOrder: hace(120) }))).toBe("perdido");
  });

  it("EL BUG: sin los campos poblados, todos caen en «nuevo»", () => {
    // Así llegaba cada cliente antes del fix — de ahí «Nuevos 10, resto 0».
    const sinPoblar = cliente({});
    expect(inferSegment(sinPoblar)).toBe("nuevo");
    // Y el mismo cliente, con sus compras cargadas, ya no lo es.
    expect(inferSegment(cliente({ _orderCount: 7, _lastOrder: hace(2) }))).toBe("frecuente");
  });
});

describe("activos de los últimos 30 días", () => {
  /** El criterio de la tarjeta «Activos (30d)». */
  const esActivo = (c: { _lastOrder?: string | null }) =>
    !!c._lastOrder && new Date(c._lastOrder).getTime() > Date.now() - 30 * 86400000;

  it("compró hace 3 días: activo", () => {
    expect(esActivo({ _lastOrder: hace(3) })).toBe(true);
  });

  it("compró hace 45 días: no", () => {
    expect(esActivo({ _lastOrder: hace(45) })).toBe(false);
  });

  it("sin fecha de última compra: no (el estado que daba 0 para todos)", () => {
    expect(esActivo({})).toBe(false);
    expect(esActivo({ _lastOrder: null })).toBe(false);
  });
});
