import "server-only";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * Genera el texto del reporte diario de ventas para un tenant.
 * Formato WhatsApp: markdown (*bold*), emojis, sin HTML.
 *
 * Datos incluidos:
 *  - Total de ventas POS (Sale) del día
 *  - Número de transacciones
 *  - Ticket promedio
 *  - Top 3 productos por cantidad vendida
 *  - Clientes nuevos del día
 *  - Pedidos (Order) pendientes acumulados
 *  - Productos con stock bajo (<= 5)
 */
export async function generateDailyReport(tenantId: string): Promise<string> {
  const now = new Date();

  // Rango del día en curso (00:00:00 → 23:59:59.999 hora local del servidor)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // ── Consultas en paralelo ──────────────────────────────────────────────────
  const [salesAgg, salesItems, newCustomersCount, pendingOrdersCount, lowStockCount] =
    await Promise.all([
      // 1. Agregado de ventas del día
      prisma.sale.aggregate({
        where: {
          tenantId,
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
        _sum: { total: true },
        _count: { id: true },
      }),

      // 2. Items de ventas del día para calcular top productos
      prisma.saleItem.findMany({
        where: {
          sale: {
            tenantId,
            createdAt: { gte: startOfDay, lte: endOfDay },
          },
        },
        select: {
          name: true,
          quantity: true,
          price: true,
        },
      }),

      // 3. Clientes nuevos del día
      prisma.customer.count({
        where: {
          tenantId,
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
      }),

      // 4. Pedidos con status "pendiente" (acumulado, no solo hoy)
      prisma.order.count({
        where: {
          tenantId,
          status: "pendiente",
          deletedAt: null,
        },
      }),

      // 5. Productos activos con stock bajo (stock <= 5 o stockMin si definido)
      prisma.product.count({
        where: {
          tenantId,
          active: true,
          deletedAt: null,
          stock: { lte: 5 },
        },
      }),
    ]);

  // ── Cálculos ───────────────────────────────────────────────────────────────
  const totalVentas      = toNumOrZero(salesAgg._sum.total);
  const totalTransacciones = salesAgg._count.id;
  const ticketPromedio   = totalTransacciones > 0
    ? totalVentas / totalTransacciones
    : 0;

  // Agrupar items por nombre de producto y sumar cantidad + ingresos
  const productoMap = new Map<string, { qty: number; revenue: number }>();
  for (const item of salesItems) {
    const key  = item.name;
    const prev = productoMap.get(key) ?? { qty: 0, revenue: 0 };
    productoMap.set(key, {
      qty:     prev.qty + item.quantity,
      revenue: prev.revenue + toNumOrZero(item.price) * item.quantity,
    });
  }

  // Top 3 por cantidad vendida
  const top3 = [...productoMap.entries()]
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 3);

  // ── Fecha en español (Perú) ────────────────────────────────────────────────
  const fechaTexto = now.toLocaleDateString("es-PE", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
    year:    "numeric",
  });
  // Capitalizar primera letra
  const fechaDisplay = fechaTexto.charAt(0).toUpperCase() + fechaTexto.slice(1);

  // ── Top productos (1-3 líneas) ─────────────────────────────────────────────
  const topLineas = top3.length > 0
    ? top3
        .map(([nombre, { qty, revenue }], idx) => {
          const revenueStr = ` (S/${revenue.toFixed(2)})`;
          return `${idx + 1}. ${nombre} — ${qty} uds${idx === 0 ? revenueStr : ""}`;
        })
        .join("\n")
    : "   Sin ventas registradas";

  // ── Construcción del mensaje WhatsApp ─────────────────────────────────────
  const mensaje = [
    `📊 *Resumen del día — ${fechaDisplay}*`,
    ``,
    `💰 Ventas: S/${totalVentas.toFixed(2)} (${totalTransacciones} transacciones)`,
    `📈 Ticket promedio: S/${ticketPromedio.toFixed(2)}`,
    ``,
    `🏆 *Top productos:*`,
    topLineas,
    ``,
    `👥 Clientes nuevos: ${newCustomersCount}`,
    `📦 Pedidos pendientes: ${pendingOrdersCount}`,
    `⚠️ Stock bajo: ${lowStockCount} productos`,
    ``,
    `─────`,
    `Buleje ERP 🏪`,
  ].join("\n");

  return mensaje;
}
