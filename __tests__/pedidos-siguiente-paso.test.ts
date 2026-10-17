/**
 * Siguiente paso, responsable y plata de un pedido
 * (`components/admin/OrdersTab/siguiente-paso.ts`): la tarjeta del tablero, la
 * Lista y el detalle leen de acá. Fija que el paso nombra la transición que ya
 * permite el servidor y que la plata dice lo que falta cobrar con su monto.
 */
import { describe, expect, it } from "vitest";
import type { DbOrder } from "@/lib/jsondb";
import { formatCurrency } from "@/lib/format";
import { transicionesDesde } from "@/lib/order-status";
import {
  cobroDe,
  loQueFalta,
  responsableDe,
  siguientePaso,
} from "@/components/admin/OrdersTab/siguiente-paso";

const pedido = (extra: Partial<DbOrder> = {}): DbOrder => ({
  id: "cm0000000000000000abc123",
  customer: { name: "Rosa", phone: "987654321", location: "-8.38,-74.55", reference: "" },
  items: [],
  total: 42.5,
  status: "pendiente",
  paymentMethod: "efectivo",
  createdAt: "2026-10-16T15:00:00.000Z",
  updatedAt: "2026-10-16T15:00:00.000Z",
  ...extra,
});

describe("siguientePaso", () => {
  it("cada paso es una transición que el servidor acepta", () => {
    for (const status of ["pendiente", "confirmado", "preparando", "en_camino"] as const) {
      const paso = siguientePaso(pedido({ status }));
      expect(paso).not.toBeNull();
      expect(transicionesDesde(status)).toContain(paso!.a);
    }
  });

  it("entregado y cancelado no tienen paso", () => {
    expect(siguientePaso(pedido({ status: "entregado" }))).toBeNull();
    expect(siguientePaso(pedido({ status: "cancelado" }))).toBeNull();
  });

  it("pendiente con Yape pide verificar el pago y cita el Nº de operación", () => {
    const paso = siguientePaso(pedido({ paymentMethod: "yape", yapeOperationNumber: "778899" }));
    expect(paso?.verificaYape).toBe(true);
    expect(paso?.corto).toBe("Confirmar Yape");
    expect(paso?.ayuda).toContain("778899");
  });

  it("preparando nombra al repartidor si hay, o pide asignarlo", () => {
    expect(siguientePaso(pedido({ status: "preparando", riderName: "Luis" }))?.ayuda).toContain("Lo lleva Luis");
    expect(siguientePaso(pedido({ status: "preparando" }))?.ayuda).toContain("Asigna un repartidor");
  });

  it("en camino con efectivo por cobrar recuerda el monto", () => {
    const paso = siguientePaso(pedido({ status: "en_camino", deuda: true }));
    expect(paso?.ayuda).toContain(`Cobra ${formatCurrency(42.5)} al entregar`);
  });
});

describe("responsableDe", () => {
  it("lee riderName, la columna que guarda el servidor", () => {
    expect(responsableDe(pedido({ riderName: "  Luis " }))).toBe("Luis");
  });
  it("cae al nombre viejo y devuelve null si no hay nadie", () => {
    expect(responsableDe({ ...pedido(), deliveryDriver: "Ana" } as DbOrder)).toBe("Ana");
    expect(responsableDe(pedido({ riderName: "" }))).toBeNull();
  });
});

describe("cobroDe", () => {
  it("efectivo por cobrar en marcha → monto a cobrar", () => {
    expect(cobroDe(pedido({ deuda: true }))).toEqual({
      texto: `Cobrar ${formatCurrency(42.5)} al entregar`,
      tono: "aviso",
    });
  });
  it("entregado sin cobrar → debe", () => {
    expect(cobroDe(pedido({ status: "entregado", deuda: true })).tono).toBe("peligro");
  });
  it("efectivo cobrado → ok; sin marca → neutro", () => {
    expect(cobroDe(pedido({ deuda: false })).tono).toBe("ok");
    expect(cobroDe(pedido()).texto).toBe("Efectivo al entregar");
  });
  it("Yape pendiente por verificar; confirmado después", () => {
    expect(cobroDe(pedido({ paymentMethod: "yape" })).texto).toBe("Yape por verificar");
    expect(cobroDe(pedido({ paymentMethod: "yape", status: "preparando" })).tono).toBe("ok");
  });
  it("cancelado no se cobra", () => {
    expect(cobroDe(pedido({ status: "cancelado", deuda: true })).texto).toBe("Sin cobro");
  });
});

describe("loQueFalta", () => {
  it("nada si tiene teléfono y dirección", () => {
    expect(loQueFalta(pedido())).toEqual([]);
  });
  it("sin teléfono ni dirección, y en camino sin repartidor", () => {
    const o = pedido({ status: "en_camino", customer: { name: "X", location: "", reference: "" } });
    expect(loQueFalta(o)).toEqual(["teléfono", "dirección", "repartidor"]);
  });
  it("los archivados no piden nada", () => {
    expect(loQueFalta(pedido({ status: "entregado", customer: { name: "X", location: "", reference: "" } }))).toEqual([]);
  });
});
