export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server";
import { ProductsDB, CustomersDB, OrdersDB, ReviewsDB, SettingsDB, SuppliersDB, PurchasesDB, SalesDB, PromotionsDB, PayablesDB } from "@/lib/jsondb";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const tenantId = auth.tenantId;
  const [products, customers, orders, reviews, settings, suppliers, purchases, sales, promotions, payables] = await Promise.all([
    ProductsDB.getAll(tenantId),
    CustomersDB.getAll(tenantId),
    OrdersDB.getAll(tenantId),
    ReviewsDB.getAll(tenantId),
    SettingsDB.get(),
    SuppliersDB.getAll(tenantId),
    PurchasesDB.getAll(tenantId),
    SalesDB.getAll(tenantId),
    PromotionsDB.getAll(tenantId),
    PayablesDB.getAll(tenantId),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    version: "1.0",
    data: { products, customers, orders, reviews, settings, suppliers, purchases, sales, promotions, payables },
  };

  const requestId = req.headers.get("x-request-id") ?? undefined;
  logActivity("Backup", "configuracion", "Backup de datos descargado", undefined, "admin", requestId).catch(() => {});

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="bodega-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
