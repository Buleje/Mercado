/**
 * Días sin movimiento en Productos › Rotación (25-10). La pantalla recibe los
 * últimos 200 movimientos: con la lista cortada, un producto que no aparece en
 * ella NO «nunca se movió» — sólo no se movió desde el más viejo cargado.
 */
import { describe, expect, it } from "vitest";
import { TOPE_MOVIMIENTOS, diasDesdeUltimoMovimiento, horizonteDeMovimientos } from "@/components/admin/inventario/inventory-helpers";
import type { DbInventoryMovement } from "@/lib/jsondb";

const AHORA = Date.parse("2026-10-25T17:00:00Z");
const mov = (productId: number, iso: string) => ({ productId, createdAt: iso, type: "venta", quantity: 1 }) as unknown as DbInventoryMovement;

describe("diasDesdeUltimoMovimiento", () => {
  it("cuenta desde el más nuevo del producto", () => {
    const m = [mov(1, "2026-10-01T10:00:00Z"), mov(1, "2026-10-20T10:00:00Z"), mov(2, "2026-10-24T10:00:00Z")];
    expect(diasDesdeUltimoMovimiento(1, m, AHORA)).toBe(5);
  });
  it("sin movimientos del producto = null", () => {
    expect(diasDesdeUltimoMovimiento(9, [mov(1, "2026-10-20T10:00:00Z")], AHORA)).toBeNull();
  });
});

describe("horizonteDeMovimientos", () => {
  it("lista entera (menos del tope): no hay horizonte, «nunca» es cierto", () => {
    expect(horizonteDeMovimientos([mov(1, "2026-10-20T10:00:00Z")])).toBeNull();
  });
  it("lista cortada en el tope: el horizonte es el más viejo cargado", () => {
    const m = Array.from({ length: TOPE_MOVIMIENTOS }, (_, i) => mov(1, new Date(Date.parse("2026-09-01T12:00:00Z") + i * 3_600_000).toISOString()));
    expect(horizonteDeMovimientos(m)).toBe("2026-09-01T12:00:00.000Z");
  });
});
