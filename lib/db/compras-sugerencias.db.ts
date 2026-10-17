import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";
import { enCaminoPorProducto, type EnCaminoProducto } from "@/lib/compras/en-camino";

/**
 * Sugerencias de reabastecimiento — las queries que responden «¿qué compro?».
 *
 * LO QUE ESTA PANTALLA HACÍA MAL Y ACÁ SE CORRIGE (ADR-376):
 *
 * · Sugería rellenar hasta `stockMax` sin mirar si el producto se vende. En el
 *   tenant real eso daba 52 sugerencias por 944 unidades con CERO ventas en 30
 *   días: una lista de compras de mercadería que no rota.
 * · La velocidad de venta dividía siempre entre 30, aunque el producto hubiera
 *   estado agotado 25 de esos días — el que más falta hacía parecía el que
 *   menos se vendía.
 * · No descontaba lo que ya venía en camino, así que proponía pedir de nuevo lo
 *   que ya estaba pedido.
 * · No sabía cuánto tarda cada proveedor, que es lo que convierte «me quedan 5»
 *   en «pedí hoy».
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbSugerenciaProduct = {
  id: number;
  name: string;
  category: string | null;
  stock: number | null;
  stockMin: number | null;
  stockMax: number | null;
  /** "product" | "service": un servicio no se repone por saldo (C25). */
  type: string;
  unit: string;
  pricingUnit: string | null;
};

export type DbSugerenciaLastPurchase = {
  supplierId: string;
  supplierName: string;
  lastPrice: number;
};

/** Venta del período y cuántos días el producto estuvo realmente disponible. */
export type DbVentaProducto = {
  /** Unidades vendidas en la ventana. */
  vendido: number;
  /**
   * Días de la ventana en que hubo stock. Es el denominador honesto: dividir
   * entre 30 a un producto que estuvo agotado tres semanas lo hace parecer
   * lento cuando en realidad se agotó.
   */
  diasConStock: number;
};

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Productos activos con stock mínimo, CON su tipo.
 *
 * El mínimo NO distingue un servicio de la mercadería (así decía este
 * comentario y era falso): en Blas «Aserrado de madera» y «Cargador Frontal
 * CAT» son servicios con mínimo 10 y salían a reponer. La ruta los aparta con
 * `esInventariable` (`lib/compras/naturaleza.ts`) y dice cuáles apartó.
 */
export async function getProductosConStockMin(
  tenantId: string,
): Promise<DbSugerenciaProduct[]> {
  return prisma.product.findMany({
    where: { tenantId, active: true, deletedAt: null, stockMin: { gt: 0 } },
    select: {
      id: true, name: true, category: true, stock: true, stockMin: true, stockMax: true,
      type: true, unit: true, pricingUnit: true,
    },
  });
}

/**
 * Cuántos productos activos hay en total, tengan mínimo o no.
 *
 * Sirve para distinguir dos silencios que se veían idénticos: «miré todo y no
 * hay nada que reponer» y «no pude mirar nada porque ningún producto tiene
 * stock mínimo cargado». Medido el 2026-08-12: tres tiendas (44, 15 y 10
 * productos) no tenían ni un mínimo configurado y la pantalla les afirmaba que
 * estaba todo abastecido.
 */
export async function contarProductosActivos(tenantId: string): Promise<number> {
  // Los servicios no llevan mínimo: «ninguno de tus 12 productos tiene
  // mínimo» no puede contar el aserrado o el alquiler de la grúa.
  return prisma.product.count({
    where: { tenantId, active: true, deletedAt: null, NOT: { type: "service" } },
  });
}

/**
 * Ventas de la ventana Y días en que hubo stock, por producto.
 *
 * Los días con stock se reconstruyen del kardex (`InventoryMovement` guarda
 * `newStock` en cada movimiento): se recorre la línea de tiempo y se suman los
 * tramos en que el saldo fue mayor a cero. Un producto sin movimientos en la
 * ventana mantuvo su stock actual todo el tiempo.
 */
