import { describe, expect, it, vi } from "vitest";
import { calcularCreditoRecepcion, vistaPreviaCredito, type ItemRecepcion } from "@/lib/compras/credito-recepcion";
import { textoConfirmarCredito } from "@/components/admin/cuentas-por-pagar/use-confirmar-credito-recepcion";
import { aplicarCreditoRecepcion, anotarCreditoEnItems, getFaltantesAcreditados } from "@/lib/compras/aplicar-credito-recepcion";

/**
 * Recibir con dañados/faltantes baja la cuenta por pagar de la OC (09-10).
 * Antes la merma quedaba registrada y la deuda seguía por el total pedido.
 */

const OC = [
  { productId: 1, name: "Arroz Costeño 5kg", quantity: 10, unitCost: 10 },
  { productId: 2, name: "Aceite Primor 1L", quantity: 5, unitCost: 8 },
];
const item = (p: Partial<ItemRecepcion>): ItemRecepcion => ({ product: "Arroz Costeño 5kg", productId: 1, expectedQty: 10, receivedQty: 10, condition: "ok", ...p });

describe("calcularCreditoRecepcion", () => {
  it("dañado: las unidades que llegaron rotas, al precio que cobra el proveedor", () => {
    const r = calcularCreditoRecepcion({
      ocItems: OC, totalOc: 140, items: [item({ receivedQty: 2, condition: "dañado" })],
      recibidoTotal: new Map([[1, 2]]), faltantesYaAcreditados: new Map(),
    });
    expect(r.total).toBe(20);
    expect(r.lineas[0]).toMatchObject({ indice: 0, unidades: 2, precioUnitario: 10, motivo: "dañado" });
  });

  it("el descuento de la orden también baja el precio de lo acreditado", () => {
    // subtotal 140, total 133 (5 % de descuento) → la unidad de S/ 10 cobra 9.50
    const r = calcularCreditoRecepcion({
      ocItems: OC, totalOc: 133, items: [item({ receivedQty: 2, condition: "vencido" })],
      recibidoTotal: new Map([[1, 2]]), faltantesYaAcreditados: new Map(),
    });
    expect(r.total).toBe(19);
  });

  it("faltante: lo declarado, con tope en lo que de verdad falta de la OC", () => {
    const r = calcularCreditoRecepcion({
      ocItems: OC, totalOc: 140, items: [item({ receivedQty: 7, condition: "faltante" })],
      recibidoTotal: new Map([[1, 7]]), faltantesYaAcreditados: new Map(),
    });
    expect(r.lineas[0].unidades).toBe(3);
    expect(r.total).toBe(30);
  });

  it("un segundo viaje no vuelve a acreditar el faltante ya acreditado", () => {
    const r = calcularCreditoRecepcion({
      ocItems: OC, totalOc: 140, items: [item({ receivedQty: 0, condition: "faltante" })],
      recibidoTotal: new Map([[1, 7]]), faltantesYaAcreditados: new Map([[1, 3]]),
    });
    expect(r.total).toBe(0);
  });

  it("un viaje que muestra la OC completa como esperado no acredita lo que ya llegó antes", () => {
    // 1.er viaje: 6 llegaron. 2.º viaje: esperado 10 (la OC entera), llegan 2, marca faltante.
    const r = calcularCreditoRecepcion({
      ocItems: OC, totalOc: 140, items: [item({ receivedQty: 2, condition: "faltante" })],
      recibidoTotal: new Map([[1, 8]]), faltantesYaAcreditados: new Map(),
    });
    expect(r.lineas[0].unidades).toBe(2); // falta 10 − 8, no 10 − 2
  });

  it("ok no acredita nada; por nombre si no vino el productId", () => {
    const r = calcularCreditoRecepcion({
      ocItems: OC, totalOc: 140,
      items: [item({}), { product: " aceite primor 1l ", expectedQty: 5, receivedQty: 1, condition: "dañado" }],
      recibidoTotal: new Map([[1, 10], [2, 1]]), faltantesYaAcreditados: new Map(),
    });
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0]).toMatchObject({ indice: 1, productId: 2, monto: 8 });
  });

  it("nunca acredita más que la orden", () => {
    const r = calcularCreditoRecepcion({
      ocItems: OC, totalOc: 140, items: [item({ receivedQty: 50, condition: "dañado" })],
      recibidoTotal: new Map([[1, 50]]), faltantesYaAcreditados: new Map(),
    });
    expect(r.lineas[0].unidades).toBe(10);
    expect(r.total).toBe(100);
  });
});

