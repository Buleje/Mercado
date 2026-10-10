import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { esCierreAutomatico } from "@/lib/caja/arqueo-veredicto";
import { minimoGlobalDelNegocio } from "@/lib/inventario/stock-minimo.server";

/**
 * AvisosCampanaDB — las lecturas del generador de avisos de la campana
 * (`lib/notification-generators.ts`, INTEG-01 09-10).
 *
 * Sólo lectura y todas con `tenantId` primero y dentro del WHERE: antes el
 * generador llamaba a Prisma directo y «¿cuándo compró este cliente por última
 * vez?» buscaba ventas por teléfono en TODOS los negocios.
 * Los montos salen como `number` (los Decimal se comparaban como texto:
 * `"9.50" < "10.00"` es falso).
 */

export interface FiadoVencidoAviso {
  id: string;
  cliente: string;
  saldo: number;
}

export interface StockBajoAviso {
  total: number;
  agotados: number;
  muestra: Array<{ id: number; name: string; stock: number }>;
}

export interface ClienteVipAviso {
  phone: string;
  name: string;
  totalSpent: number;
  /** Última venta o pedido (no cancelado) EN ESTE negocio; null = nunca. */
  ultimaActividad: Date | null;
}

export const AvisosCampanaDB = {
  async fiadosVencidos(tenantId: string, ahora: Date, take = 10): Promise<FiadoVencidoAviso[]> {
    const rows = await prisma.fiado.findMany({
      where: { tenantId, status: "ACTIVO", fechaVence: { lt: ahora } },
      select: { id: true, saldo: true, customerId: true, customer: { select: { name: true } } },
      orderBy: { fechaVence: "asc" },
      take,
    });
    return rows.map((f) => ({
      id: f.id,
      cliente: f.customer?.name || f.customerId,
      saldo: toNumOrZero(f.saldo),
    }));
  },

  /** Stock bajo con la regla única (propio o `Settings.globalMinStock`), como Inicio e Inventario. */
  async stockBajo(tenantId: string, muestra = 5): Promise<StockBajoAviso> {
    const minimoGlobal = await minimoGlobalDelNegocio(tenantId);
    const [conteo, filas] = await Promise.all([
      prisma.$queryRaw<Array<{ total: bigint; agotados: bigint }>>`
        SELECT COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE "stock" <= 0)::bigint AS agotados
        FROM "Product"
        WHERE "tenantId" = ${tenantId}
          AND "active" = true
          AND "deletedAt" IS NULL
          AND "stock" IS NOT NULL
          AND "stock" <= COALESCE("stockMin", ${minimoGlobal}::int)
      `,
      prisma.$queryRaw<Array<{ id: number; name: string; stock: number }>>`
        SELECT "id", "name", "stock"
        FROM "Product"
        WHERE "tenantId" = ${tenantId}
          AND "active" = true
          AND "deletedAt" IS NULL
          AND "stock" IS NOT NULL
          AND "stock" <= COALESCE("stockMin", ${minimoGlobal}::int)
        ORDER BY "stock" ASC, "name" ASC
        LIMIT ${muestra}
      `,
    ]);
    return {
      total: Number(conteo[0]?.total ?? 0),
      agotados: Number(conteo[0]?.agotados ?? 0),
      muestra: filas.map((p) => ({ id: Number(p.id), name: p.name, stock: Number(p.stock) })),
    };
  },

  async turnosAbiertosAntesDe(
    tenantId: string,
    limite: Date,
  ): Promise<Array<{ id: string; abrioEn: Date; quien: string }>> {
    const rows = await prisma.turno.findMany({
      where: { tenantId, status: "ABIERTO", abrioEn: { lt: limite } },
      select: { id: true, abrioEn: true, adminUser: { select: { name: true, username: true } } },
      orderBy: { abrioEn: "asc" },
      take: 10,
    });
    return rows.map((t) => ({
      id: t.id,
      abrioEn: t.abrioEn,
      quien: t.adminUser?.name || t.adminUser?.username || "",
    }));
  },

  async cuentasPorPagarHasta(
    tenantId: string,
    hasta: Date,
    take = 10,
  ): Promise<Array<{ id: string; supplierName: string; amount: number; dueDate: Date }>> {
    const rows = await prisma.payable.findMany({
      where: { tenantId, status: { not: "pagado" }, dueDate: { lte: hasta } },
      select: { id: true, supplierName: true, amount: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take,
    });
    return rows.map((p) => ({ ...p, amount: toNumOrZero(p.amount) }));
  },

  /** Cajas cerradas desde `desde` con diferencia; sin los cierres automáticos (nadie contó). */
  async cajasCerradasConDiferencia(
    tenantId: string,
    desde: Date,
    take = 10,
  ): Promise<Array<{ id: string; difference: number; closedAt: Date | null }>> {
    const rows = await prisma.cashRegister.findMany({
      where: { tenantId, status: "cerrada", closedAt: { gte: desde }, difference: { not: null } },
      select: { id: true, difference: true, closedAt: true, notes: true },
      orderBy: { closedAt: "desc" },
      take,
    });
    return rows
      .filter((r) => !esCierreAutomatico(r.notes))
      .map((r) => ({ id: r.id, difference: toNumOrZero(r.difference), closedAt: r.closedAt }));
  },

  async resumenesDiariosDesde(
    tenantId: string,
    desde: Date,
    take = 5,
  ): Promise<Array<{ id: string; diferenciaCaja: number; fecha: Date; creadoPor: string }>> {
    const rows = await prisma.dailySummary.findMany({
      where: { tenantId, createdAt: { gte: desde } },
      select: { id: true, diferenciaCaja: true, fecha: true, creadoPor: true },
      orderBy: { createdAt: "desc" },
      take,
    });
    return rows.map((s) => ({ ...s, diferenciaCaja: toNumOrZero(s.diferenciaCaja) }));
  },

  /**
   * Clientes que más gastaron, con su última compra EN ESTE negocio: dos
   * `groupBy` por teléfono en vez de 2 consultas por cliente (antes 100 idas a
   * la base y sin `tenantId`).
   */
  async clientesVipConUltimaActividad(
    tenantId: string,
    minimoGastado: number,
    take = 50,
  ): Promise<ClienteVipAviso[]> {
    const vips = await prisma.customer.findMany({
      where: { tenantId, totalSpent: { gte: minimoGastado } },
      select: { phone: true, name: true, totalSpent: true },
      orderBy: { totalSpent: "desc" },
      take,
    });
    if (vips.length === 0) return [];
    const phones = vips.map((c) => c.phone);
    const [ventas, pedidos] = await Promise.all([
      prisma.sale.groupBy({
        by: ["customerPhone"],
        where: { tenantId, customerPhone: { in: phones } },
        _max: { createdAt: true },
      }),
      prisma.order.groupBy({
        by: ["customerPhone"],
        where: { tenantId, customerPhone: { in: phones }, status: { not: "cancelado" } },
        _max: { createdAt: true },
      }),
    ]);
    const ultima = new Map<string, Date>();
    for (const r of [...ventas, ...pedidos]) {
      const fecha = r._max.createdAt;
      if (!r.customerPhone || !fecha) continue;
      const previa = ultima.get(r.customerPhone);
      if (!previa || fecha > previa) ultima.set(r.customerPhone, fecha);
    }
    return vips.map((c) => ({
      phone: c.phone,
      name: c.name,
      totalSpent: toNumOrZero(c.totalSpent),
      ultimaActividad: ultima.get(c.phone) ?? null,
    }));
  },

  /** Bajadas de precio desde `desde`: la más reciente por producto. */
  async bajadasDePrecio(
    tenantId: string,
    desde: Date,
    take = 20,
  ): Promise<Array<{ productId: number; name: string; oldPrice: number; newPrice: number }>> {
    const rows = await prisma.priceHistory.findMany({
      where: { tenantId, changedAt: { gte: desde }, product: { tenantId, active: true, deletedAt: null } },
      select: { productId: true, oldPrice: true, newPrice: true, product: { select: { name: true } } },
      orderBy: { changedAt: "desc" },
      take: take * 3,
    });
    const vistos = new Set<number>();
    const out: Array<{ productId: number; name: string; oldPrice: number; newPrice: number }> = [];
    for (const r of rows) {
      if (vistos.has(r.productId)) continue;
      vistos.add(r.productId);
      const oldPrice = toNumOrZero(r.oldPrice);
      const newPrice = toNumOrZero(r.newPrice);
      if (newPrice < oldPrice) out.push({ productId: r.productId, name: r.product.name, oldPrice, newPrice });
      if (out.length >= take) break;
    }
    return out;
  },

  async ventasYGastos(
    tenantId: string,
    ventasDesde: Date,
    gastosDesde: Date,
  ): Promise<{ ventas: number; gastos: number }> {
    const [ventas, gastos] = await Promise.all([
      prisma.sale.aggregate({ where: { tenantId, createdAt: { gte: ventasDesde } }, _sum: { total: true } }),
      prisma.expense.aggregate({ where: { tenantId, date: { gte: gastosDesde } }, _sum: { amount: true } }),
    ]);
    return { ventas: toNumOrZero(ventas._sum.total), gastos: toNumOrZero(gastos._sum.amount) };
  },

  /** Productos activos que se venden por debajo de su costo, los de mayor pérdida primero. */
  async productosBajoCosto(
    tenantId: string,
    take = 5,
  ): Promise<Array<{ id: number; name: string; price: number; costPrice: number }>> {
    const rows = await prisma.$queryRaw<Array<{ id: number; name: string; price: number; costPrice: number }>>`
      SELECT "id", "name", "price"::float8 AS "price", "costPrice"::float8 AS "costPrice"
      FROM "Product"
      WHERE "tenantId" = ${tenantId}
        AND "active" = true
        AND "deletedAt" IS NULL
        AND "costPrice" > 0
        AND "price" < "costPrice"
      ORDER BY ("costPrice" - "price") DESC
      LIMIT ${take}
    `;
    return rows.map((p) => ({
      id: Number(p.id),
      name: p.name,
      price: Number(p.price),
      costPrice: Number(p.costPrice),
    }));
  },

  async ventasParaAgradecer(
    tenantId: string,
    desde: Date,
    minimo: number,
    take = 10,
  ): Promise<Array<{ id: string; total: number; phone: string; cliente: string }>> {
    const rows = await prisma.sale.findMany({
      where: { tenantId, createdAt: { gte: desde }, total: { gte: minimo }, customerPhone: { not: null } },
      select: { id: true, total: true, customerPhone: true, customer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
    return rows.map((s) => ({
      id: s.id,
      total: toNumOrZero(s.total),
      phone: (s.customerPhone ?? "").replace(/\D/g, ""),
      cliente: s.customer?.name || "Cliente",
    }));
  },
};