export async function getVentasYDisponibilidad(
  tenantId: string,
  productos: DbSugerenciaProduct[],
  desde: Date,
  hasta: Date,
): Promise<Map<number, DbVentaProducto>> {
  const productIds = productos.map((p) => p.id);
  const ventanaMs = Math.max(hasta.getTime() - desde.getTime(), 86_400_000);
  const diasVentana = ventanaMs / 86_400_000;

  const [salesAgg, movimientos] = await Promise.all([
    prisma.saleItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      where: { productId: { in: productIds }, sale: { tenantId, createdAt: { gte: desde, lte: hasta } } },
    }),
    prisma.inventoryMovement.findMany({
      where: { tenantId, productId: { in: productIds }, createdAt: { gte: desde, lte: hasta } },
      select: { productId: true, newStock: true, previousStock: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const vendidoPorProducto = new Map<number, number>();
  for (const row of salesAgg) vendidoPorProducto.set(row.productId, row._sum.quantity ?? 0);

  const movsPorProducto = new Map<number, typeof movimientos>();
  for (const m of movimientos) {
    const lista = movsPorProducto.get(m.productId) ?? [];
    lista.push(m);
    movsPorProducto.set(m.productId, lista);
  }

  const out = new Map<number, DbVentaProducto>();
  for (const p of productos) {
    const movs = movsPorProducto.get(p.id) ?? [];
    let diasConStock: number;

    if (movs.length === 0) {
      // Sin movimientos: el saldo no cambió en toda la ventana.
      diasConStock = (p.stock ?? 0) > 0 ? diasVentana : 0;
    } else {
      // El saldo al inicio de la ventana es el `previousStock` del primer
      // movimiento: es el único punto donde el kardex declara el pasado.
      let saldo = movs[0].previousStock;
      let cursor = desde.getTime();
      let conStock = 0;
      for (const m of movs) {
        const t = m.createdAt.getTime();
        if (saldo > 0) conStock += Math.max(t - cursor, 0);
        saldo = m.newStock;
        cursor = t;
      }
      if (saldo > 0) conStock += Math.max(hasta.getTime() - cursor, 0);
      diasConStock = conStock / 86_400_000;
    }

    out.set(p.id, {
      vendido: vendidoPorProducto.get(p.id) ?? 0,
      // Nunca cero: sería una división por cero disfrazada de «se vende
      // infinito». Medio día es el piso.
      diasConStock: Math.max(Math.min(diasConStock, diasVentana), 0.5),
    });
  }
  return out;
}

/**
 * Lo ya pedido que todavía no llegó, por producto (C27).
 *
 * Sin esto la pantalla proponía comprar de nuevo lo que ya venía en camino —
 * el error más caro de una lista de reposición, porque el stock duplicado se
 * paga dos veces y se descubre cuando llega.
 *
 * Cuenta las órdenes `pendiente` Y `parcial`, línea por línea: lo que falta es
 * lo pedido menos lo que ya recibió cada recepción (y menos el faltante que el
 * proveedor no mandará). Antes sólo contaba las pendientes enteras porque la
 * recepción no guardaba lo recibido por línea; desde que lo guarda
 * (`GoodsReceipt.itemsJson`), la parcial también resta. La cuenta vive en
 * `lib/compras/en-camino.ts`. Los borradores automáticos se informan aparte.
 */
export async function getStockEnTransito(
  tenantId: string,
  productIds: number[],
): Promise<Map<number, EnCaminoProducto>> {
  if (productIds.length === 0) return new Map();
  try {
    // Las líneas COMPLETAS de cada orden abierta que trae alguno de estos
    // productos: las recepciones que guardaron sólo el nombre se resuelven
    // contra los ítems de su orden.
    const items = await prisma.purchaseItem.findMany({
      where: {
        purchaseOrder: {
          tenantId,
          status: { in: ["pendiente", "parcial", "auto_generated"] },
          items: { some: { productId: { in: productIds } } },
        },
      },
      select: {
        purchaseOrderId: true, productId: true, name: true, quantity: true,
        purchaseOrder: { select: { status: true, deliveryDate: true } },
      },
    });
    if (items.length === 0) return new Map();
    const ordenesConRecepcion = [...new Set(
      items.filter((i) => i.purchaseOrder.status === "parcial" || i.purchaseOrder.status === "pendiente").map((i) => i.purchaseOrderId),
    )];
    const recepciones = ordenesConRecepcion.length === 0 ? [] : await prisma.goodsReceipt.findMany({
      where: { tenantId, purchaseOrderId: { in: ordenesConRecepcion } },
      select: { id: true, purchaseOrderId: true, itemsJson: true },
    });
    const todo = enCaminoPorProducto(
      items.map((i) => ({
        purchaseOrderId: i.purchaseOrderId,
        status: i.purchaseOrder.status,
        deliveryDate: i.purchaseOrder.deliveryDate,
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
      })),
      recepciones,
    );
    const pedidos = new Set(productIds);
    for (const id of todo.keys()) if (!pedidos.has(id)) todo.delete(id);
    return todo;
  } catch (e) {
    // No se traga el error: quien llama decide si avisar. Decir «no hay nada en
    // camino» cuando la consulta falló haría pedir de más.
    logger.warn("[compras-sugerencias.db] stock en tránsito falló", {
      err: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/** Lo que hace falta saber del proveedor para sugerir y para pedir. */
export type DatosProveedorParaCompra = {
  /** Días que tarda en entregar. `null` = no se sabe, usá el default. */
  dias: number | null;
  origen: "declarado" | "historial" | "default";
  /** Forma de pago pactada: contado | credito_7 | credito_15 | credito_30. */
  condicionPago?: string;
};

/**
 * Días que tarda cada proveedor, declarado o derivado del historial.
 *
 * El declarado (`Supplier.leadTimeDias`) gana: es lo que el bodeguero sabe. Si
 * no está, se promedia lo que tardaron sus órdenes recibidas — el dato ya
 * estaba en la base y nadie lo miraba.
 */
export async function getLeadTimePorProveedor(
  tenantId: string,
): Promise<Map<string, DatosProveedorParaCompra>> {
  const map = new Map<string, DatosProveedorParaCompra>();
  const [proveedores, ordenes] = await Promise.all([
    prisma.supplier.findMany({
      where: { tenantId },
      // `condicionPago` es lo pactado con ese proveedor: la OC que se genere
      // desde una sugerencia tiene que nacer con esa forma de pago, no con un
      // "contado" por defecto que después abre (o no) la deuda equivocada.
      select: { id: true, leadTimeDias: true, condicionPago: true },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        status: { in: ["recibido", "parcial"] },
        OR: [{ receivedDate: { not: null } }, { deliveryDate: { not: null } }],
      },
      select: { supplierId: true, createdAt: true, deliveryDate: true, receivedDate: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
  ]);

  const demorasPorProveedor = new Map<string, number[]>();
  for (const o of ordenes) {
    // ADR-377: `receivedDate` es cuándo llegó DE VERDAD; `deliveryDate` es lo
    // que el proveedor prometió. Para saber cuánto tarda manda lo primero —
    // medir la promesa mide sus intenciones, no su cumplimiento.
    const llegada = o.receivedDate ?? o.deliveryDate;
    if (!llegada) continue;
    const dias = (llegada.getTime() - o.createdAt.getTime()) / 86_400_000;
    // Una entrega «antes de pedirla» es un dato mal cargado, no un lead time.
    if (dias < 0 || dias > 180) continue;
    demorasPorProveedor.set(o.supplierId, [...(demorasPorProveedor.get(o.supplierId) ?? []), dias]);
  }

  for (const p of proveedores) {
    const condicionPago = p.condicionPago ?? undefined;
    if (p.leadTimeDias != null && p.leadTimeDias > 0) {
      map.set(p.id, { dias: p.leadTimeDias, origen: "declarado", condicionPago });
      continue;
    }
    const demoras = demorasPorProveedor.get(p.id);
    if (demoras && demoras.length > 0) {
      const promedio = demoras.reduce((s, d) => s + d, 0) / demoras.length;
      map.set(p.id, { dias: Math.max(Math.round(promedio), 1), origen: "historial", condicionPago });
    } else if (condicionPago) {
      // Sin lead time pero con condición pactada: se registra igual para poder
      // usar la forma de pago. `dias: null` —no 0— porque el consumidor hace
      // `lead?.dias ?? DEFAULT` y un cero se colaría como "entrega inmediata",
      // dejando el punto de reorden en el piso.
      map.set(p.id, { dias: null, origen: "default", condicionPago });
    }
  }
  return map;
}

/**
 * Última compra por producto — proveedor y precio de referencia.
 *
 * `distinct` + `take`: antes traía TODOS los `PurchaseItem` del tenant y
 * filtraba en memoria, así que el costo crecía con cada compra registrada.
 */
export async function getUltimaCompraPorProducto(
  tenantId: string,
  productIds: number[],
): Promise<{ mapa: Map<number, DbSugerenciaLastPurchase>; fallo: boolean }> {
  const mapa = new Map<number, DbSugerenciaLastPurchase>();
  if (productIds.length === 0) return { mapa, fallo: false };
  try {
    const lastPurchases = await prisma.purchaseItem.findMany({
      where: { productId: { in: productIds }, purchaseOrder: { tenantId } },
      distinct: ["productId"],
      orderBy: { purchaseOrder: { createdAt: "desc" } },
      take: productIds.length,
      select: {
        productId: true,
        unitCost: true,
        purchaseOrder: {
          select: { supplierId: true, supplierName: true, supplier: { select: { name: true } } },
        },
      },
    });

    for (const pi of lastPurchases) {
      mapa.set(pi.productId, {
        supplierId: pi.purchaseOrder.supplierId,
        supplierName: pi.purchaseOrder.supplier?.name ?? pi.purchaseOrder.supplierName,
        lastPrice: toNumOrZero(pi.unitCost),
      });
    }
  } catch (e) {
    // Schema drift en PurchaseItem (CLAUDE.md regla 14). Degrada, pero DEVUELVE
    // el fallo: antes el Map vacío hacía que la pantalla dijera «sin proveedor
    // anterior» sin distinguirlo de «la consulta se rompió».
    logger.warn("[compras-sugerencias.db] purchaseItem query failed (schema drift)", {
      err: e instanceof Error ? e.message : String(e),
    });
    return { mapa, fallo: true };
  }
  return { mapa, fallo: false };
}
