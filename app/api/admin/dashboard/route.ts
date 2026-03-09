import { NextRequest, NextResponse } from "next/server";
import {
  ProductsDB, OrdersDB, SalesDB, CustomersDB,
  PurchasesDB, PayablesDB, SuppliersDB, ReviewsDB,
} from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const [products, orders, sales, customers, purchases, payables, suppliers, reviews] =
      await Promise.all([
        ProductsDB.getAll(),
        OrdersDB.getAll(),
        SalesDB.getAll(),
        CustomersDB.getAll(),
        PurchasesDB.getAll(),
        PayablesDB.getAll(),
        SuppliersDB.getAll(),
        ReviewsDB.getAll(),
      ]);

    // Alert badges
    const lowStock = products.filter(
      (p) => typeof p.stock === "number" && typeof p.stockMin === "number" && p.stock <= p.stockMin
    ).length;
    const pendingOrders = orders.filter((o) => o.status === "pendiente").length;
    const overduePayables = payables.filter(
      (p) => p.status !== "pagado" && p.dueDate && new Date(p.dueDate) < new Date()
    ).length;

    return NextResponse.json({
      products,
      orders,
      sales,
      customers,
      purchases,
      payables,
      suppliers,
      reviews,
      alerts: { lowStock, pendingOrders, overduePayables },
    });
  } catch (e) {
    console.error("[dashboard] DB error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
