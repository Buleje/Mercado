import { describe, expect, it } from "vitest";
import { claveDeComprobante, excepcionesDeCompras, type DatosExcepciones, type OrdenConSeguimiento } from "@/lib/compras/excepciones-compras";

const HOY = "2026-10-17";
const SIN_SEGUIMIENTO = { recibido: {}, noLlegara: {}, recepciones: [], cuenta: null };

function orden(p: Partial<OrdenConSeguimiento> & { id: string }): OrdenConSeguimiento {
  return {
    supplierId: "p1",
    supplierName: "Distribuidora Ucayali",
    items: [{ productId: 1, name: "Leche Gloria 400g", quantity: 12, unitCost: 3.5 }],
    total: 42,
    status: "recibido",
    createdAt: "2026-10-05T15:00:00.000Z",
    seguimiento: SIN_SEGUIMIENTO,
    ...p,
  };
}

const grupo = (d: DatosExcepciones, tipo: string) => excepcionesDeCompras(d, HOY).grupos.find((g) => g.tipo === tipo);

describe("bandeja «Revisar pendientes» (C64)", () => {
  it("costo faltante dice qué producto y quién pidió", () => {
    const d: DatosExcepciones = {
      ordenes: [orden({ id: "cmaaaaaaaa0001ucayal1", createdBy: "Ana", items: [{ productId: 1, name: "Atún Florida 170g", quantity: 4, unitCost: 0 }] })],
      cuentas: [],
      devoluciones: [],
    };
    const e = grupo(d, "costo-faltante")?.excepciones[0];
    expect(e?.diferencia).toContain("Atún Florida 170g");
    expect(e?.responsable).toBe("Pidió Ana");
  });

  it("la orden armada por la reposición automática lo dice", () => {
    const d: DatosExcepciones = { ordenes: [orden({ id: "auto-123", items: [{ productId: 1, name: "Leche", quantity: 1 }] })], cuentas: [], devoluciones: [] };
    expect(grupo(d, "costo-faltante")?.excepciones[0]?.responsable).toBe("La armó la reposición automática");
  });

  it("una orden cancelada no se revisa", () => {
    const d: DatosExcepciones = { ordenes: [orden({ id: "x1", status: "cancelado", items: [{ productId: 1, name: "Leche", quantity: 1 }] })], cuentas: [], devoluciones: [] };
    expect(grupo(d, "costo-faltante")).toBeUndefined();
  });

  it("el mismo comprobante del mismo proveedor dos veces se señala", () => {
    const d: DatosExcepciones = {
      ordenes: [orden({ id: "a1", invoiceNumber: "F001-123" }), orden({ id: "a2", invoiceNumber: "F001-00000123" })],
      cuentas: [],
      devoluciones: [],
    };
    expect(claveDeComprobante("F001-123")).toBe(claveDeComprobante("f001-00000123"));
    expect(grupo(d, "factura-repetida")?.total ?? 0).toBeGreaterThan(0);
  });

  it("el mismo número de OTRO proveedor no es repetido", () => {
    const d: DatosExcepciones = {
      ordenes: [orden({ id: "a1", invoiceNumber: "F001-123" }), orden({ id: "a2", supplierId: "p2", supplierName: "Otro", invoiceNumber: "F001-123" })],
      cuentas: [],
      devoluciones: [],
    };
    expect(grupo(d, "factura-repetida")).toBeUndefined();
  });

  it("sin plata (cuentas = null) avisa que los saldos los ve otro", () => {
    const b = excepcionesDeCompras({ ordenes: [], cuentas: null, devoluciones: [] }, HOY);
    expect(b.plataOculta).toBe(true);
    expect(b.total).toBe(0);
  });
});
