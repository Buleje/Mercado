import { describe, expect, it } from "vitest";
import { cuerpoParaEnviar, encolarVenta, esDelNegocio, filasDeCola, type VentaEnCola } from "@/components/admin/pos/cola-offline";

const venta = { items: [{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 1 }], payment: "yape", amountPaid: 12 };

describe("cola del POS sin conexión (M59)", () => {
  it("la clave del primer intento se conserva al encolar: reintentar no crea otra venta", () => {
    const cola = encolarVenta([], { ...venta, idempotencyKey: "k-1" }, { tenant: "main", total: 12, ahora: 1_000 });
    expect(cola[0].idempotencyKey).toBe("k-1");
    // El mismo cobro encolado dos veces (doble catch) no se duplica.
    expect(encolarVenta(cola, { ...venta, idempotencyKey: "k-1" }, { tenant: "main" })).toHaveLength(1);
    // Sin clave previa nace una.
    expect(encolarVenta([], venta, { tenant: "main" })[0].idempotencyKey).toMatch(/.{8,}/);
  });

  it("al servidor va la venta con su clave y sin las marcas de la cola", () => {
    const [v] = encolarVenta([], { ...venta, idempotencyKey: "k-1" }, { tenant: "main", total: 12, ahora: 1_000 });
    const cuerpo = cuerpoParaEnviar({ ...v, _hasError: true, _errorMessage: "x" });
    expect(cuerpo).toEqual({ ...venta, idempotencyKey: "k-1" });
  });

  it("cada venta se manda sólo con su negocio; las viejas sin negocio, como antes", () => {
    const deMain = { _offlineId: 1, _synced: false, _tenant: "main" } as VentaEnCola;
    const vieja = { _offlineId: 2, _synced: false } as VentaEnCola;
    expect(esDelNegocio(deMain, "main")).toBe(true);
    expect(esDelNegocio(deMain, "blas")).toBe(false);
    expect(esDelNegocio(vieja, "blas")).toBe(true);
  });

  it("filas: hora, total que vio el cajero, productos, medio y estado (pendiente, no pasó, de otro negocio)", () => {
    const cola: VentaEnCola[] = [
      ...encolarVenta([], { ...venta, idempotencyKey: "a" }, { tenant: "main", total: 12, ahora: Date.parse("2026-10-17T15:00:00Z") }),
      { ...venta, idempotencyKey: "b", _offlineId: 2, _synced: false, _tenant: "main", _hasError: true, _errorMessage: "Stock insuficiente" },
      { ...venta, idempotencyKey: "c", _offlineId: 3, _synced: false, _tenant: "blas" },
    ];
    const filas = filasDeCola(cola, "main");
    expect(filas.map((f) => [f.clave, f.estado, f.error])).toEqual([
      ["a", "pendiente", null],
      ["b", "no-paso", "Stock insuficiente"],
      ["c", "otro-negocio", null],
    ]);
    expect(filas[0]).toMatchObject({ total: 12, productos: 2, medio: "yape" });
    expect(filas[1].total).toBeNull();
  });
});
