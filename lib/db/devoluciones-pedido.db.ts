/**
 * Devoluciones de un PEDIDO (`Return` con `orderId`): la misma cuenta que la
 * devolución de una venta del POS (`devoluciones-pos.db.ts`), en UNA transacción.
 *
 * Por qué (17-10): `POST /api/returns` con `orderId` devolvía `OrderItem.price ×
 * cantidad` sin restar el cupón, la promoción ni los puntos del pedido, no sumaba
 * lo ya devuelto (la misma unidad se devolvía N veces), acreditaba al teléfono que
 * mandaba el cuerpo y escribía stock, `Return` y crédito por separado, sin candado.
 *
 * Reglas:
 * - Se devuelve lo que de verdad se cobró: cada línea en la proporción
 *   `Order.total ÷ Σ price × cantidad` (`lib/pos/reembolso.ts`), y la suma de
 *   todas las devoluciones del pedido nunca pasa de `Order.total`.
 * - Candado por pedido (`candadoDelNegocio`) y lo ya devuelto se lee DENTRO de
 *   la transacción, después del candado.
 * - El crédito va al cliente DEL PEDIDO y SUMA a `Customer.creditBalance` como
 *   saldo a favor (lo que la tienda le debe). La deuda de fiados vive en `Fiado`.
 * - El estado del pedido no se toca (la máquina de estados es de `orders.db.ts`).
 *   Un pedido anulado no se devuelve: no cobró nada.
 */
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { candadoDelNegocio } from "@/lib/db/candado";
import { DevolucionError, type ItemDevuelto, type TipoReembolso } from "@/lib/db/devoluciones-pos.db";
import { calcularReembolso, planDevolucion, type LineaVentaProducto } from "@/lib/pos/reembolso";

export interface PedidoDevolucionPedido {
  orderId: string;
  /** Unidades enteras (`OrderItem.quantity` y `ReturnItem.quantity` son `Int`). */
  items: { productId: number; qty: number }[];
  refundType: TipoReembolso;
  reason?: string;
  photoUrl?: string;
  usuario: string;
}

