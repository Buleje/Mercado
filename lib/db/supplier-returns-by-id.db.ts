import "server-only";
import { prisma } from "@/lib/prisma";
import { DevolucionAnuladaError } from "@/lib/db/supplier-returns-anular.db";

/**
 * SupplierReturnsByIdDB
 *
 * Audit project-wide 2026-05-19 — métodos para /api/supplier-returns/[id]/route.ts.
 *
 * Maneja PATCH (cambio de estado) y DELETE de una devolución específica,
 * con aislamiento multi-tenant obligatorio (tenantId 1er argumento).
 *
 * NO modifica lib/db/supplier-returns.db.ts (archivo compartido protegido).
 */

const ESTADOS = ["PENDIENTE", "ENVIADA", "RESUELTA"] as const;
type Estado = (typeof ESTADOS)[number];

export { ESTADOS };

/**
 * Busca una devolución por id con sus items, asegurando tenantId.
 */
export async function getSupplierReturnById(tenantId: string, id: string) {
  return prisma.supplierReturn.findFirst({
    where: { id, tenantId },
    include: { items: true },
  });
}

/**
 * Actualiza el estado de una devolución y, al pasar a ENVIADA, saca la
 * mercadería del stock (ADR-379).
 *
 * Todo va en UNA transacción: si el kardex falla, el estado no cambia. Un
 * estado "enviada" con el stock intacto es justo el descuadre silencioso que
 * este módulo venía produciendo.
 *
 * Devuelve `{ devolucion, avisos }`, o `null` si no existe / no es del tenant.
 * Los avisos son para mostrarle al encargado lo que NO se pudo descontar: sin
 * ellos, un ítem escrito a mano desaparecería del inventario sin que nadie se
 * entere.
 */
export async function updateSupplierReturnEstado(
  tenantId: string,
  id: string,
  estado: Estado,
) {
  const avisos: string[] = [];

  const devolucion = await prisma.$transaction(async (tx) => {
    const actual = await tx.supplierReturn.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!actual) return null;
    // ANULADA es final (C55, 17-10): volver a ENVIADA sacaría el stock otra vez.
    if (actual.estado === "ANULADA") throw new DevolucionAnuladaError();

    // El stock sale UNA sola vez. No alcanza con mirar la transición: la API
    // acepta cualquier estado válido, así que ENVIADA → RESUELTA → ENVIADA
    // descontaría de nuevo. La marca en la fila lo vuelve imposible.
    // Y se RECLAMA con un compara-y-cambia antes de tocar el stock (10-10, security): dos
    // «Enviada» a la vez leían los dos `stockAplicadoAt = null` y descontaban dos veces. Con el
    // `updateMany` condicionado, la segunda transacción espera la fila, la vuelve a evaluar ya
    // marcada y su `count` es 0.
    const debeDescontar =
      estado === "ENVIADA" &&
      actual.stockAplicadoAt === null &&
      (await tx.supplierReturn.updateMany({
        where: { id, tenantId, stockAplicadoAt: null },
        data: { stockAplicadoAt: new Date() },
      })).count === 1;

    if (debeDescontar) {
      for (const item of actual.items) {
        if (item.productId == null) {
          avisos.push(`"${item.nombre}" se escribió a mano, así que no se descontó del inventario.`);
          continue;
        }
        const producto = await tx.product.findFirst({
          where: { id: item.productId, tenantId },
          select: { id: true, name: true, stock: true },
        });
        if (!producto) {
          avisos.push(`"${item.nombre}" ya no está en el catálogo: no se tocó el inventario.`);
          continue;
        }
        if (producto.stock === null) {
          avisos.push(`"${producto.name}" no lleva control de stock, así que no se descontó.`);
          continue;
        }

        // El stock del proyecto es entero; una cantidad con decimales se
        // redondea y se avisa, en vez de perder silenciosamente la fracción.
        const cantidad = Math.round(item.cantidad);
        if (cantidad !== item.cantidad) {
          avisos.push(`"${producto.name}": se descontaron ${cantidad} (la devolución dice ${item.cantidad}).`);
        }
        if (cantidad <= 0) continue;

        // `decrement` en la base, no «lo que leí − cantidad»: otra venta o ajuste del mismo
        // producto entre la lectura y la escritura no se pierde.
        const { stock: nuevoStockDb } = await tx.product.update({
          where: { id: producto.id },
          data: { stock: { decrement: cantidad } },
          select: { stock: true },
        });
        const nuevoStock = nuevoStockDb ?? 0;
        await tx.inventoryMovement.create({
          data: {
            productId: producto.id,
            // Tipo PROPIO: `devolucion` ya existe y significa lo contrario —
            // es la del cliente, que SUMA stock, y el kardex la lee como
            // entrada. Reusarla haría que el libro contara como ingreso una
            // mercadería que salió.
            type: "devolucion_proveedor",
            quantity: cantidad,
            previousStock: nuevoStock + cantidad,
            newStock: nuevoStock,
            reference: id,
            notes: `Devolución a ${actual.proveedorNombre} — ${actual.motivo}`,
            tenantId,
          },
        });

        if (nuevoStock < 0) {
          // Se registra igual: el kardex tiene que decir la verdad, y un saldo
          // negativo es la señal de que el inventario ya venía mal.
          avisos.push(`"${producto.name}" quedó en ${nuevoStock}: revisa el inventario, faltaba stock antes de esta devolución.`);
        }
      }
    }

    // `estado ≠ ANULADA` en el WHERE: una anulación que llegó entre la lectura y acá no se pisa.
    await tx.supplierReturn.updateMany({ where: { id, tenantId, estado: { not: "ANULADA" } }, data: { estado } });

    return tx.supplierReturn.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
  });

  if (!devolucion) return null;
  return { devolucion, avisos };
}

/*
 * El borrado definitivo (`deleteSupplierReturn`) se fue el 17-10 (C55): se
 * llevaba el registro y devolvía al inventario mercadería que quizá seguía en
 * el proveedor. Ahora se anula: `supplier-returns-anular.db.ts`.
 */
