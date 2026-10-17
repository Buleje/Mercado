import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lineaDeAnulacion, lineaDeReingreso, sumarANotas, type StockAlAnular } from "@/lib/compras/devoluciones-proveedor";

/**
 * Anular, reingresar y valorar una devolución a proveedor (auditoría Compras
 * C55/C51, 17-10). Reemplaza al borrado definitivo, que se llevaba el registro
 * y además devolvía al inventario stock que quizá seguía en el proveedor.
 *
 * - Anular conserva la fila (estado ANULADA) con el motivo, quién y cuándo en
 *   `notas`. Si la mercadería ya había salido, vuelve al inventario SÓLO si la
 *   persona dice que volvió al almacén; si sigue afuera, el stock no cambia.
 * - `stockAplicadoAt` = «hay stock afuera por esta devolución». Volver al
 *   almacén lo limpia con un compara-y-cambia: dos clics no suman dos veces.
 * - ANULADA es final: no vuelve a ningún estado (si volviera a ENVIADA, el
 *   stock saldría otra vez).
 */

export class DevolucionAnuladaError extends Error {
  constructor() {
    super("Esta devolución está anulada: ya no cambia.");
    this.name = "DevolucionAnuladaError";
  }
}

export class NadaQueReingresarError extends Error {
  constructor() {
    super("No hay mercadería de esta devolución fuera del almacén.");
    this.name = "NadaQueReingresarError";
  }
}

type Tx = Prisma.TransactionClient;
type DevolucionConItems = NonNullable<Awaited<ReturnType<typeof leer>>>;

function leer(tx: Tx, tenantId: string, id: string) {
  return tx.supplierReturn.findFirst({ where: { id, tenantId }, include: { items: true } });
}

/**
 * Devuelve al inventario lo que esta devolución sacó. Sólo se llama después de
 * ganar el compara-y-cambia sobre `stockAplicadoAt`.
 */
async function volverAlStock(tx: Tx, tenantId: string, dev: DevolucionConItems, nota: string, usuario: string, avisos: string[]) {
  for (const item of dev.items) {
    if (item.productId == null) continue;
    const producto = await tx.product.findFirst({ where: { id: item.productId, tenantId }, select: { id: true, name: true, stock: true } });
    if (!producto) {
      avisos.push(`"${item.nombre}" ya no está en el catálogo: no se tocó el inventario.`);
      continue;
    }
    if (producto.stock === null) continue;
    // Misma regla que al sacarlo: el stock es entero, lo que salió fue el redondeo.
    const cantidad = Math.round(item.cantidad);
    if (cantidad <= 0) continue;
    const { stock } = await tx.product.update({
      where: { id: producto.id },
      data: { stock: { increment: cantidad } },
      select: { stock: true },
    });
    const nuevoStock = stock ?? 0;
    await tx.inventoryMovement.create({
      data: {
        productId: producto.id,
        // Entra de vuelta: contracara del `devolucion_proveedor` que lo sacó.
        type: "ajuste_positivo",
        quantity: cantidad,
        previousStock: nuevoStock - cantidad,
        newStock: nuevoStock,
        reference: dev.id,
        notes: nota,
        tenantId,
        createdBy: usuario,
      },
    });
  }
}

export async function anularSupplierReturn(
  tenantId: string,
  id: string,
  p: { motivo: string; volvioAlAlmacen: boolean; usuario: string },
) {
  const avisos: string[] = [];
  const devolucion = await prisma.$transaction(async (tx) => {
    const actual = await leer(tx, tenantId, id);
    if (!actual) return null;
    if (actual.estado === "ANULADA") throw new DevolucionAnuladaError();

    let stock: StockAlAnular = "no-salio";
    if (actual.stockAplicadoAt !== null) {
      stock = "sigue-fuera";
      if (p.volvioAlAlmacen) {
        const gane = (await tx.supplierReturn.updateMany({
          where: { id, tenantId, stockAplicadoAt: { not: null } },
          data: { stockAplicadoAt: null },
        })).count === 1;
        if (gane) {
          await volverAlStock(tx, tenantId, actual, `Se anuló la devolución a ${actual.proveedorNombre}: la mercadería volvió al almacén`, p.usuario, avisos);
          stock = "volvio";
        }
      }
    }

    const notas = sumarANotas(actual.notas, lineaDeAnulacion({ fecha: new Date(), usuario: p.usuario, motivo: p.motivo, stock }));
    // `estado: { not: ANULADA }` en el WHERE: dos anulaciones a la vez no escriben dos motivos.
    const { count } = await tx.supplierReturn.updateMany({
      where: { id, tenantId, estado: { not: "ANULADA" } },
      data: { estado: "ANULADA", notas },
    });
    if (count !== 1) throw new DevolucionAnuladaError();
    return leer(tx, tenantId, id);
  });
  if (!devolucion) return null;
  return { devolucion, avisos };
}

/** Una devolución anulada cuya mercadería seguía afuera: volvió al almacén. */
export async function reingresarSupplierReturn(tenantId: string, id: string, usuario: string) {
  const avisos: string[] = [];
  const devolucion = await prisma.$transaction(async (tx) => {
    const actual = await leer(tx, tenantId, id);
    if (!actual) return null;
    if (actual.estado !== "ANULADA" || actual.stockAplicadoAt === null) throw new NadaQueReingresarError();
    const gane = (await tx.supplierReturn.updateMany({
      where: { id, tenantId, estado: "ANULADA", stockAplicadoAt: { not: null } },
      data: { stockAplicadoAt: null, notas: sumarANotas(actual.notas, lineaDeReingreso({ fecha: new Date(), usuario })) },
    })).count === 1;
    if (!gane) throw new NadaQueReingresarError();
    await volverAlStock(tx, tenantId, actual, `La mercadería de la devolución anulada a ${actual.proveedorNombre} volvió al almacén`, usuario, avisos);
    return leer(tx, tenantId, id);
  });
  if (!devolucion) return null;
  return { devolucion, avisos };
}

/**
 * Pone el costo a los ítems que quedaron «pendientes de valoración» (C51). Sólo
 * los que no tienen costo: uno ya valorado no se pisa (el que vino de la orden
 * es el dato). No toca la fila de la devolución: su `updatedAt` mide desde
 * cuándo espera respuesta.
 */
export async function valorarItemsSupplierReturn(
  tenantId: string,
  id: string,
  valores: Array<{ itemId: number; precioUnitario: number }>,
) {
  return prisma.$transaction(async (tx) => {
    const actual = await leer(tx, tenantId, id);
    if (!actual) return null;
    if (actual.estado === "ANULADA") throw new DevolucionAnuladaError();
    let valorados = 0;
    for (const v of valores) {
      const { count } = await tx.supplierReturnItem.updateMany({
        where: { id: v.itemId, returnId: id, precioUnitario: null },
        data: { precioUnitario: v.precioUnitario },
      });
      valorados += count;
    }
    const devolucion = await leer(tx, tenantId, id);
    return devolucion ? { devolucion, valorados } : null;
  });
}
