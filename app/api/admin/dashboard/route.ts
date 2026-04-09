import { NextRequest, NextResponse } from "next/server";
import {
  ProductsDB, OrdersDB, SalesDB, CustomersDB,
  PurchasesDB, PayablesDB, SuppliersDB, ReviewsDB,
} from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { getOrSet } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limit";
import { withDbRetry } from "@/lib/db-retry";

const DASHBOARD_TTL_SEC = 15; // Cached for 15 s — keeps polling cheap

export async function GET(req: NextRequest) {
  const rateLimited = applyRateLimit(req, "MODERATE", "admin-dashboard");
  if (rateLimited) return rateLimited;

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const cacheKey = `dashboard:${auth.tenantId}`;

    const payload = await getOrSet(cacheKey, DASHBOARD_TTL_SEC, async () => {
      const [products, orders, sales, customers, purchases, payables, suppliers, reviews] =
        await withDbRetry(() => Promise.all([
          ProductsDB.getAll(auth.tenantId),
          OrdersDB.getAll(auth.tenantId),
          SalesDB.getAll(auth.tenantId),
          CustomersDB.getAll(auth.tenantId),
          PurchasesDB.getAll(auth.tenantId),
          PayablesDB.getAll(auth.tenantId),
          SuppliersDB.getAll(auth.tenantId),
          ReviewsDB.getAll(auth.tenantId),
        ]));

      const lowStock = products.filter(
        (p) => typeof p.stock === "number" && typeof p.stockMin === "number" && p.stock <= p.stockMin
      ).length;
      const pendingOrders = orders.filter((o) => o.status === "pendiente").length;
      const overduePayables = payables.filter(
        (p) => p.status !== "pagado" && p.dueDate && new Date(p.dueDate) < new Date()
      ).length;

      return { products, orders, sales, customers, purchases, payables, suppliers, reviews, alerts: { lowStock, pendingOrders, overduePayables } };
    });

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" }, // SSR cache off; we manage TTL ourselves
    });
  } catch (e) {
    console.error("[dashboard] DB error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
