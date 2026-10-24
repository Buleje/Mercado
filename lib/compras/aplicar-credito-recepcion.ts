import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { redondear2, resumenCredito, type CreditoRecepcion, type LineaOc } from "./credito-recepcion";

/**
 * Escribe el crédito de una recepción (ver `credito-recepcion.ts`) DENTRO de la
 * transacción que mueve el stock: la merma y la plata quedan juntas o no queda
 * ninguna.
 *
 * 1. Si la OC tiene cuenta por pagar con saldo, se baja el total de la cuenta
 *    (hasta su saldo: nunca por debajo de lo ya pagado) y queda escrito en su
 *    descripción cuánto, por qué recepción y por qué.
 * 2. Lo que no entró en el saldo (OC al contado, cuenta ya pagada) queda como
 *    reclamo PENDIENTE en Devoluciones al proveedor: es plata que el proveedor
 *    te debe (nota de crédito, reposición o reembolso).
 *
 * Los ítems del reclamo van SIN `productId` a propósito: marcar la devolución
 * como ENVIADA descuenta stock (ADR-379), y lo dañado nunca entró al stock
 * vendible ni lo faltante llegó. Con `productId` el stock bajaba dos veces.
 */

export type ResultadoCredito = {
  /** Lo que vale lo que llegó mal o no llegó, al precio que cobra el proveedor. */
  total: number;
  /** Lo que se bajó de la cuenta por pagar de la OC. */
  descontado: number;
  /** Lo que quedó como reclamo pendiente al proveedor. */
  aFavor: number;
  payableId: string | null;
  reclamoId: string | null;
  /** «2 dañado, 1 faltante». */
  detalle: string;
};

export const SIN_CREDITO: ResultadoCredito = { total: 0, descontado: 0, aFavor: 0, payableId: null, reclamoId: null, detalle: "" };

type Tx = Pick<Prisma.TransactionClient, "payable" | "supplierReturn" | "goodsReceipt" | "$queryRaw">;

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

export async function aplicarCreditoRecepcion(
  tx: Tx,
  tenantId: string,
  opts: { purchaseOrderId: string; supplierId: string | null; supplierName: string; ref: string; credito: CreditoRecepcion },
): Promise<ResultadoCredito> {
  const { credito, ref } = opts;
  if (credito.total <= 0) return SIN_CREDITO;
  const detalle = resumenCredito(credito.lineas);

  let descontado = 0;
  let payableId: string | null = null;
  // La cuenta bloqueada ANTES de leerla (mismo orden que
  // `GastoConCajaDB.pagarCuenta`): un pago o una segunda recepción en paralelo
  // espera a que esta termine y lee el monto ya bajado, en vez de pisarlo con
  // un `paidAmount` viejo.
  const bloqueadas = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Payable" WHERE "tenantId" = ${tenantId} AND "purchaseOrderId" = ${opts.purchaseOrderId} FOR UPDATE
  `;
  const cuenta = bloqueadas.length > 0
    ? await tx.payable.findFirst({ where: { tenantId, purchaseOrderId: opts.purchaseOrderId } })
    : null;
  if (cuenta) {
    payableId = cuenta.id;
    const monto = Number(cuenta.amount);
    const pagado = Number(cuenta.paidAmount);
    const saldo = Math.max(0, redondear2(monto - pagado));
    descontado = redondear2(Math.min(credito.total, saldo));
    if (descontado > 0) {
      const nuevoMonto = redondear2(monto - descontado);
      // Misma regla que `PayablesDB.addPayment`.
      const status = pagado >= nuevoMonto - 0.005 ? "pagado" : pagado > 0 ? "parcial" : "pendiente";
      const nota = `−${soles(descontado)} por ${ref} (${detalle})`;
      await tx.payable.updateMany({
        where: { id: cuenta.id, tenantId },
        data: { amount: nuevoMonto, status, description: cuenta.description ? `${cuenta.description} · ${nota}` : nota },
      });
    }
  }

  const aFavor = redondear2(credito.total - descontado);
  let reclamoId: string | null = null;
  if (aFavor > 0.004) {
    // Si una parte ya se descontó, el reclamo es UN ítem por el resto: listar
    // todas las líneas sumaría el total y el reclamo diría más de lo que es.
    const items = descontado > 0
      ? [{ nombre: `Saldo a favor de ${ref}`, cantidad: 1, unidad: "und", productId: null, precioUnitario: aFavor }]
      : credito.lineas.map((l) => ({ nombre: `${l.nombre} (${l.motivo})`, cantidad: l.unidades, unidad: "und", productId: null, precioUnitario: l.precioUnitario }));
    const reclamo = await tx.supplierReturn.create({
      data: {
        proveedorId: opts.supplierId,
        proveedorNombre: opts.supplierName,
        motivo: `Recepción ${ref}: ${detalle} — te deben ${soles(aFavor)}`,
        notas: descontado > 0
          ? `Ya se bajaron ${soles(descontado)} de la cuenta por pagar; reclama el resto. No mueve stock.`
          : "La cuenta ya estaba pagada o la compra fue al contado: pide la nota de crédito, la reposición o el reembolso. No mueve stock.",
        estado: "PENDIENTE",
        tenantId,
        items: { create: items },
      },
      select: { id: true },
    });
    reclamoId = reclamo.id;
  }

  return { total: credito.total, descontado, aFavor, payableId, reclamoId, detalle };
}

/**
 * Unidades ya acreditadas como «faltante» por producto en las recepciones
 * anteriores de la OC (lo anota `anotarCreditoEnItems` en `itemsJson`).
 */
export async function getFaltantesAcreditados(
  tx: Pick<Prisma.TransactionClient, "goodsReceipt">,
  tenantId: string,
  purchaseOrderId: string,
  ocItems: LineaOc[],
  excluirRecepcionId: string,
): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  const recepciones = await tx.goodsReceipt.findMany({
    where: { tenantId, purchaseOrderId },
    select: { id: true, itemsJson: true },
  });
  for (const r of recepciones) {
    if (r.id === excluirRecepcionId || !Array.isArray(r.itemsJson)) continue;
    for (const raw of r.itemsJson as Array<Record<string, unknown> | null>) {
      if (!raw || raw.condition !== "faltante") continue;
      const unidades = Number(raw.creditoUnidades ?? 0);
      if (!Number.isFinite(unidades) || unidades <= 0) continue;
      const pid = Number(raw.productId);
      const linea = Number.isInteger(pid) && pid > 0
        ? ocItems.find((i) => i.productId === pid)
        : ocItems.find((i) => typeof raw.product === "string" && i.name.trim().toLowerCase() === raw.product.trim().toLowerCase());
      if (linea) mapa.set(linea.productId, (mapa.get(linea.productId) ?? 0) + unidades);
    }
  }
  return mapa;
}

/** Los ítems de la recepción con lo acreditado de cada línea (`creditoUnidades`, `creditoMonto`). */
export function anotarCreditoEnItems<T extends object>(items: T[], credito: CreditoRecepcion): Array<T & { creditoUnidades?: number; creditoMonto?: number }> {
  return items.map((it, i) => {
    const l = credito.lineas.find((x) => x.indice === i);
    return l ? { ...it, creditoUnidades: l.unidades, creditoMonto: l.monto } : it;
  });
}
