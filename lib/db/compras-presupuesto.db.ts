import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { ExpenseBudgetDB } from "@/lib/db/expense-budget.db";
import {
  ESTADOS_POR_RECIBIR,
  ESTADOS_RECIBIDOS,
  armarPresupuestoCompras,
  esCategoriaDeCompras,
  mesDeLima,
  proveedorDeCategoria,
  type PresupuestoCompras,
} from "@/lib/compras/presupuesto-compras";

/**
 * Compras › Órdenes y recepción › Presupuesto (N02): lo comprado en el mes de
 * Lima contra el techo de compras guardado en `ExpenseBudget` (categorías
 * «compras:…», ver `lib/compras/presupuesto-compras.ts`). La cuenta se hace
 * acá, en el servidor; la pantalla sólo la dibuja.
 */
export async function getPresupuestoCompras(tenantId: string, hoy = new Date()): Promise<PresupuestoCompras> {
  const { clave, desde, hasta } = mesDeLima(hoy);
  const [ordenes, todos] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        createdAt: { gte: desde, lt: hasta },
        status: { in: [...ESTADOS_RECIBIDOS, ...ESTADOS_POR_RECIBIR] },
      },
      select: { supplierId: true, supplierName: true, total: true, status: true },
    }),
    ExpenseBudgetDB.getAll(tenantId),
  ]);
  const techos = todos.filter((t) => esCategoriaDeCompras(t.category));

  // Nombres de los proveedores con techo y sin órdenes este mes.
  const conOrden = new Set(ordenes.map((o) => o.supplierId));
  const faltan = techos
    .map((t) => proveedorDeCategoria(t.category))
    .filter((id): id is string => !!id && !conOrden.has(id));
  const nombres: Record<string, string> = {};
  if (faltan.length > 0) {
    const filas = await prisma.supplier.findMany({
      where: { tenantId, id: { in: faltan } },
      select: { id: true, name: true },
    });
    for (const f of filas) nombres[f.id] = f.name;
  }

  return armarPresupuestoCompras(
    clave,
    ordenes.map((o) => ({ supplierId: o.supplierId, supplierName: o.supplierName, total: toNumOrZero(o.total), status: String(o.status) })),
    techos.map((t) => ({ category: t.category, montoMensual: t.montoMensual })),
    nombres,
  );
}
