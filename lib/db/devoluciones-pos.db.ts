/**
 * Devoluciones del POS (`Return` con `saleId`): la cuenta de cuánto se devuelve,
 * el stock que vuelve y el crédito del cliente, en UNA transacción.
 *
 * Reglas (09-10, venta de QA `bc19cbe5`: cobró S/ 0,10 con S/ 24,80 de trueque
 * y su devolución pagó S/ 24,90):
 * - Se devuelve lo que de verdad se cobró (`lib/pos/reembolso.ts`): cada línea
 *   en la proporción `Sale.total ÷ Σ price × cantidad`, y la suma de todas las
 *   devoluciones de la venta nunca pasa de `Sale.total`.
 * - Candado por venta (`pg_advisory_xact_lock`) y lo ya devuelto se lee DENTRO
 *   de la transacción: antes se leía afuera y dos devoluciones simultáneas de la
 *   misma unidad pasaban las dos.
 * - Idempotente sin columna nueva: con `idempotencyKey` el `Return.id` sale de
 *   un hash de tenant + clave. El reintento encuentra la fila y responde lo
 *   mismo; la misma clave con otro cuerpo es 422 (como ADR-449).
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import {
  calcularReembolso,
  planDevolucion,
  type LineaVentaProducto,
} from "@/lib/pos/reembolso";

export type TipoReembolso = "efectivo" | "credito";

export interface PedidoDevolucionPos {
  saleId: string;
  items: { productId: number; qty: number; motivo?: string }[];
  refundType: TipoReembolso;
  idempotencyKey?: string;
  usuario: string;
}

export interface ItemDevuelto {
  productId: number;
  name: string;
  quantity: number;
  /** Precio por unidad que se devolvió (ya con el descuento global prorrateado). */
  price: number;
}

export interface ResultadoDevolucion {
  totalRefund: number;
  refundType: TipoReembolso;
  items: ItemDevuelto[];
  /** Lo que daba `price × cantidad` sin el descuento global (para explicar la diferencia). */
  brutoSinDescuento: number;
  /** `true` si es el reintento de una devolución ya registrada con la misma clave. */
  repetida: boolean;
}

export interface EstadoDevolucionVenta {
  cobrado: number;
  yaReembolsado: number;
  queda: number;
  /** productId → unidades ya devueltas. */
  yaDevuelto: Record<number, number>;
}

/** Error de negocio con su código HTTP (la ruta lo pasa tal cual). */
export class DevolucionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 422,
    readonly code: string,
  ) {
    super(message);
    this.name = "DevolucionError";
  }
}

/** `Return.id` de una clave: estable por tenant, sin chocar entre tenants. */
export function idDevolucionPorClave(tenantId: string, clave: string): string {
  return `dev_${createHash("sha256").update(`${tenantId}:${clave}`).digest("hex").slice(0, 28)}`;
}