function txFalso(cuenta: { id: string; amount: number; paidAmount: number; description: string } | null) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(cuenta ? [{ id: cuenta.id }] : []),
    payable: {
      findFirst: vi.fn().mockResolvedValue(cuenta),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    supplierReturn: { create: vi.fn().mockResolvedValue({ id: "ret-1" }) },
    goodsReceipt: { findMany: vi.fn(), updateMany: vi.fn() },
  };
}
const credito = (total: number) => ({
  total,
  lineas: [{ indice: 0, productId: 1, nombre: "Arroz Costeño 5kg", motivo: "dañado" as const, unidades: total / 10, precioUnitario: 10, monto: total }],
});
const opts = { purchaseOrderId: "po-1", supplierId: "sup-1", supplierName: "Distribuidora Ucayali", ref: "REC-AB12CD" };

describe("aplicarCreditoRecepcion", () => {
  it("cuenta sin pagar: baja el total y anota por qué; no hay reclamo", async () => {
    const tx = txFalso({ id: "pay-1", amount: 140, paidAmount: 0, description: "Auto-generado desde OC po-1" });
    const r = await aplicarCreditoRecepcion(tx as never, "t1", { ...opts, credito: credito(20) });
    expect(r).toMatchObject({ descontado: 20, aFavor: 0, payableId: "pay-1", reclamoId: null });
    const { where, data } = tx.payable.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "pay-1", tenantId: "t1" });
    expect(data).toMatchObject({ amount: 120, status: "pendiente" });
    expect(data.description).toContain("−S/ 20.00 por REC-AB12CD (2 dañado)");
    expect(tx.supplierReturn.create).not.toHaveBeenCalled();
  });

  it("cuenta casi pagada: descuenta hasta el saldo y el resto queda como reclamo de un ítem", async () => {
    const tx = txFalso({ id: "pay-1", amount: 140, paidAmount: 130, description: "" });
    const r = await aplicarCreditoRecepcion(tx as never, "t1", { ...opts, credito: credito(20) });
    expect(r).toMatchObject({ descontado: 10, aFavor: 10, reclamoId: "ret-1" });
    expect(tx.payable.updateMany.mock.calls[0][0].data).toMatchObject({ amount: 130, status: "pagado" });
    const reclamo = tx.supplierReturn.create.mock.calls[0][0].data;
    expect(reclamo.items.create).toEqual([{ nombre: "Saldo a favor de REC-AB12CD", cantidad: 1, unidad: "und", productId: null, precioUnitario: 10 }]);
  });

  it("compra al contado (sin cuenta): todo queda como reclamo, sin productId para no mover stock", async () => {
    const tx = txFalso(null);
    const r = await aplicarCreditoRecepcion(tx as never, "t1", { ...opts, credito: credito(20) });
    expect(r).toMatchObject({ descontado: 0, aFavor: 20, payableId: null });
    const reclamo = tx.supplierReturn.create.mock.calls[0][0].data;
    expect(reclamo).toMatchObject({ tenantId: "t1", estado: "PENDIENTE", proveedorId: "sup-1" });
    expect(reclamo.items.create[0]).toMatchObject({ cantidad: 2, productId: null, precioUnitario: 10 });
  });

  it("bloquea la cuenta de la OC (FOR UPDATE) antes de leerla", async () => {
    const tx = txFalso({ id: "pay-1", amount: 140, paidAmount: 0, description: "" });
    await aplicarCreditoRecepcion(tx as never, "t1", { ...opts, credito: credito(20) });
    const sql = (tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).toMatch(/FROM "Payable" WHERE "tenantId" = \? AND "purchaseOrderId" = \? FOR UPDATE/);
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual(["t1", "po-1"]);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.payable.findFirst.mock.invocationCallOrder[0]);
  });

  it("sin crédito no toca nada", async () => {
    const tx = txFalso({ id: "pay-1", amount: 140, paidAmount: 0, description: "" });
    const r = await aplicarCreditoRecepcion(tx as never, "t1", { ...opts, credito: { total: 0, lineas: [] } });
    expect(r.total).toBe(0);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.payable.findFirst).not.toHaveBeenCalled();
  });
});

