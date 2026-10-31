import { describe, expect, it } from "vitest";
import { buscarEnCompras, importeDeConsulta, type DatosDeCompras, type OrdenDeCompras } from "@/lib/compras/buscar-compras";

const HOY = "2026-10-17";

function orden(p: Partial<OrdenDeCompras> & { id: string }): OrdenDeCompras {
  return {
    supplierId: "p1",
    supplierName: "Distribuidora Ucayali",
    items: [{ productId: 1, name: "Leche Gloria 400g", quantity: 12, unitCost: 3.5 }],
    total: 42,
    status: "pendiente",
    createdAt: "2026-10-05T15:00:00.000Z",
    ...p,
  };
}

const DATOS: DatosDeCompras = {
  ordenes: [
    orden({ id: "cmaaaaaaaa0001ucayal1", invoiceNumber: "F001-00000123", deliveryDate: "2026-10-10" }),
    orden({ id: "cmaaaaaaaa0002ucayal2", status: "recibido", total: 600, items: [{ productId: 2, name: "Arroz Costeño 5kg", quantity: 20, unitCost: 30 }] }),
    orden({ id: "cmaaaaaaaa0003frigor3", supplierId: "p2", supplierName: "Frigorífico Amazonía", status: "cancelado" }),
  ],
  proveedores: [
    { id: "p1", name: "Distribuidora Ucayali", ruc: "20601234567", documento: "20601234567" },
    { id: "p2", name: "Frigorífico Amazonía", ruc: "20500000001" },
  ],
  cuentas: [
    { id: "c1", supplierId: "p1", supplierName: "Distribuidora Ucayali", purchaseOrderId: "cmaaaaaaaa0002ucayal2", description: "Auto-generado desde OC cmaaaaaaaa0002ucayal2", amount: 600, paidAmount: 0, status: "pending", dueDate: "2026-10-20", createdAt: "2026-10-06T15:00:00.000Z" },
  ],
  devoluciones: [],
  recepciones: [],
};

const tipos = (q: string, modo: "todo" | "recibir" = "todo") => buscarEnCompras(DATOS, q, { hoy: HOY, modo }).grupos.map((g) => [g.tipo, g.total]);

describe("buscar en Compras (C57)", () => {
  it("el comprobante se encuentra escrito sin ceros ni guion exacto", () => {
    const r = buscarEnCompras(DATOS, "f001-123", { hoy: HOY });
    const ordenes = r.grupos.find((g) => g.tipo === "orden");
    expect(ordenes?.hallazgos[0]?.exacto).toBe(true);
    expect(ordenes?.hallazgos[0]?.titulo).toContain("Distribuidora Ucayali");
  });

  it("el RUC trae al proveedor y no repite el número en el motivo", () => {
    const r = buscarEnCompras(DATOS, "20601234567", { hoy: HOY });
    const prov = r.grupos.find((g) => g.tipo === "proveedor")?.hallazgos[0];
    expect(prov?.titulo).toContain("Distribuidora Ucayali");
    expect(prov?.motivo ?? "").not.toMatch(/20601234567 20601234567/);
  });

  it("el importe encuentra la cuenta y la orden por su total", () => {
    expect(importeDeConsulta("600")).toBe(600);
    expect(Object.fromEntries(tipos("600"))).toMatchObject({ cuenta: 1, orden: 1 });
  });

  it("el id técnico no es un texto buscable", () => {
    expect(tipos("cmaaaaaaaa")).toEqual([]);
  });

  it("menos de 2 letras no busca", () => {
    expect(buscarEnCompras(DATOS, "a", { hoy: HOY }).total).toBe(0);
  });

  it("«Por recibir» lista sólo lo que espera mercadería, sin canceladas ni recibidas", () => {
    const r = buscarEnCompras(DATOS, "", { hoy: HOY, modo: "recibir" });
    const ids = r.grupos.flatMap((g) => g.hallazgos.map((h) => h.clave));
    expect(r.total).toBe(1);
    expect(ids.join(" ")).toContain("0001");
  });

  it("sin plata (almacenero) no aparecen cuentas", () => {
    const r = buscarEnCompras({ ...DATOS, cuentas: null }, "600", { hoy: HOY });
    expect(r.grupos.some((g) => g.tipo === "cuenta")).toBe(false);
  });

  it("dos proveedores con la misma factura: cada fila lleva el suyo en el título", () => {
    const datos: DatosDeCompras = {
      ...DATOS,
      ordenes: [
        ...DATOS.ordenes,
        orden({ id: "cmaaaaaaaa0004frigor4", supplierId: "p2", supplierName: "Frigorífico Amazonía", invoiceNumber: "F001-00000123" }),
      ],
    };
    const hallazgos = buscarEnCompras(datos, "f001-123", { hoy: HOY }).grupos.find((g) => g.tipo === "orden")?.hallazgos ?? [];
    expect(hallazgos).toHaveLength(2);
    const titulos = hallazgos.map((h) => h.titulo).join(" | ");
    expect(titulos).toContain("Distribuidora Ucayali");
    expect(titulos).toContain("Frigorífico Amazonía");
  });
});
