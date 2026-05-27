import "server-only";

/**
 * lib/db/dashboard.db.ts
 *
 * Único proveedor de las 8 queries paralelas que sirven el dashboard
 * admin. Mueve los reads desde `app/api/admin/dashboard/route.ts` a
 * la capa lib/db (cumple regla crítica #1 del proyecto).
 *
 * Sin caché propio: el caller (`/api/admin/dashboard`) ya envuelve esto
 * con `getOrSet(...,15)` + `withDbRetry`. Mantenemos la separación de
 * responsabilidades — esta clase sólo lee, no decide TTL ni invalidate.
 *
 * El shape mapping (Decimal→number, ISO dates, optional spreading) sigue
 * en el route para no inflar este archivo y porque es lógica de presentación.
 */

import { prisma } from "@/lib/prisma";

export const DashboardDB = {
  /**
   * Trae los 8 arrays raw que el dashboard admin necesita para construir
   * KPIs, alertas y tablas. Tenant-scoped via `tenantId` en cada `where`.
   *
   * Devuelve un tuple en el orden exacto que el route espera para hacer
   * destructuring directo. Cualquier campo nuevo agregado a la query
   * debe quedar reflejado en el caller también — tests mocked-payload-shape
   * cubren esto.
   */
  async fetchAll(tenantId: string) {
    return Promise.all([
      // 1. Products — fields used por dashboard (stock projection, charts, cost calc)
       
      prisma.product.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true, name: true, category: true,
          price: true, costPrice: true,
          image: true, unit: true,
          stock: true, stockMin: true, stockMax: true,
          active: true,
        },
        orderBy: { id: "asc" },
      }),

      // 2. Orders — items necesarios para cost/revenue calc
      // Round 28 P0 (DB profundo audit): faltaba `deletedAt: null`. Sin él
      // el dashboard sumaba revenue de pedidos cancelados/eliminados — KPIs
      // de revenue/ticket promedio inflados.
      // Brandon 2026-05-16 P0 (perf audit): agregado `take: 500` — antes
      // traía TODOS los pedidos históricos (10k+ en tenants activos) cada
      // 15s de polling. Esto causaba OOM en serverless workers y latencia
      // de 2-3s. 500 cubre ~3-6 meses de actividad típica, suficiente para
      // todos los charts del dashboard.
       
      prisma.order.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true,
          customerName: true, customerPhone: true,
          customerLocation: true, customerReference: true,
          total: true, status: true,
          paymentMethod: true,
          createdAt: true, updatedAt: true,
          items: {
            select: {
              productId: true, name: true,
              price: true, costPrice: true,
              quantity: true, unit: true, image: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),

      // 3. Sales — items necesarios para revenue/cost charts
      // Brandon 2026-05-16 P0 (perf audit): `take: 1000` agregado. Sales
      // POS son más volumétricas que orders marketplace — 1000 cubre ~1-3
      // meses de un tenant activo. Charts solo usan últimos 30d/90d.
       
      prisma.sale.findMany({
        where: { tenantId },
        select: {
          id: true, total: true, totalCogs: true,
          payment: true, amountPaid: true, change: true,
          customerPhone: true, cashierId: true, createdAt: true,
          comprobanteTipo: true, comprobanteRuc: true,
          descuentoMonto: true, descuentoPorcentaje: true,
          paymentDetails: true,
          items: {
            select: {
              productId: true, name: true,
              price: true, costPrice: true,
              quantity: true, unit: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),

      // 4. Customers — sin relation `locations` (dashboard no usa saved locations)
      // Brandon 2026-05-16 P0 (perf audit): `take: 2000` agregado. Customers
      // ordenados por `updatedAt desc` — los 2000 más recientemente activos
      // cubren CRM dashboard sin OOM. Tenants con 10k+ customers requieren
      // paginación dedicada en módulo Clientes (no en dashboard general).
       
      prisma.customer.findMany({
        where: { tenantId },
        select: {
          phone: true, name: true, location: true,
          reference: true, createdAt: true, updatedAt: true,
          loyaltyPoints: true, loyaltyTier: true,
          totalSpent: true, creditBalance: true, creditLimit: true,
          activeLocationId: true, birthday: true,
          aiNotes: true, aiNotesDate: true,
          privateNotes: true, referralCode: true, referredBy: true,
          tags: true, lat: true, lng: true,
          notifOrderUpdates: true, notifPromotions: true, notifRestock: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 2000,
      }),

      // 5. Purchases — items necesarios para purchase analysis
       
      prisma.purchaseOrder.findMany({
        where: { tenantId },
        select: {
          id: true, supplierId: true, supplierName: true,
          total: true, status: true,
          notes: true, paymentMethod: true,
          deliveryDate: true, discount: true,
          createdAt: true, updatedAt: true,
          items: {
            select: {
              productId: true, name: true,
              quantity: true, unitCost: true, unit: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),

      // 6. Payables — sin relation `payments` (no la usa el dashboard)
       
      prisma.payable.findMany({
        where: { tenantId },
        select: {
          id: true, supplierId: true, supplierName: true,
          purchaseOrderId: true, description: true,
          amount: true, paidAmount: true,
          status: true, dueDate: true, createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),

      // 7. Suppliers — campos mínimos
       
      prisma.supplier.findMany({
        where: { tenantId },
        select: {
          id: true, name: true, phone: true,
          email: true, address: true, notes: true, createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),

      // 8. Reviews — todos los campos son scalars, sin relations
      // Round 7 fix: cap a 1000. Tenants con muchos reviews evitan OOM en dashboard load.
      // Round 28 P0 (DB profundo audit): faltaba `deletedAt: null` — reseñas
      // soft-deleted por moderación volvían a aparecer en KPIs.
       
      prisma.review.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true, name: true, location: true,
          text: true, rating: true, phone: true,
          productId: true, status: true, date: true,
          adminReply: true, adminReplyDate: true,
        },
        orderBy: { date: "desc" },
        take: 1000,
      }),
    ]);
  },
};
