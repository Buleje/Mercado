import "server-only";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import {
  acumularNoAptos,
  acumularRecibido,
  deudaAlCancelar,
  valorDeLoRecibido,
  type ItemOc,
} from "@/lib/compras/ciclo-oc";

export type CuentaAlCancelar =
  | { resultado: "anulada"; montoAntes: number; montoDespues: 0 }
  | { resultado: "ajustada"; montoAntes: number; montoDespues: number }
  | { resultado: "sin_cambio"; montoAntes: number; montoDespues: number }
  | { resultado: "conservada_con_pagos"; montoAntes: number; montoDespues: number };

type OrdenCancelada = {
  id: string;
  total: unknown;
  items: ReadonlyArray<{ productId: number; name: string; quantity: number; unitCost: unknown }>;
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * La deuda de una orden que se acaba de cancelar (revisión 17-10, punto 5).
 *
 * Antes, una cuenta sin pagos se borraba entera aunque la mercadería hubiera
 * llegado: el proveedor entregó 8 de 10 cajas y Por pagar decía que no se le
 * debía nada. Ahora la deuda baja a lo que vale lo que llegó en buen estado
 * (lo dañado o vencido ya se descontó al recibir); si no llegó nada, se borra
 * como antes. Con pagos no se toca: esa plata salió de verdad.
 *
 * La cuenta se bloquea ANTES de leerla (mismo orden que `aplicarCreditoRecepcion`
 * y `GastoConCajaDB.pagarCuenta`): un pago en paralelo espera y, si entra
 * primero, este lee el `paidAmount` nuevo y conserva la cuenta.
 *
 * @returns null si la orden no tenía cuenta en Por pagar.
 */
export async function cerrarCuentaDeOrdenCancelada(tenantId: string, orden: OrdenCancelada): Promise<CuentaAlCancelar | null> {
  return prisma.$transaction(async (tx) => {
    const bloqueadas = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Payable" WHERE "tenantId" = ${tenantId} AND "purchaseOrderId" = ${orden.id} FOR UPDATE
    `;
    if (bloqueadas.length === 0) return null;
    const cuenta = await tx.payable.findFirst({
      where: { tenantId, purchaseOrderId: orden.id },
      select: { id: true, amount: true, paidAmount: true, description: true },
    });
    if (!cuenta) return null;
    const montoAntes = num(cuenta.amount);
    if (num(cuenta.paidAmount) > 0) return { resultado: "conservada_con_pagos", montoAntes, montoDespues: montoAntes };

    const items: ItemOc[] = orden.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitCost: num(i.unitCost) }));
    const recepciones = await tx.goodsReceipt.findMany({
      where: { tenantId, purchaseOrderId: orden.id },
      select: { id: true, itemsJson: true },
    });
    const valor = valorDeLoRecibido(items, num(orden.total), acumularRecibido(recepciones, items), acumularNoAptos(recepciones, items));
    const decision = deudaAlCancelar(montoAntes, valor);

    if (decision.accion === "anular") {
      await tx.payable.deleteMany({ where: { id: cuenta.id, tenantId } });
      return { resultado: "anulada", montoAntes, montoDespues: 0 };
    }
    if (decision.accion === "igual") return { resultado: "sin_cambio", montoAntes, montoDespues: montoAntes };

    const nota = `Orden cancelada: −${formatCurrency(montoAntes - decision.monto)} por lo que no llegó`;
    await tx.payable.updateMany({
      where: { id: cuenta.id, tenantId },
      data: {
        amount: decision.monto,
        status: "pendiente",
        description: cuenta.description ? `${cuenta.description} · ${nota}` : nota,
      },
    });
    return { resultado: "ajustada", montoAntes, montoDespues: decision.monto };
  }, { timeout: 15_000, maxWait: 5_000 });
}
