/**
 * El efectivo de una venta mixta tiene que llegar a la caja.
 *
 * Bug medido el 2026-08-12: con dos formas de pago el POS manda
 * `payment: "MIXTO"` y `/api/sales` registraba UN movimiento con ese método y
 * el total. El arqueo suma sólo `method === "efectivo"` (lib/db/sales.db.ts:293),
 * así que la venta aportaba S/0 al esperado y el efectivo real del cajón salía
 * como sobrante al cerrar el día.
 */

import { describe, expect, it } from "vitest";
import { desglosarPago, efectivoDe } from "@/lib/caja/desglosar-pago";

const mixto = (pagos: Array<{ method: string; amount: number }>) => JSON.stringify(pagos);

describe("desglosarPago", () => {
  it("un pago simple queda igual que siempre", () => {
    expect(desglosarPago("efectivo", null, 60)).toEqual([{ method: "efectivo", amount: 60 }]);
    expect(desglosarPago("yape", null, 25.5)).toEqual([{ method: "yape", amount: 25.5 }]);
  });

  it("sin método declarado asume efectivo (el default del mostrador)", () => {
    expect(desglosarPago(undefined, null, 10)).toEqual([{ method: "efectivo", amount: 10 }]);
  });

  it("MIXTO se abre en una línea por medio", () => {
    const lineas = desglosarPago("MIXTO", mixto([
      { method: "efectivo", amount: 60 },
      { method: "yape", amount: 40 },
    ]), 100);
    expect(lineas).toEqual([
      { method: "efectivo", amount: 60 },
      { method: "yape", amount: 40 },
    ]);
    // Lo que importa: el arqueo ahora ve los S/60 que están en el cajón.
    expect(efectivoDe(lineas)).toBe(60);
  });

  it("antes del fix esa misma venta aportaba 0 al esperado", () => {
    // Comportamiento viejo: una sola línea con el método agregado.
    expect(efectivoDe([{ method: "MIXTO", amount: 100 }])).toBe(0);
    // Ahora:
    expect(efectivoDe(desglosarPago("MIXTO", mixto([
      { method: "efectivo", amount: 60 },
      { method: "yape", amount: 40 },
    ]), 100))).toBe(60);
  });

  it("el vuelto sale del efectivo, no de Yape", () => {
    // Paga S/100 en billetes + S/40 Yape por una compra de S/120: vuelto S/20.
    const lineas = desglosarPago("MIXTO", mixto([
      { method: "efectivo", amount: 100 },
      { method: "yape", amount: 40 },
    ]), 120);
    expect(efectivoDe(lineas)).toBe(80);
    expect(lineas.find(l => l.method === "yape")?.amount).toBe(40);
  });

  it("un desglose ilegible no inventa cuánto fue en efectivo", () => {
    expect(desglosarPago("MIXTO", "{no es json", 100)).toEqual([{ method: "MIXTO", amount: 100 }]);
    expect(desglosarPago("MIXTO", "[]", 100)).toEqual([{ method: "MIXTO", amount: 100 }]);
    expect(desglosarPago("MIXTO", null, 100)).toEqual([{ method: "MIXTO", amount: 100 }]);
  });

  it("descarta líneas sin método o en cero, sin romper el resto", () => {
    const lineas = desglosarPago("MIXTO", mixto([
      { method: "efectivo", amount: 50 },
      { method: "", amount: 30 },
      { method: "tarjeta", amount: 0 },
    ]), 50);
    expect(lineas).toEqual([{ method: "efectivo", amount: 50 }]);
  });

  it("una venta al fiado no mete plata al cajón", () => {
    expect(efectivoDe(desglosarPago("fiado", null, 80))).toBe(0);
  });
});