describe("faltantes acreditados entre recepciones", () => {
  it("lo anotado en una recepción lo lee la siguiente (y se excluye la actual)", async () => {
    const items = anotarCreditoEnItems([item({ receivedQty: 7, condition: "faltante" })], {
      total: 30, lineas: [{ indice: 0, productId: 1, nombre: "x", motivo: "faltante", unidades: 3, precioUnitario: 10, monto: 30 }],
    });
    expect(items[0]).toMatchObject({ creditoUnidades: 3, creditoMonto: 30 });
    const tx = { goodsReceipt: { findMany: vi.fn().mockResolvedValue([{ id: "r1", itemsJson: items }, { id: "r2", itemsJson: items }]) } };
    const mapa = await getFaltantesAcreditados(tx as never, "t1", "po-1", OC, "r2");
    expect(mapa.get(1)).toBe(3);
  });
});

describe("aviso antes de guardar una recepción con crédito", () => {
  // OC de 10 arroz a 10 + 5 aceite a 8: subtotal 140, total 140.
  const oc = { total: 140, items: [{ productId: 1, name: "Arroz Costeño 5kg", quantity: 10, unitCost: 10 }, { productId: 2, name: "Aceite Primor 1L", quantity: 5, unitCost: 8 }] };
  const item = (o: Partial<ItemRecepcion>): ItemRecepcion => ({ product: "Arroz Costeño 5kg", productId: 1, expectedQty: 10, receivedQty: 10, condition: "ok", ...o });

  it("la vista previa cuenta sólo esta recepción: 3 faltantes de 10 = S/ 30", () => {
    const r = vistaPreviaCredito(oc.items, oc.total, [item({ receivedQty: 7, condition: "faltante" })]);
    expect(r.total).toBe(30);
    expect(r.lineas[0]).toMatchObject({ motivo: "faltante", unidades: 3 });
  });

  it("dice el monto, la línea, que cierra la orden y que no se deshace", () => {
    const t = textoConfirmarCredito(oc, "Distribuidora Ucayali", [
      item({ receivedQty: 7, condition: "faltante" }),
      item({ product: "Aceite Primor 1L", productId: 2, expectedQty: 5, receivedQty: 2, condition: "dañado" }),
    ]);
    expect(t?.title).toMatch(/hasta S\/\s?46\.00 a Distribuidora Ucayali/);
    expect(t?.description).toContain("3 Arroz Costeño 5kg faltante (no llegará)");
    expect(t?.description).toContain("2 Aceite Primor 1L dañado");
    expect(t?.description).toContain("ya no lo vas a esperar");
    expect(t?.description).toContain("No se puede deshacer.");
  });

  it("todo OK o faltante sin diferencia: no hay nada que preguntar", () => {
    expect(textoConfirmarCredito(oc, "X", [item({})])).toBeNull();
    expect(textoConfirmarCredito(oc, "X", [item({ condition: "faltante" })])).toBeNull();
  });
});