export interface ResultadoDevolucionPedido {
  returnId: string;
  totalRefund: number;
  refundType: TipoReembolso;
  items: ItemDevuelto[];
  /** Lo que daba `price × cantidad` sin cupón/promoción/puntos (para explicar la diferencia). */
  brutoSinDescuento: number;
  /** Teléfono del cliente del pedido (al que fue el crédito), o null. */
  customerPhone: string | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export const DevolucionesPedidoDB = {
  async registrar(tenantId: string, pedido: PedidoDevolucionPedido): Promise<ResultadoDevolucionPedido> {
    const { orderId, items, refundType, usuario } = pedido;

    return prisma.$transaction(
      async (tx) => {
        await candadoDelNegocio(tx, tenantId, `devolucion-pedido:${orderId}`);

        const order = await tx.order.findFirst({
          where: { id: orderId, tenantId, deletedAt: null },
          select: {
            id: true,
            total: true,
            status: true,
            customerPhone: true,
            items: { select: { productId: true, name: true, price: true, quantity: true, unit: true } },
          },
        });
        if (!order) throw new DevolucionError("Pedido no encontrado", 404, "pedido_no_encontrado");
        if (order.status === "cancelado") {
          throw new DevolucionError("El pedido está anulado: no cobró nada que devolver", 409, "pedido_anulado");
        }
        const telefono = order.customerPhone?.trim() || null;
        if (refundType === "credito" && !telefono) {
          throw new DevolucionError(
            "El pedido no tiene cliente: no hay a quién dejarle saldo a favor. Devuélvelo en efectivo.",
            400,
            "pedido_sin_cliente",
          );
        }

        // Lo ya devuelto de ESTE pedido, leído después del candado.
        const previas = await tx.return.findMany({
          where: { orderId, tenantId },
          select: { total: true, items: { select: { productId: true, quantity: true } } },
        });
        const yaDevuelto = new Map<number, number>();
        let yaReembolsadoC = 0;
        for (const r of previas) {
          yaReembolsadoC += Math.round(toNumOrZero(r.total) * 100);
          for (const it of r.items) yaDevuelto.set(it.productId, (yaDevuelto.get(it.productId) ?? 0) + it.quantity);
        }
        const yaReembolsado = yaReembolsadoC / 100;
        const cobrado = toNumOrZero(order.total);

        // Todas las líneas cuentan para el factor (el total las cubre a todas); sólo las
        // que conservan su producto se pueden devolver (un producto borrado deja `productId` null).
        const todas = order.items.map((i) => ({ price: toNumOrZero(i.price), quantity: i.quantity }));
        const conProducto: (LineaVentaProducto & { name: string; unit: string })[] = [];
        for (const i of order.items) {
          if (i.productId == null) continue;
          conProducto.push({ productId: i.productId, name: i.name, unit: i.unit, price: toNumOrZero(i.price), quantity: i.quantity });
        }

        const plan = planDevolucion(conProducto, yaDevuelto, items);
        if (!plan.ok) {
          const nombre = conProducto.find((l) => l.productId === plan.productId)?.name ?? `#${plan.productId}`;
          if (plan.motivo === "no_esta_en_la_venta") {
            throw new DevolucionError(`El producto ${nombre} no está en este pedido`, 400, "producto_ajeno");
          }
          throw new DevolucionError(
            `Cantidad pedida (${plan.pedida}) excede lo que queda por devolver (${plan.disponible}) de ${nombre}`,
            400,
            "excede_cantidad",
          );
        }

        const calc = calcularReembolso({
          totalVenta: cobrado,
          lineasVenta: todas,
          devolver: plan.lineas.map((l) => ({ price: l.price, quantity: l.qty })),
          yaReembolsado,
          // «Vuelve todo» sólo si no queda ninguna línea huérfana: si no, se devolvería
          // el total entero cobrando también lo que no se puede devolver.
          completaLaVenta: plan.completaLaVenta && conProducto.length === order.items.length,
        });
        // Con la plata ya devuelta entera (p. ej. devoluciones viejas a precio de lista)
        // las unidades igual vuelven al stock, pero por S/ 0.
        const totalRefund = calc.total;
        const brutoSinDescuento = redondear(plan.lineas.reduce((s, l) => s + l.price * l.qty, 0));

        // Stock: sólo productos con control de stock (null = ilimitado; antes el kardex
        // lo volvía limitado), con `increment` atómico y un solo INSERT de kardex.
        const ids = plan.lineas.map((l) => l.productId);
        const productos = await tx.product.findMany({
          where: { id: { in: ids }, tenantId },
          select: { id: true, stock: true },
        });
        const conStock = new Set(productos.filter((p) => p.stock != null).map((p) => p.id));
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
            reference: orderId,
            notes: `Devolución de pedido: ${pedido.reason || "Sin motivo"}`,
            createdBy: usuario,
            tenantId,
          });
        }
        if (movimientos.length > 0) await tx.inventoryMovement.createMany({ data: movimientos });

        const devueltos: (ItemDevuelto & { unit: string })[] = plan.lineas.map((l) => {
          const linea = conProducto.find((x) => x.productId === l.productId);
          return {
            productId: l.productId,
            name: linea?.name ?? "",
            unit: linea?.unit ?? "unidad",
            quantity: l.qty,
            price: redondear(calc.precioDevuelto(l.price)),
          };
        });

        const creado = await tx.return.create({
          data: {
            orderId,
            reason: pedido.reason ?? "",
            photoUrl: pedido.photoUrl,
            total: totalRefund,
            customerPhone: telefono,
            creditApplied: refundType === "credito",
            tenantId,
            items: {
              create: devueltos.map((d) => ({
                productId: d.productId,
                name: d.name,
                quantity: d.quantity,
                price: d.price,
                unit: d.unit,
              })),
            },
          },
          select: { id: true },
        });

        // Saldo a favor del cliente DEL PEDIDO, en este negocio (Customer.phone es único
        // global: un cliente de otro negocio no se toca). Si no está acá, se deshace todo.
        if (refundType === "credito" && telefono && totalRefund > 0) {
          const r = await tx.customer.updateMany({
            where: { phone: telefono, tenantId },
            data: { creditBalance: { increment: totalRefund } },
          });
          if (r.count === 0) {
            throw new DevolucionError(
              "El cliente del pedido no está registrado en este negocio. Devuélvelo en efectivo.",
              409,
              "cliente_no_registrado",
            );
          }
        }

        return {
          returnId: creado.id,
          totalRefund,
          refundType,
          items: devueltos.map(({ unit: _unit, ...d }) => d),
          brutoSinDescuento,
          customerPhone: telefono,
        };
      },
      // Mismos tiempos que la devolución del POS (maxWait 10 s: con el servidor cargado, 5 s no alcanzaba).
      { timeout: 20_000, maxWait: 10_000 },
    );
  },
};
