import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getOrSet } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limit";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toNumOrZero } from "@/lib/decimal-utils";

const DASHBOARD_TTL_SEC = 15; // Cached for 15 s — keeps polling cheap

export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "MODERATE", "admin-dashboard");
  if (rateLimited) return rateLimited;

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const tid = auth.tenantId;
    const cacheKey = `dashboard:${tid}`;

    const payload = await getOrSet(cacheKey, DASHBOARD_TTL_SEC, async () => {
      const [
        rawProducts,
        rawOrders,
        rawSales,
        rawCustomers,
        rawPurchases,
        rawPayables,
        rawSuppliers,
        rawReviews,
      ] = await withDbRetry(() =>
        Promise.all([
          // Products — only fields used by the dashboard (stock projection, category charts, cost calc)
          prisma.product.findMany({
            where: { tenantId: tid, deletedAt: null },
            select: {
              id: true, name: true, category: true,
              price: true, costPrice: true,
              image: true, unit: true,
              stock: true, stockMin: true, stockMax: true,
              active: true,
            },
            orderBy: { id: "asc" },
          }),

          // Orders — items needed for cost/revenue calc; skip heavy fields not used in dashboard
          prisma.order.findMany({
            where: { tenantId: tid },
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
          }),

          // Sales — items needed for revenue/cost charts
          prisma.sale.findMany({
            where: { tenantId: tid },
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
          }),

          // Customers — skip the `locations` relation (unused in dashboard)
          prisma.customer.findMany({
            where: { tenantId: tid },
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
          }),

          // Purchases — items needed for purchase analysis
          prisma.purchaseOrder.findMany({
            where: { tenantId: tid },
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

          // Payables — skip the `payments` relation (unused in dashboard)
          prisma.payable.findMany({
            where: { tenantId: tid },
            select: {
              id: true, supplierId: true, supplierName: true,
              purchaseOrderId: true, description: true,
              amount: true, paidAmount: true,
              status: true, dueDate: true, createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          }),

          // Suppliers — minimal fields (dashboard only uses .length + basic display)
          prisma.supplier.findMany({
            where: { tenantId: tid },
            select: {
              id: true, name: true, phone: true,
              email: true, address: true, notes: true, createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          }),

          // Reviews — all fields are small scalars, no relations needed
          prisma.review.findMany({
            where: { tenantId: tid },
            select: {
              id: true, name: true, location: true,
              text: true, rating: true, phone: true,
              productId: true, status: true, date: true,
              adminReply: true, adminReplyDate: true,
            },
            orderBy: { date: "desc" },
          }),
        ])
      );

      // ── Shape into the exact form the frontend expects ────────────────────────

      const products = rawProducts.map((p) => ({
        id: p.id, name: p.name, category: p.category,
        price: toNumOrZero(p.price),
        ...(p.costPrice != null && { costPrice: toNumOrZero(p.costPrice) }),
        image: p.image, unit: p.unit,
        ...(p.stock     != null && { stock:    p.stock }),
        ...(p.stockMin  != null && { stockMin: p.stockMin }),
        ...(p.stockMax  != null && { stockMax: p.stockMax }),
        active: p.active,
      }));

      const orders = rawOrders.map((o) => ({
        id: o.id,
        customer: {
          name: o.customerName,
          ...(o.customerPhone && { phone: o.customerPhone }),
          location: o.customerLocation,
          reference: o.customerReference,
        },
        total: toNumOrZero(o.total),
        status: o.status,
        paymentMethod: o.paymentMethod ?? undefined,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        items: o.items.map((i) => ({
          id: i.productId ?? 0,
          name: i.name,
          price: toNumOrZero(i.price),
          ...(i.costPrice != null && { costPrice: toNumOrZero(i.costPrice) }),
          quantity: i.quantity,
          unit: i.unit,
          image: i.image,
        })),
      }));

      const sales = rawSales.map((s) => ({
        id: s.id,
        total: toNumOrZero(s.total),
        ...(s.totalCogs != null && { totalCogs: toNumOrZero(s.totalCogs) }),
        payment: s.payment,
        amountPaid: toNumOrZero(s.amountPaid),
        change: toNumOrZero(s.change),
        ...(s.customerPhone && { customerPhone: s.customerPhone }),
        ...(s.cashierId    && { cashierId:    s.cashierId }),
        createdAt: s.createdAt.toISOString(),
        ...(s.comprobanteTipo  && { comprobanteTipo:  s.comprobanteTipo }),
        ...(s.comprobanteRuc   && { comprobanteRuc:   s.comprobanteRuc }),
        ...(s.descuentoMonto   != null && { descuentoMonto:   toNumOrZero(s.descuentoMonto) }),
        ...(s.descuentoPorcentaje != null && { descuentoPorcentaje: toNumOrZero(s.descuentoPorcentaje) }),
        ...(s.paymentDetails   && { paymentDetails: s.paymentDetails }),
        items: s.items.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: toNumOrZero(i.price),
          ...(i.costPrice != null && { costPrice: toNumOrZero(i.costPrice) }),
          quantity: i.quantity,
          unit: i.unit,
        })),
      }));

      const customers = rawCustomers.map((c) => ({
        phone: c.phone, name: c.name,
        location: c.location, reference: c.reference,
        locations: [], // kept for type-compat; dashboard does not use saved locations
        activeLocationId: c.activeLocationId,
        loyaltyPoints: c.loyaltyPoints, loyaltyTier: c.loyaltyTier,
        totalSpent: toNumOrZero(c.totalSpent),
        creditBalance: toNumOrZero(c.creditBalance),
        creditLimit: toNumOrZero(c.creditLimit),
        notifOrderUpdates: c.notifOrderUpdates,
        notifPromotions: c.notifPromotions,
        notifRestock: c.notifRestock,
        ...(c.birthday    && { birthday:    c.birthday }),
        ...(c.aiNotes     && { aiNotes:     c.aiNotes }),
        ...(c.aiNotesDate && { aiNotesDate: c.aiNotesDate }),
        ...(c.privateNotes && { privateNotes: c.privateNotes }),
        ...(c.referralCode && { referralCode: c.referralCode }),
        ...(c.referredBy   && { referredBy:   c.referredBy }),
        tags: c.tags,
        lat: c.lat ?? undefined, lng: c.lng ?? undefined,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }));

      const purchases = rawPurchases.map((p) => ({
        id: p.id, supplierId: p.supplierId, supplierName: p.supplierName,
        total: toNumOrZero(p.total),
        status: p.status,
        ...(p.notes         && { notes:         p.notes }),
        ...(p.paymentMethod && { paymentMethod: p.paymentMethod }),
        ...(p.deliveryDate  && { deliveryDate:  p.deliveryDate.toISOString() }),
        ...(p.discount != null && { discount: toNumOrZero(p.discount) }),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        items: p.items.map((i) => ({
          productId: i.productId, name: i.name,
          quantity: i.quantity, unitCost: toNumOrZero(i.unitCost), unit: i.unit,
        })),
      }));

      const payables = rawPayables.map((p) => ({
        id: p.id, supplierId: p.supplierId, supplierName: p.supplierName,
        ...(p.purchaseOrderId && { purchaseOrderId: p.purchaseOrderId }),
        description: p.description,
        amount: toNumOrZero(p.amount),
        paidAmount: toNumOrZero(p.paidAmount),
        status: p.status,
        dueDate: p.dueDate.toISOString(),
        payments: [], // kept for type-compat; dashboard uses only status/dueDate/amount
        createdAt: p.createdAt.toISOString(),
      }));

      const suppliers = rawSuppliers.map((s) => ({
        id: s.id, name: s.name,
        ...(s.phone   && { phone:   s.phone }),
        ...(s.email   && { email:   s.email }),
        ...(s.address && { address: s.address }),
        ...(s.notes   && { notes:   s.notes }),
        createdAt: s.createdAt.toISOString(),
      }));

      const reviews = rawReviews.map((r) => ({
        id: r.id, name: r.name, location: r.location,
        text: r.text, rating: r.rating,
        phone: r.phone, productId: r.productId ?? undefined,
        status: r.status as "pending" | "approved" | "rejected",
        date: r.date.toISOString(),
        ...(r.adminReply     && { adminReply:     r.adminReply }),
        ...(r.adminReplyDate && { adminReplyDate: r.adminReplyDate.toISOString() }),
      }));

      // ── Dashboard alerts (computed server-side, no JS array scan on client) ──
      const now = new Date();
      const lowStock       = products.filter((p) => typeof p.stock === "number" && typeof p.stockMin === "number" && p.stock <= p.stockMin).length;
      const pendingOrders  = orders.filter((o) => o.status === "pendiente").length;
      const overduePayables = payables.filter((p) => p.status !== "pagado" && new Date(p.dueDate) < now).length;

      return {
        products, orders, sales, customers,
        purchases, payables, suppliers, reviews,
        alerts: { lowStock, pendingOrders, overduePayables },
      };
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" }, // SSR cache off; we manage TTL ourselves
    });
  } catch (e) {
    logger.error("[dashboard] DB error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