/** Huella del pedido para reconocer el reintento (mismo saleId, productos, cantidades y tipo). */
function huella(saleId: string, refundType: string, items: { productId: number; qty: number }[]): string {
  const por = new Map<number, number>();
  for (const i of items) por.set(i.productId, (por.get(i.productId) ?? 0) + i.qty);
  const orden = [...por.entries()].sort((a, b) => a[0] - b[0]).map(([p, q]) => `${p}:${q}`).join(",");
  return `${saleId}|${refundType}|${orden}`;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Lee con la tx de la devolución o, en la vista previa, sin tx (no ocupa una conexión del pool por una lectura). */
async function leerVentaYDevuelto(tx: Tx | typeof prisma, tenantId: string, saleId: string) {
  const sale = await tx.sale.findFirst({
    where: { id: saleId, tenantId },
    select: {
      id: true,
      total: true,
      customerPhone: true,
      items: { select: { productId: true, name: true, price: true, quantity: true } },
    },
  });
  if (!sale) return null;
  const previas = await tx.return.findMany({
    where: { saleId, tenantId },
    select: { total: true, items: { select: { productId: true, quantity: true } } },
  });
  const yaDevuelto = new Map<number, number>();
  let yaReembolsadoC = 0;
  for (const r of previas) {
    yaReembolsadoC += Math.round(toNumOrZero(r.total) * 100);
    for (const it of r.items) yaDevuelto.set(it.productId, (yaDevuelto.get(it.productId) ?? 0) + it.quantity);
  }
  const lineas: (LineaVentaProducto & { name: string })[] = sale.items.map((i) => ({
    productId: i.productId,
    name: i.name,
    price: toNumOrZero(i.price),
    quantity: i.quantity,
  }));
  return { sale, lineas, yaDevuelto, yaReembolsado: yaReembolsadoC / 100, cobrado: toNumOrZero(sale.total) };
}

export const DevolucionesPosDB = {
  /** Lo que ya se devolvió de una venta: alimenta la vista previa y el tope de cada línea. */
  async estado(tenantId: string, saleId: string): Promise<EstadoDevolucionVenta | null> {
    const leido = await leerVentaYDevuelto(prisma, tenantId, saleId);
    if (!leido) return null;
    return {
      cobrado: leido.cobrado,
      yaReembolsado: leido.yaReembolsado,
      queda: Math.max(0, Math.round((leido.cobrado - leido.yaReembolsado) * 100)) / 100,
      yaDevuelto: Object.fromEntries(leido.yaDevuelto),
    };
  },

  async registrar(tenantId: string, pedido: PedidoDevolucionPos): Promise<ResultadoDevolucion> {
    const { saleId, items, refundType, idempotencyKey, usuario } = pedido;
    const idPorClave = idempotencyKey ? idDevolucionPorClave(tenantId, idempotencyKey) : undefined;
    const huellaPedido = huella(saleId, refundType, items);

    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`devolucion-venta:${tenantId}:${saleId}`}))`;

        if (idPorClave) {
          const ya = await tx.return.findFirst({
            where: { id: idPorClave, tenantId },
            select: {
              saleId: true,
              total: true,
              creditApplied: true,
              items: { select: { productId: true, name: true, quantity: true, price: true } },
            },
          });
          if (ya) {
            const tipo: TipoReembolso = ya.creditApplied ? "credito" : "efectivo";
            const huellaGuardada = huella(ya.saleId ?? "", tipo, ya.items.map((i) => ({ productId: i.productId, qty: i.quantity })));
            if (huellaGuardada !== huellaPedido) {
              throw new DevolucionError(
                "Esta devolución ya se registró con otros productos. Cierra y vuelve a abrir la devolución.",
                422,
                "idempotencia_distinta",
              );
            }
            const itemsYa = ya.items.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, price: toNumOrZero(i.price) }));
            return {
              totalRefund: toNumOrZero(ya.total),
              refundType: tipo,
              items: itemsYa,
              brutoSinDescuento: redondear(itemsYa.reduce((s, i) => s + i.price * i.quantity, 0)),
              repetida: true,
            };
          }
        }

        const leido = await leerVentaYDevuelto(tx, tenantId, saleId);
        if (!leido) throw new DevolucionError("Venta no encontrada", 404, "venta_no_encontrada");
        const { sale, lineas, yaDevuelto, yaReembolsado, cobrado } = leido;

        const plan = planDevolucion(lineas, yaDevuelto, items);
        if (!plan.ok) {
          const nombre = lineas.find((l) => l.productId === plan.productId)?.name ?? `#${plan.productId}`;
          if (plan.motivo === "no_esta_en_la_venta") {
            throw new DevolucionError(`El producto ${nombre} no está en esta venta`, 400, "producto_ajeno");
          }
          throw new DevolucionError(
            `Qty solicitada (${plan.pedida}) excede disponible (${plan.disponible}) para producto ${nombre}`,
            400,
            "excede_cantidad",
          );
        }

        const calc = calcularReembolso({
          totalVenta: cobrado,
          lineasVenta: lineas,
          devolver: plan.lineas.map((l) => ({ price: l.price, quantity: l.qty })),
          yaReembolsado,
          completaLaVenta: plan.completaLaVenta,
        });
        const totalRefund = calc.total;
        const brutoSinDescuento = redondear(plan.lineas.reduce((s, l) => s + l.price * l.qty, 0));

        // Stock: una lectura para todos (con tenantId) y `increment` atómico por producto.
        const ids = plan.lineas.map((l) => l.productId);
        const productos = await tx.product.findMany({
          where: { id: { in: ids }, tenantId },
          select: { id: true, stock: true },
        });
        const conStock = new Set(productos.filter((p) => p.stock != null).map((p) => p.id));
        const motivoPor = new Map(items.map((i) => [i.productId, i.motivo]));
        const movimientos: {
          productId: number; type: string; quantity: number; previousStock: number; newStock: number;
          reference: string; notes: string; createdBy: string; tenantId: string;
        }[] = [];
        for (const l of plan.lineas) {
          if (!conStock.has(l.productId)) continue;
          const actualizado = await tx.product.update({
            where: { id: l.productId },
            data: { stock: { increment: l.qty } },
            select: { stock: true },
          });
          const newStock = actualizado.stock ?? l.qty;
          movimientos.push({
            productId: l.productId,
            type: "devolucion",
            quantity: l.qty,
            previousStock: newStock - l.qty,
            newStock,
            reference: saleId,
            notes: motivoPor.get(l.productId) || "Devolucion desde POS",
            createdBy: usuario,
            tenantId,
          });
        }
        // Un solo INSERT: con el pool cargado cada viaje cuenta contra el tope de la transacción.
        if (movimientos.length > 0) await tx.inventoryMovement.createMany({ data: movimientos });

        const devueltos: ItemDevuelto[] = plan.lineas.map((l) => ({
          productId: l.productId,
          name: lineas.find((x) => x.productId === l.productId)?.name ?? "",
          quantity: l.qty,
          price: redondear(calc.precioDevuelto(l.price)),
        }));

        await tx.return.create({
          data: {
            ...(idPorClave ? { id: idPorClave } : {}),
            saleId,
            reason: items[0]?.motivo || "Devolucion POS",
            total: totalRefund,
            customerPhone: sale.customerPhone,
            creditApplied: refundType === "credito",
            tenantId,
            items: {
              create: devueltos.map((d) => ({
                productId: d.productId,
                name: d.name,
                quantity: d.quantity,
                price: d.price,
                unit: "unidad",
              })),
            },
          },
        });

        // SECURITY 2026-05-07 (Z4): updateMany con tenantId (Customer.phone es único global).
        if (refundType === "credito" && sale.customerPhone && totalRefund > 0) {
          await tx.customer.updateMany({
            where: { phone: sale.customerPhone, tenantId },
            data: { creditBalance: { increment: totalRefund } },
          });
        }

        return { totalRefund, refundType, items: devueltos, brutoSinDescuento, repetida: false };
      },
      // maxWait 10 s: con el servidor cargado, 5 s daba «Unable to start a transaction» (E2E 09-10).
      { timeout: 20_000, maxWait: 10_000 },
    );
  },
};
